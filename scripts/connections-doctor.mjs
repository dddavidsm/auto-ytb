import { spawnSync } from 'node:child_process';

const text=(value)=>String(value??'').trim();
const bool=(value)=>String(value??'').toLowerCase()==='true';
const env=process.env;
const jsonMode=process.argv.includes('--json');
const strict=process.argv.includes('--strict');
const production=process.argv.includes('--production');

function check(id,label,required,details={}){const missing=required.filter((name)=>!text(env[name]));return{id,label,state:missing.length?'BLOCKED':'READY',missing,details};}
function providerCheck(id,label,provider,keyName,model){
  if(provider==='none')return{id,label,state:'NOT_REQUIRED',missing:[],details:{conditional:true,provider,model}};
  if(provider==='gemini')return check(id,label,['GEMINI_API_KEY'],{conditional:true,provider,model});
  return check(id,label,[keyName],{conditional:true,provider,model});
}
function executableCheck(id,label,command){
  const result=spawnSync(command,['-version'],{encoding:'utf8',windowsHide:true,shell:false});
  const ready=!result.error&&result.status===0;
  return{id,label,state:ready?'READY':'BLOCKED',missing:ready?[]:[command],details:{command,status:result.status??null,error:result.error?.message??null}};
}

const textProvider=text(env.TEXT_MODEL_PROVIDER||'gemini').toLowerCase();
const searchProvider=text(env.SEARCH_PROVIDER||'gemini').toLowerCase();
const voiceProvider=text(env.VOICE_PROVIDER||'gemini').toLowerCase();
const imageProvider=text(env.IMAGE_PROVIDER||'gemini').toLowerCase();
const videoProvider=text(env.VIDEO_PROVIDER||'gemini').toLowerCase();
const checks=[
  check('drive','Google Drive archive',['DRIVE_CLIENT_ID','DRIVE_CLIENT_SECRET','DRIVE_ROOT_FOLDER_ID','DRIVE_REFRESH_TOKEN'],{rootFolderId:text(env.DRIVE_ROOT_FOLDER_ID)||null,dedicatedAccount:Boolean(text(env.DRIVE_REFRESH_TOKEN))}),
  check('youtube','YouTube publishing + Analytics',['YOUTUBE_CLIENT_ID','YOUTUBE_CLIENT_SECRET','YOUTUBE_REFRESH_TOKEN','YOUTUBE_CHANNEL_ID'],{privateUpload:env.AUTO_UPLOAD_PRIVATE!=='false'}),
  textProvider==='gemini'?check('text','Gemini structured text',['GEMINI_API_KEY'],{provider:'gemini',model:text(env.TEXT_MODEL_RESEARCH||env.GEMINI_TEXT_MODEL||'gemini-3.8-flash')}):check('text','OpenAI structured text',['TEXT_MODEL_API_KEY'],{provider:'openai',model:text(env.TEXT_MODEL_RESEARCH||'gpt-5')}),
  check('database','PostgreSQL state',['DATABASE_URL']),
  providerCheck('search','Factual web research',searchProvider,'SEARCH_API_KEY',text(env.GEMINI_SEARCH_MODEL||'gemini-3.6-flash')),
  providerCheck('voice','Voice/TTS',voiceProvider,'VOICE_API_KEY',text(env.VOICE_MODEL||(voiceProvider==='gemini'?'gemini-3.1-flash-tts-preview':'eleven_multilingual_v2'))),
  providerCheck('image','Image generation',imageProvider,'IMAGE_API_KEY',text(env.IMAGE_MODEL||(imageProvider==='gemini'?'gemini-3.1-flash-image':'gen4_image'))),
  providerCheck('video','Video generation',videoProvider,'VIDEO_API_KEY',text(env.VIDEO_MODEL||(videoProvider==='gemini'?'veo-3.1-fast-generate-preview':'gen4.5'))),
  executableCheck('ffmpeg','FFmpeg renderer',text(env.FFMPEG_BIN||'ffmpeg')),
  executableCheck('ffprobe','FFprobe final-media inspection',text(env.FFPROBE_BIN||'ffprobe')),
  check('tiktok','TikTok Direct Post',['TIKTOK_ACCESS_TOKEN'],{optional:true,consent:bool(env.TIKTOK_AUTOMATION_CONSENT)}),
  check('instagram','Instagram Reels',['INSTAGRAM_USER_ID','META_GRAPH_VERSION'],{optional:true,token:Boolean(text(env.INSTAGRAM_ACCESS_TOKEN||env.META_ACCESS_TOKEN)),publicMediaBase:Boolean(text(env.DISTRIBUTION_PUBLIC_MEDIA_BASE_URL))}),
  check('facebook','Facebook Reels',['FACEBOOK_PAGE_ID','META_GRAPH_VERSION'],{optional:true,token:Boolean(text(env.FACEBOOK_PAGE_ACCESS_TOKEN||env.META_ACCESS_TOKEN))}),
];
for(const item of checks){if(item.id==='instagram'&&!item.details.token)item.missing.push('INSTAGRAM_ACCESS_TOKEN|META_ACCESS_TOKEN');if(item.id==='instagram'&&!item.details.publicMediaBase)item.missing.push('DISTRIBUTION_PUBLIC_MEDIA_BASE_URL');if(item.id==='facebook'&&!item.details.token)item.missing.push('FACEBOOK_PAGE_ACCESS_TOKEN|META_ACCESS_TOKEN');if(item.missing.length)item.state='BLOCKED';}
const coreIds=new Set(['drive','youtube','text','database']);
const productionIds=new Set([...coreIds,'search','voice','image','video','ffmpeg','ffprobe']);
const requiredIds=production?productionIds:coreIds;
const coreReady=checks.filter((item)=>requiredIds.has(item.id)).every((item)=>item.state==='READY');
const result={coreReady,mode:production?'production':'core',textProvider,searchProvider,voiceProvider,imageProvider,videoProvider,checks};
if(jsonMode)console.log(JSON.stringify(result,null,2));else{
  console.log(`AUTO-YTB connections: ${coreReady?(production?'PRODUCTION READY':'CORE READY'):(production?'PRODUCTION BLOCKED':'CORE BLOCKED')}\n`);
  for(const item of checks){const suffix=item.missing.length?` — missing: ${item.missing.join(', ')}`:'';console.log(`${item.state.padEnd(12)} ${item.label}${suffix}`);}
  console.log(`\nPreflight mode: ${production?'production (paid-media/render dependencies enforced)':'core'}. Social platforms remain optional per Series Automation Profile.`);
}
if(strict&&!coreReady)process.exitCode=1;
