import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { decideAutonomousPublication } from '@auto-ytb/os';
import { NodePostgresSqlClient } from '../packages/runtime-node/index.mjs';

const arg=(name,fallback)=>process.argv.find((value)=>value.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
const req=(name)=>{const value=process.env[name]?.trim();if(!value)throw new Error(`${name} is required`);return value;};
const productionRunId=arg('production-run-id');if(!productionRunId)throw new Error('Use --production-run-id=<uuid>');
const configPath=resolve(arg('channel-config','config/channels/future-tech-business.example.json'));
const channel=JSON.parse(await readFile(configPath,'utf8'));const publishing=channel.publishing??{};const credentialsRef=String(channel.credentialsRef??process.env.CHANNEL_CREDENTIALS_REF??'PRIMARY');
const db=new NodePostgresSqlClient(req('DATABASE_URL'),{ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined});

try{
  const row=(await db.query(`select p.id as publication_id,p.youtube_video_id,p.state,q.score::float as qa_score,q.blockers,q.report,r.research_confidence::float as research_confidence from production_runs pr left join publications p on p.production_run_id=pr.id left join lateral (select score,blockers,report from qa_reports where production_run_id=pr.id order by created_at desc limit 1) q on true left join content_ideas ci on ci.id=pr.content_idea_id left join lateral (select research_confidence from research_dossiers rd where rd.opportunity_id=ci.opportunity_id order by rd.created_at desc limit 1) r on true where pr.id=$1`,[productionRunId])).rows[0];
  if(!row)throw new Error(`Production run ${productionRunId} not found`);
  const rights=await db.query(`select id from production_assets where production_run_id=$1 and provider='source-backed-direct' and (license is null or license='verify-before-public')`,[productionRunId]);
  let manifestRights=0;
  try{const manifest=JSON.parse(await readFile(resolve(process.env.LOCAL_STORAGE_ROOT||'.data/storage','projects',productionRunId,'manifest.json'),'utf8'));manifestRights=(manifest.assets??[]).filter((asset)=>asset.provider==='source-backed-direct'&&(!asset.license||asset.license==='verify-before-public')).length;}catch{}
  const unresolvedRights=Math.max(rights.rows.length,manifestRights);
  const checks=Array.isArray(row.report?.checks)?row.report.checks:[];
  const policyWarnings=checks.filter((check)=>check?.status==='WARN'&&['policy','advertiser-friendly','synthetic-disclosure'].includes(check?.id)).length;
  const decision=decideAutonomousPublication({autonomyMode:publishing.autonomyMode==='FULL_AUTONOMOUS'?'FULL_AUTONOMOUS':'REVIEW_REQUIRED',allowAutomaticPublicScheduling:Boolean(publishing.allowAutomaticPublicScheduling),minimumQaScoreForAutoPublish:Number(publishing.minimumQaScoreForAutoPublish??88),minimumResearchConfidenceForAutoPublish:Number(publishing.minimumResearchConfidenceForAutoPublish??78),blockOnUnresolvedRights:publishing.blockOnUnresolvedRights!==false,blockOnPolicyWarning:publishing.blockOnPolicyWarning!==false,autoPublishDelayMinutes:Number(publishing.autoPublishDelayMinutes??30)},{qaScore:Number(row.qa_score??0),researchConfidence:Number(row.research_confidence??0),qaBlockers:row.blockers??[],unresolvedRights,policyWarnings,youtubeVideoId:row.youtube_video_id});
  if(decision.action==='SCHEDULE'&&row.publication_id&&decision.publishAt){
    const jobKey=`schedule-publication:${row.publication_id}:${decision.publishAt}`;
    const payload={publicationId:row.publication_id,publishAt:decision.publishAt,source:'full-autonomous',credentialsRef,channelKey:channel.channelKey??channel.id};
    const inserted=await db.query(`insert into jobs (job_key,kind,state,priority,max_attempts,payload) values ($1,'schedule_publication','queued',98,4,$2::jsonb) on conflict (job_key) do nothing returning id`,[jobKey,JSON.stringify(payload)]);
    if(inserted.rows[0])await db.query(`insert into job_events (job_id,event_type,detail) values ($1,'autonomous_publish_scheduled',$2::jsonb)`,[inserted.rows[0].id,JSON.stringify({productionRunId,publicationId:row.publication_id,publishAt:decision.publishAt,reasons:decision.reasons,credentialsRef})]);
    console.log(JSON.stringify({...decision,jobId:inserted.rows[0]?.id??null,productionRunId,publicationId:row.publication_id,credentialsRef,unresolvedRights},null,2));
  }else{
    await db.query(`update production_runs set metadata=metadata||$2::jsonb,updated_at=now() where id=$1`,[productionRunId,JSON.stringify({autonomousPublication:{...decision,evaluatedAt:new Date().toISOString(),credentialsRef,unresolvedRights}})]);
    console.log(JSON.stringify({...decision,productionRunId,publicationId:row.publication_id??null,credentialsRef,unresolvedRights},null,2));
  }
} finally {await db.close();}
