const text=(value)=>String(value??'').trim();
const bool=(value)=>String(value??'').toLowerCase()==='true';
const env=process.env;
const jsonMode=process.argv.includes('--json');
const strict=process.argv.includes('--strict');

function check(id,label,required,details={}){
  const missing=required.filter((name)=>!text(env[name]));
  return{id,label,state:missing.length?'BLOCKED':'READY',missing,details};
}

const textProvider=text(env.TEXT_MODEL_PROVIDER||'gemini').toLowerCase();
const checks=[
  check('drive','Google Drive archive',['DRIVE_ROOT_FOLDER_ID','DRIVE_REFRESH_TOKEN'],{rootFolderId:text(env.DRIVE_ROOT_FOLDER_ID)||null,dedicatedAccount:Boolean(text(env.DRIVE_REFRESH_TOKEN))}),
  check('youtube','YouTube publishing + Analytics',['YOUTUBE_CLIENT_ID','YOUTUBE_CLIENT_SECRET','YOUTUBE_REFRESH_TOKEN','YOUTUBE_CHANNEL_ID'],{privateUpload:env.AUTO_UPLOAD_PRIVATE!=='false'}),
  textProvider==='gemini'
    ?check('text','Gemini structured text',['GEMINI_API_KEY'],{provider:'gemini',model:text(env.TEXT_MODEL_RESEARCH||env.GEMINI_TEXT_MODEL||'gemini-3.8-flash')})
    :check('text','OpenAI structured text',['TEXT_MODEL_API_KEY'],{provider:'openai',model:text(env.TEXT_MODEL_RESEARCH||'gpt-5')}),
  check('database','PostgreSQL state',['DATABASE_URL']),
  check('search','Factual web research',['SEARCH_API_KEY'],{conditional:true,provider:text(env.SEARCH_PROVIDER||'tavily')}),
  check('voice','Voice/TTS',['VOICE_API_KEY'],{conditional:true,provider:text(env.VOICE_PROVIDER||'elevenlabs')}),
  check('image','Image generation',['IMAGE_API_KEY'],{conditional:true,provider:text(env.IMAGE_PROVIDER||'runway')}),
  check('video','Video generation',['VIDEO_API_KEY'],{conditional:true,provider:text(env.VIDEO_PROVIDER||'runway')}),
  check('tiktok','TikTok Direct Post',['TIKTOK_ACCESS_TOKEN'],{optional:true,consent:bool(env.TIKTOK_AUTOMATION_CONSENT)}),
  check('instagram','Instagram Reels',['INSTAGRAM_USER_ID','META_GRAPH_VERSION'],{optional:true,token:Boolean(text(env.INSTAGRAM_ACCESS_TOKEN||env.META_ACCESS_TOKEN)),publicMediaBase:Boolean(text(env.DISTRIBUTION_PUBLIC_MEDIA_BASE_URL))}),
  check('facebook','Facebook Reels',['FACEBOOK_PAGE_ID','META_GRAPH_VERSION'],{optional:true,token:Boolean(text(env.FACEBOOK_PAGE_ACCESS_TOKEN||env.META_ACCESS_TOKEN))}),
];

for(const item of checks){
  if(item.id==='instagram'&&!item.details.token)item.missing.push('INSTAGRAM_ACCESS_TOKEN|META_ACCESS_TOKEN');
  if(item.id==='instagram'&&!item.details.publicMediaBase)item.missing.push('DISTRIBUTION_PUBLIC_MEDIA_BASE_URL');
  if(item.id==='facebook'&&!item.details.token)item.missing.push('FACEBOOK_PAGE_ACCESS_TOKEN|META_ACCESS_TOKEN');
  if(item.missing.length)item.state='BLOCKED';
}

const coreIds=new Set(['drive','youtube','text','database']);
const coreReady=checks.filter((item)=>coreIds.has(item.id)).every((item)=>item.state==='READY');
const result={coreReady,textProvider,checks};
if(jsonMode)console.log(JSON.stringify(result,null,2));
else{
  console.log(`AUTO-YTB connections: ${coreReady?'CORE READY':'CORE BLOCKED'}\n`);
  for(const item of checks){
    const suffix=item.missing.length?` — missing: ${item.missing.join(', ')}`:'';
    console.log(`${item.state.padEnd(7)} ${item.label}${suffix}`);
  }
  console.log('\nConditional providers only need to be READY when the selected Content Archetype requires them. Social platforms remain optional per Series Automation Profile.');
}
if(strict&&!coreReady)process.exitCode=1;
