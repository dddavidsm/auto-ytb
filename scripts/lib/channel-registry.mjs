import { readdir, readFile } from 'node:fs/promises';
import { resolve, join, basename } from 'node:path';

function envSuffix(ref){return String(ref??'PRIMARY').trim().toUpperCase().replace(/[^A-Z0-9]+/g,'_');}
export function channelEnvName(base,credentialsRef){const ref=envSuffix(credentialsRef);return ref==='PRIMARY'?base:`${base}__${ref}`;}
export function channelEnv(env,base,credentialsRef){return env[channelEnvName(base,credentialsRef)]?.trim()||undefined;}

export async function loadChannelConfigs(dir='config/channels'){
  const absolute=resolve(process.cwd(),dir);
  const names=(await readdir(absolute)).filter((name)=>name.endsWith('.json')).sort();
  const configs=[];
  for(const name of names){
    const path=join(absolute,name);
    const config=JSON.parse(await readFile(path,'utf8'));
    if(!config.channelKey)config.channelKey=config.id;
    if(!config.id||!config.channelKey||!config.language)throw new Error(`Invalid channel config ${name}`);
    configs.push({...config,__path:`${dir}/${basename(name)}`});
  }
  return configs;
}

export function channelProfileFromConfig(config,channelId){
  return {
    channelId,
    channelKey:String(config.channelKey),
    language:String(config.language),
    positioning:String(config.positioning??''),
    characterMode:config.identity?.characterMode??'none',
    characterName:config.identity?.characterName??null,
    themes:Array.isArray(config.themes)?config.themes.map(String):[],
    styleTags:Array.isArray(config.styleTags)?config.styleTags.map(String):[],
    formats:Array.isArray(config.supportedFormats)?config.supportedFormats.map(String):['LONG_HORIZONTAL'],
    enabled:config.portfolio?.enabled!==false,
  };
}

export async function ensureOwnedChannelRows(db,configs,env=process.env){
  const rows=[];
  for(const config of configs){
    const key=String(config.channelKey);
    const credentialsRef=String(config.credentialsRef??'PRIMARY');
    const youtubeChannelId=channelEnv(env,'YOUTUBE_CHANNEL_ID',credentialsRef)??null;
    const existing=(await db.query(`select id,youtube_channel_id,lifecycle_state from channels where channel_key=$1 and is_owned=true limit 1`,[key])).rows[0];
    const lifecycleState=youtubeChannelId?'ready':'awaiting_channel';
    let row;
    if(existing){
      const updated=await db.query(`update channels set youtube_channel_id=coalesce($2,youtube_channel_id),title=$3,language=$4,country=$5,niche=$6,identity=$7::jsonb,voice_profile=$8::jsonb,autonomy_policy=$9::jsonb,library_policy=$10::jsonb,channel_key=$1,credentials_ref=$11,config_path=$12,lifecycle_state=case when coalesce($2,youtube_channel_id) is not null then 'ready' else lifecycle_state end,automation_enabled=$13,updated_at=now() where id=$14 returning *`,[key,youtubeChannelId,String(config.id),String(config.language),config.region??null,String(config.id),JSON.stringify(config.identity??{}),JSON.stringify(config.voiceProfile??{}),JSON.stringify(config.publishing??{}),JSON.stringify(config.library??{}),credentialsRef,config.__path,config.portfolio?.enabled!==false,existing.id]);
      row=updated.rows[0];
    } else {
      const inserted=await db.query(`insert into channels (youtube_channel_id,title,language,country,niche,is_owned,channel_key,identity,voice_profile,autonomy_policy,library_policy,credentials_ref,config_path,lifecycle_state,automation_enabled) values ($1,$2,$3,$4,$5,true,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11,$12,$13,$14) returning *`,[youtubeChannelId,String(config.id),String(config.language),config.region??null,String(config.id),key,JSON.stringify(config.identity??{}),JSON.stringify(config.voiceProfile??{}),JSON.stringify(config.publishing??{}),JSON.stringify(config.library??{}),credentialsRef,config.__path,lifecycleState,config.portfolio?.enabled!==false]);
      row=inserted.rows[0];
    }
    rows.push({row,config,profile:channelProfileFromConfig(config,row.id)});
  }
  return rows;
}
