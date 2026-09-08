import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const text=(value)=>String(value??'').trim();
const sleep=(ms)=>new Promise((resolvePromise)=>setTimeout(resolvePromise,ms));
function localPath(uri){if(text(uri).startsWith('file://'))return new URL(uri).pathname;if(text(uri).startsWith('/')||text(uri).startsWith('.'))return resolve(uri);return null;}
async function responseJson(response,label){const raw=await response.text();let json={};try{json=raw?JSON.parse(raw):{};}catch{}if(!response.ok)throw new Error(`${label} failed ${response.status}: ${raw.slice(0,800)}`);return json;}
async function postJson(fetchFn,url,token,body,label){return responseJson(await fetchFn(url,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json; charset=UTF-8'},body:JSON.stringify(body)}),label);}
async function loadMedia(uri){const path=localPath(uri);if(!path)throw new Error('Distribution adapter requires a local/file:// render for binary upload');const info=await stat(path);return{path,size:info.size,bytes:new Uint8Array(await readFile(path))};}
function graphUrl(version,path,params={}){const url=new URL(`https://graph.facebook.com/${version}/${path.replace(/^\//,'')}`);for(const [key,value] of Object.entries(params))if(value!==undefined&&value!==null&&value!=='')url.searchParams.set(key,String(value));return url.toString();}

export class TikTokDirectPostPublisher{
  name='tiktok-direct-post';
  constructor(options){this.options=options;this.fetchFn=options.fetchFn??fetch;}
  async creatorInfo(){const json=await postJson(this.fetchFn,'https://open.tiktokapis.com/v2/post/publish/creator_info/query/',this.options.accessToken,{},'TikTok creator info');if(json?.error?.code&&json.error.code!=='ok')throw new Error(`TikTok creator info error ${json.error.code}: ${json.error.message??''}`);return json.data??{};}
  chunkPlan(size){const MB=1024*1024;if(size<=64*MB)return{chunkSize:size,totalChunks:1};const chunkSize=64*MB;return{chunkSize,totalChunks:Math.floor(size/chunkSize)};}
  async publish(input){
    if(this.options.consentGranted!==true)throw new Error('TikTok Direct Post requires explicit owner consent before autonomous publishing is enabled');
    const media=await loadMedia(input.fileUri);const creator=await this.creatorInfo();
    const privacy=text(input.privacyLevel||this.options.privacyLevel||'SELF_ONLY');const allowed=Array.isArray(creator.privacy_level_options)?creator.privacy_level_options.map(String):[];
    if(!allowed.includes(privacy))throw new Error(`TikTok privacy level ${privacy} is not allowed by current creator settings (${allowed.join(', ')||'none returned'})`);
    if(Number.isFinite(Number(input.durationSeconds))&&Number(creator.max_video_post_duration_sec)>0&&Number(input.durationSeconds)>Number(creator.max_video_post_duration_sec))throw new Error(`TikTok creator max duration is ${creator.max_video_post_duration_sec}s, render is ${input.durationSeconds}s`);
    const {chunkSize,totalChunks}=this.chunkPlan(media.size);
    const init=await postJson(this.fetchFn,'https://open.tiktokapis.com/v2/post/publish/video/init/',this.options.accessToken,{
      post_info:{title:text(input.caption).slice(0,2200),privacy_level:privacy,disable_duet:Boolean(input.disableDuet),disable_comment:Boolean(input.disableComment),disable_stitch:Boolean(input.disableStitch),brand_content_toggle:Boolean(input.brandContent),brand_organic_toggle:Boolean(input.brandOrganic),is_aigc:Boolean(input.containsSyntheticMedia)},
      source_info:{source:'FILE_UPLOAD',video_size:media.size,chunk_size:chunkSize,total_chunk_count:totalChunks},
    },'TikTok Direct Post init');
    if(init?.error?.code&&init.error.code!=='ok')throw new Error(`TikTok init error ${init.error.code}: ${init.error.message??''}`);
    const publishId=text(init?.data?.publish_id),uploadUrl=text(init?.data?.upload_url);if(!publishId||!uploadUrl)throw new Error('TikTok init did not return publish_id/upload_url');
    let offset=0;
    for(let index=0;index<totalChunks;index+=1){const isLast=index===totalChunks-1;const endExclusive=isLast?media.size:Math.min(media.size,offset+chunkSize);const chunk=media.bytes.slice(offset,endExclusive);const response=await this.fetchFn(uploadUrl,{method:'PUT',headers:{'content-type':'video/mp4','content-length':String(chunk.byteLength),'content-range':`bytes ${offset}-${endExclusive-1}/${media.size}`},body:chunk});if(!response.ok&&!((response.status===206)&&!isLast))throw new Error(`TikTok upload chunk ${index+1}/${totalChunks} failed ${response.status}: ${(await response.text()).slice(0,500)}`);offset=endExclusive;}
    return{platform:'tiktok',externalId:publishId,state:'processing',metadata:{privacyLevel:privacy,creatorUsername:creator.creator_username??null,chunkSize,totalChunks,isAigc:Boolean(input.containsSyntheticMedia)}};
  }
  async status(publishId){const json=await postJson(this.fetchFn,'https://open.tiktokapis.com/v2/post/publish/status/fetch/',this.options.accessToken,{publish_id:publishId},'TikTok post status');if(json?.error?.code&&json.error.code!=='ok')throw new Error(`TikTok status error ${json.error.code}: ${json.error.message??''}`);return json.data??{};}
}

export class InstagramReelsPublisher{
  name='instagram-reels';
  constructor(options){this.options=options;this.fetchFn=options.fetchFn??fetch;}
  async publish(input){
    const videoUrl=text(input.publicMediaUrl);if(!/^https:\/\//i.test(videoUrl))throw new Error('Instagram Reels publishing requires a public HTTPS video_url reachable by Meta');
    const createUrl=graphUrl(this.options.apiVersion,`${this.options.userId}/media`,{access_token:this.options.accessToken,media_type:'REELS',video_url:videoUrl,caption:text(input.caption).slice(0,2200),share_to_feed:input.shareToFeed===false?'false':'true'});
    const created=await responseJson(await this.fetchFn(createUrl,{method:'POST'}),'Instagram Reel container create');const creationId=text(created.id);if(!creationId)throw new Error('Instagram did not return a creation container id');
    const timeoutMs=Number(this.options.timeoutMs??300000),pollMs=Number(this.options.pollMs??3000),started=Date.now();let lastStatus='';
    while(Date.now()-started<timeoutMs){const status=await responseJson(await this.fetchFn(graphUrl(this.options.apiVersion,creationId,{fields:'status_code,status',access_token:this.options.accessToken})),'Instagram Reel container status');lastStatus=text(status.status_code||status.status);if(['FINISHED','PUBLISHED'].includes(lastStatus))break;if(['ERROR','EXPIRED'].includes(lastStatus))throw new Error(`Instagram Reel container failed with ${lastStatus}`);await sleep(pollMs);}
    if(!['FINISHED','PUBLISHED'].includes(lastStatus))throw new Error(`Instagram Reel container timed out in status ${lastStatus||'unknown'}`);
    const published=await responseJson(await this.fetchFn(graphUrl(this.options.apiVersion,`${this.options.userId}/media_publish`,{creation_id:creationId,access_token:this.options.accessToken}),{method:'POST'}),'Instagram Reel publish');const id=text(published.id);if(!id)throw new Error('Instagram media_publish returned no media id');
    return{platform:'instagram',externalId:id,state:'published',metadata:{creationId,publicMediaUrl:videoUrl}};
  }
}

export class FacebookReelsPublisher{
  name='facebook-reels';
  constructor(options){this.options=options;this.fetchFn=options.fetchFn??fetch;}
  async publish(input){
    const media=await loadMedia(input.fileUri);const page=this.options.pageId||'me';
    const start=await responseJson(await this.fetchFn(graphUrl(this.options.apiVersion,`${page}/video_reels`,{access_token:this.options.accessToken,upload_phase:'start'}),{method:'POST'}),'Facebook Reel upload start');
    const videoId=text(start.video_id),uploadUrl=text(start.upload_url);if(!videoId||!uploadUrl)throw new Error('Facebook Reel start returned no video_id/upload_url');
    const uploaded=await this.fetchFn(uploadUrl,{method:'POST',headers:{authorization:`OAuth ${this.options.accessToken}`,offset:'0',file_size:String(media.size),'content-type':'application/octet-stream'},body:media.bytes});if(!uploaded.ok)throw new Error(`Facebook Reel binary upload failed ${uploaded.status}: ${(await uploaded.text()).slice(0,700)}`);
    const finish=await responseJson(await this.fetchFn(graphUrl(this.options.apiVersion,`${page}/video_reels`,{access_token:this.options.accessToken,upload_phase:'finish',video_id:videoId,video_state:'PUBLISHED',description:text(input.caption),title:text(input.title)}),{method:'POST'}),'Facebook Reel publish');
    return{platform:'facebook',externalId:videoId,state:'published',metadata:{finish}};
  }
}

export function createDistributionPublisher(platform,env=process.env,options={}){
  const fetchFn=options.fetchFn;
  if(platform==='tiktok'){
    const token=text(env.TIKTOK_ACCESS_TOKEN);if(!token)throw new Error('TIKTOK_ACCESS_TOKEN is required');
    return new TikTokDirectPostPublisher({accessToken:token,privacyLevel:text(env.TIKTOK_PRIVACY_LEVEL)||'SELF_ONLY',consentGranted:String(env.TIKTOK_AUTOMATION_CONSENT)==='true',fetchFn});
  }
  if(platform==='instagram'){
    const token=text(env.INSTAGRAM_ACCESS_TOKEN||env.META_ACCESS_TOKEN),userId=text(env.INSTAGRAM_USER_ID),apiVersion=text(env.META_GRAPH_VERSION);if(!token||!userId||!apiVersion)throw new Error('INSTAGRAM_ACCESS_TOKEN/META_ACCESS_TOKEN, INSTAGRAM_USER_ID and META_GRAPH_VERSION are required');
    return new InstagramReelsPublisher({accessToken:token,userId,apiVersion,pollMs:Number(env.META_PROCESSING_POLL_MS||3000),timeoutMs:Number(env.META_PROCESSING_TIMEOUT_MS||300000),fetchFn});
  }
  if(platform==='facebook'){
    const token=text(env.FACEBOOK_PAGE_ACCESS_TOKEN||env.META_ACCESS_TOKEN),pageId=text(env.FACEBOOK_PAGE_ID),apiVersion=text(env.META_GRAPH_VERSION);if(!token||!pageId||!apiVersion)throw new Error('FACEBOOK_PAGE_ACCESS_TOKEN/META_ACCESS_TOKEN, FACEBOOK_PAGE_ID and META_GRAPH_VERSION are required');
    return new FacebookReelsPublisher({accessToken:token,pageId,apiVersion,fetchFn});
  }
  throw new Error(`Unsupported distribution platform ${platform}`);
}

export function publicMediaUrlFor({renderUri,productionRunId,env=process.env}){
  if(/^https:\/\//i.test(text(renderUri)))return text(renderUri);
  const base=text(env.DISTRIBUTION_PUBLIC_MEDIA_BASE_URL).replace(/\/$/,'');
  if(!base)return null;
  return `${base}/projects/${encodeURIComponent(productionRunId)}/final.mp4`;
}
