function suffix(ref){return String(ref??'PRIMARY').trim().toUpperCase().replace(/[^A-Z0-9]+/g,'_');}
export function scopedName(base,credentialsRef){const normalized=suffix(credentialsRef);return normalized==='PRIMARY'?base:`${base}__${normalized}`;}
export function resolveScoped(env,base,credentialsRef,{fallbackToPrimary=false}={}){
  const name=scopedName(base,credentialsRef);
  const value=env[name]?.trim();
  if(value)return value;
  if(fallbackToPrimary&&name!==base)return env[base]?.trim()||undefined;
  return undefined;
}
export function projectChannelCredentials(env,credentialsRef){
  const projected={};
  const names=['YOUTUBE_CLIENT_ID','YOUTUBE_CLIENT_SECRET','YOUTUBE_REFRESH_TOKEN','YOUTUBE_CHANNEL_ID'];
  for(const base of names){const value=resolveScoped(env,base,credentialsRef);if(value)projected[base]=value;else delete projected[base];}
  projected.CHANNEL_CREDENTIALS_REF=String(credentialsRef??'PRIMARY');
  return projected;
}
export function assertChannelCredentials(env,credentialsRef,names=['YOUTUBE_CLIENT_ID','YOUTUBE_CLIENT_SECRET','YOUTUBE_REFRESH_TOKEN']){
  const missing=names.filter((base)=>!resolveScoped(env,base,credentialsRef));
  if(missing.length)throw new Error(`Missing ${missing.map((base)=>scopedName(base,credentialsRef)).join(', ')} for channel credentialsRef=${credentialsRef}`);
}
