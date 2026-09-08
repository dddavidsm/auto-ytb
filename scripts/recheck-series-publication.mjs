import { spawn } from 'node:child_process';
import { NodePostgresSqlClient } from '../packages/runtime-node/index.mjs';
import { projectChannelCredentials } from './lib/channel-env.mjs';

const req=(name)=>{const value=process.env[name]?.trim();if(!value)throw new Error(`${name} is required`);return value;};
const db=new NodePostgresSqlClient(req('DATABASE_URL'),{ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined});
const limit=Math.max(1,Math.min(30,Number(process.env.SERIES_RELEASE_RECHECK_LIMIT||10)));
function runNode(script,args,env){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,[script,...args],{cwd:process.cwd(),env:{...process.env,...env},stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',(d)=>stdout+=d.toString());child.stderr.on('data',(d)=>stderr+=d.toString());child.on('error',reject);child.on('exit',(code)=>code===0?resolve({stdout,stderr}):reject(new Error(`${script} failed ${code}: ${stderr.slice(-1800)}`)));});}
function parseJson(output){try{return JSON.parse(String(output||'').trim());}catch{return null;}}

try{
  const rows=(await db.query(`select distinct se.production_run_id,c.config_path,c.credentials_ref,c.channel_key,p.id as publication_id
    from series_episodes se join series s on s.id=se.series_id join channels c on c.id=s.channel_id
    join publications p on p.production_run_id=se.production_run_id
    left join jobs j on j.kind='schedule_publication' and j.payload->>'publicationId'=p.id::text and j.state in ('queued','retry','running','succeeded')
    where se.continuity_status='passed' and se.memory_compiled_at is not null and p.state='private' and j.id is null
      and exists (select 1 from series_episode_quality_reports vq where vq.episode_id=se.id and vq.report_type='visual_continuity' and vq.status in ('passed','warn'))
      and (s.audience_mode<>'MADE_FOR_KIDS' or exists (select 1 from series_episode_quality_reports kq where kq.episode_id=se.id and kq.report_type='kids_family' and kq.status in ('passed','warn')))
      and coalesce((select pr.metadata->'autonomousPublication'->>'action' from production_runs pr where pr.id=se.production_run_id),'KEEP_PRIVATE')='KEEP_PRIVATE'
    order by se.memory_compiled_at desc limit $1`,[limit])).rows;
  const results=[];
  for(const row of rows){
    const credentialsRef=String(row.credentials_ref??'PRIMARY'),scoped=projectChannelCredentials(process.env,credentialsRef),configPath=String(row.config_path??'config/channels/future-tech-business.example.json');
    try{
      let archive=null;
      if(process.env.CONTENT_LIBRARY_ENABLED!=='false'){
        const archived=await runNode('scripts/archive-series-memory.mjs',[`--production-run-id=${row.production_run_id}`,`--channel-config=${configPath}`],scoped);
        archive=parseJson(archived.stdout)??{output:archived.stdout.slice(-800)};
      }
      const result=await runNode('scripts/auto-publish.mjs',[`--production-run-id=${row.production_run_id}`,`--channel-config=${configPath}`],scoped);
      const parsed=parseJson(result.stdout);
      results.push({productionRunId:row.production_run_id,publicationId:row.publication_id,channelKey:row.channel_key,status:'rechecked',archive,result:parsed??result.stdout.slice(-800)});
    }
    catch(error){results.push({productionRunId:row.production_run_id,publicationId:row.publication_id,channelKey:row.channel_key,status:'error',error:error instanceof Error?error.message:String(error)});}
  }
  console.log(JSON.stringify({processed:results.length,results},null,2));
} finally {await db.close();}
