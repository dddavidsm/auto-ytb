import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NodePostgresSqlClient } from '../../packages/runtime-node/index.mjs';
import { buildSeriesAutomationProfile, validateSeriesAutomationProfile } from './series-automation-profile.mjs';

const arg=(name)=>process.argv.find((value)=>value.startsWith(`--${name}=`))?.slice(name.length+3);
const req=(name)=>{const value=process.env[name]?.trim();if(!value)throw new Error(`${name} is required`);return value;};
const obj=(value)=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map((key)=>[key,canonical(value[key])]));return value;}
const stable=(value)=>JSON.stringify(canonical(value));
const db=new NodePostgresSqlClient(req('DATABASE_URL'),{ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined});
const seriesId=arg('series-id');

async function channelConfig(path){
  if(!path)return{};
  try{return JSON.parse(await readFile(resolve(String(path)),'utf8'));}catch(error){console.warn(`Series automation profile: unable to read ${path}: ${error instanceof Error?error.message:String(error)}`);return{};}
}

try{
  const rows=(await db.query(`select s.*,c.config_path,c.channel_key,c.voice_profile as channel_voice_profile,c.autonomy_policy as channel_autonomy_policy,b.bible
    from series s join channels c on c.id=s.channel_id
    join lateral (select bible from series_bibles x where x.series_id=s.id and x.status='active' order by version desc limit 1) b on true
    where s.lifecycle_state='active' and ($1::uuid is null or s.id=$1::uuid) order by s.updated_at desc`,[seriesId??null])).rows;
  const results=[];
  for(const row of rows){
    const characters=(await db.query(`select character_key,name,role,voice_profile from series_characters where series_id=$1 and status='active' order by created_at`,[row.id])).rows;
    const config=await channelConfig(row.config_path);
    if(!config.voiceProfile&&row.channel_voice_profile)config.voiceProfile=row.channel_voice_profile;
    if(!config.publishing&&row.channel_autonomy_policy)config.publishing=row.channel_autonomy_policy;
    const existing=obj(row.automation_profile);
    const profile=buildSeriesAutomationProfile({series:row,bible:row.bible,characters,channelConfig:config,existing});
    const validation=validateSeriesAutomationProfile(profile);
    if(!validation.valid)throw new Error(`Series ${row.series_key} automation profile invalid: ${validation.issues.join(', ')}`);
    const unchanged=stable(existing)===stable(profile)&&Number(row.current_automation_profile_version??0)>0;
    if(unchanged){results.push({seriesId:row.id,seriesKey:row.series_key,version:Number(row.current_automation_profile_version),changed:false,profile});continue;}
    const version=await db.transaction(async(tx)=>{
      await tx.query(`select id from series where id=$1 for update`,[row.id]);
      const next=(await tx.query(`select coalesce(max(version),0)+1 as version from series_automation_profiles where series_id=$1`,[row.id])).rows[0];
      const nextVersion=Math.max(1,Number(next?.version??1));
      await tx.query(`update series_automation_profiles set status='retired' where series_id=$1 and status='active'`,[row.id]);
      await tx.query(`insert into series_automation_profiles (series_id,version,status,profile,validation,activated_at) values ($1,$2,'active',$3::jsonb,$4::jsonb,now())`,[row.id,nextVersion,JSON.stringify(profile),JSON.stringify(validation)]);
      await tx.query(`update series set automation_profile=$2::jsonb,current_automation_profile_version=$3,format_strategy=format_strategy||$4::jsonb,updated_at=now() where id=$1`,[row.id,JSON.stringify(profile),nextVersion,JSON.stringify({formats:profile.content.formats,primaryFormat:profile.content.primaryFormat})]);
      return nextVersion;
    });
    results.push({seriesId:row.id,seriesKey:row.series_key,version,changed:true,profile});
  }
  console.log(JSON.stringify({series:results.length,updated:results.filter((item)=>item.changed).length,profiles:results},null,2));
}finally{await db.close();}
