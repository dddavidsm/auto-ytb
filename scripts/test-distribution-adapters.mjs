import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { FacebookReelsPublisher, InstagramReelsPublisher, TikTokDirectPostPublisher, publicMediaUrlFor } from '../packages/runtime-node/distribution.mjs';

const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
const root=await mkdtemp(join(tmpdir(),'auto-ytb-distribution-')),mediaPath=join(root,'short.mp4');await writeFile(mediaPath,Buffer.alloc(4096,7));const fileUri=pathToFileURL(mediaPath).href;

const tiktokCalls=[];
const tiktokFetch=async(url,init={})=>{tiktokCalls.push({url:String(url),method:init.method??'GET',headers:init.headers,body:init.body});if(String(url).includes('creator_info'))return json({data:{creator_username:'owner',privacy_level_options:['SELF_ONLY','PUBLIC_TO_EVERYONE'],max_video_post_duration_sec:300},error:{code:'ok'}});if(String(url).includes('/video/init/'))return json({data:{publish_id:'tt-pub-1',upload_url:'https://upload.tiktok.test/u'},error:{code:'ok'}});if(String(url).includes('/status/fetch/'))return json({data:{status:'PROCESSING_UPLOAD'},error:{code:'ok'}});if(String(url).startsWith('https://upload.tiktok.test/'))return new Response('',{status:201});throw new Error(`unexpected TikTok URL ${url}`);};
const tiktok=new TikTokDirectPostPublisher({accessToken:'token',privacyLevel:'SELF_ONLY',consentGranted:true,fetchFn:tiktokFetch});
const tt=await tiktok.publish({fileUri,caption:'Dog rescue #dogs',durationSeconds:45,containsSyntheticMedia:true});assert.equal(tt.externalId,'tt-pub-1');assert.equal(tt.state,'processing');assert.equal(tt.metadata.isAigc,true);assert.ok(tiktokCalls.some((call)=>call.url.includes('creator_info')));assert.ok(tiktokCalls.some((call)=>call.method==='PUT'));
const ttStatus=await tiktok.status('tt-pub-1');assert.equal(ttStatus.status,'PROCESSING_UPLOAD');
await assert.rejects(()=>new TikTokDirectPostPublisher({accessToken:'token',consentGranted:false,fetchFn:tiktokFetch}).publish({fileUri,caption:'x'}),/explicit owner consent/);

const instagramCalls=[];
const instagramFetch=async(url,init={})=>{const target=String(url);instagramCalls.push({url:target,method:init.method??'GET'});if(target.includes('/ig-user/media?'))return json({id:'ig-container-1'});if(target.includes('/ig-container-1?'))return json({status_code:'FINISHED'});if(target.includes('/ig-user/media_publish?'))return json({id:'ig-media-1'});throw new Error(`unexpected Instagram URL ${target}`);};
const instagram=new InstagramReelsPublisher({accessToken:'meta',userId:'ig-user',apiVersion:'v-test',pollMs:1,timeoutMs:100,fetchFn:instagramFetch});
const ig=await instagram.publish({publicMediaUrl:'https://media.example/projects/p1/final.mp4',caption:'Caption'});assert.equal(ig.externalId,'ig-media-1');assert.equal(ig.state,'published');assert.equal(instagramCalls.length,3);
await assert.rejects(()=>instagram.publish({publicMediaUrl:'file:///tmp/video.mp4',caption:'x'}),/public HTTPS/);

const facebookCalls=[];
const facebookFetch=async(url,init={})=>{const target=String(url);facebookCalls.push({url:target,method:init.method??'GET',headers:init.headers});if(target.includes('/page-1/video_reels?')&&target.includes('upload_phase=start'))return json({video_id:'fb-video-1',upload_url:'https://upload.facebook.test/fb-video-1'});if(target==='https://upload.facebook.test/fb-video-1')return json({success:true});if(target.includes('/page-1/video_reels?')&&target.includes('upload_phase=finish'))return json({success:true});throw new Error(`unexpected Facebook URL ${target}`);};
const facebook=new FacebookReelsPublisher({accessToken:'page-token',pageId:'page-1',apiVersion:'v-test',fetchFn:facebookFetch});
const fb=await facebook.publish({fileUri,title:'Title',caption:'Caption'});assert.equal(fb.externalId,'fb-video-1');assert.equal(fb.state,'published');assert.ok(facebookCalls.some((call)=>call.url==='https://upload.facebook.test/fb-video-1'));

assert.equal(publicMediaUrlFor({renderUri:'https://cdn.example/a.mp4',productionRunId:'p1',env:{}}),'https://cdn.example/a.mp4');
assert.equal(publicMediaUrlFor({renderUri:fileUri,productionRunId:'p 1',env:{DISTRIBUTION_PUBLIC_MEDIA_BASE_URL:'https://media.example/'}}),'https://media.example/projects/p%201/final.mp4');
assert.equal(publicMediaUrlFor({renderUri:fileUri,productionRunId:'p1',env:{}}),null);
console.log('✓ TikTok Direct Post queries creator settings, carries AI disclosure, uploads bytes and exposes status polling');
console.log('✓ Instagram Reels uses a public HTTPS container → processing → media_publish flow');
console.log('✓ Facebook Reels executes start → binary upload → publish as an independent adapter');
console.log('✓ public-media URL resolution fails closed unless an HTTPS delivery origin is configured');
