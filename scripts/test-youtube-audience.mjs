import assert from 'node:assert/strict';
import { YouTubePublisher } from '../packages/youtube/dist/index.js';

const calls=[];
const token={async getAccessToken(){return 'token';}};
let loaderCalls=0;
const loader={async load(){loaderCalls+=1;return{body:new Uint8Array([1,2,3]),mimeType:'video/mp4',size:3};}};
let uploadedMarker=null;
let existingVideoId=null;
const fakeFetch=async(url,init={})=>{
  const target=String(url);calls.push({url:target,init});
  if(target.includes('/youtube/v3/channels?'))return new Response(JSON.stringify({items:[{contentDetails:{relatedPlaylists:{uploads:'uploads-playlist'}}}]}),{status:200,headers:{'content-type':'application/json'}});
  if(target.includes('/youtube/v3/playlistItems?'))return new Response(JSON.stringify({items:existingVideoId?[{contentDetails:{videoId:existingVideoId}}]:[]}),{status:200,headers:{'content-type':'application/json'}});
  if(target.includes('/youtube/v3/videos?part=snippet,status'))return new Response(JSON.stringify({items:existingVideoId?[{id:existingVideoId,snippet:{tags:[uploadedMarker]},status:{privacyStatus:'private'}}]:[]}),{status:200,headers:{'content-type':'application/json'}});
  if(target.includes('uploadType=resumable')){
    const body=JSON.parse(init.body);uploadedMarker=body.snippet.tags.find((tag)=>tag.startsWith('auto_ytb_'))??null;
    return new Response('',{status:200,headers:{location:'https://upload.example/session'}});
  }
  if(target==='https://upload.example/session'){existingVideoId='video-1';return new Response(JSON.stringify({id:existingVideoId}),{status:200,headers:{'content-type':'application/json'}});}
  throw new Error(`unexpected URL ${url}`);
};
const publisher=new YouTubePublisher(token,loader,fakeFetch, {idempotencyKey:'stable-opportunity'});
const kidsInput={fileUri:'mock://kids.mp4',title:'A gentle story',description:'Original story',tags:[],language:'en',containsSyntheticMedia:true,selfDeclaredMadeForKids:true};
const first=await publisher.uploadPrivate(kidsInput);
assert.equal(first.externalId,'video-1');
const initCall=calls.find((call)=>call.url.includes('uploadType=resumable'));
const kidsMetadata=JSON.parse(initCall.init.body);
assert.equal(kidsMetadata.status.privacyStatus,'private');
assert.equal(kidsMetadata.status.selfDeclaredMadeForKids,true);
assert.equal(kidsMetadata.status.containsSyntheticMedia,true);
assert.equal(kidsMetadata.snippet.defaultLanguage,'en');
assert.ok(kidsMetadata.snippet.tags.some((tag)=>tag.startsWith('auto_ytb_')));
assert.equal(loaderCalls,1);

const second=await publisher.uploadPrivate({...kidsInput,fileUri:'mock://different-run-path.mp4'});
assert.equal(second.externalId,'video-1');
assert.equal(loaderCalls,1,'recovered upload must not load/re-upload video bytes');
assert.equal(calls.filter((call)=>call.url.includes('uploadType=resumable')).length,1,'retry must not create a second YouTube upload session');

const beforeFailureLoaderCalls=loaderCalls;
const failingPublisher=new YouTubePublisher(token,loader,async(url)=>{
  if(String(url).includes('/youtube/v3/channels?'))return new Response('temporary outage',{status:503});
  throw new Error(`no upload call should happen after failed idempotency lookup: ${url}`);
},{idempotencyKey:'must-not-duplicate'});
await assert.rejects(
  ()=>failingPublisher.uploadPrivate({...kidsInput,fileUri:'mock://never-upload.mp4'}),
  /Upload blocked to avoid creating a duplicate video/,
);
assert.equal(loaderCalls,beforeFailureLoaderCalls,'failed recovery verification must block before loading upload bytes');

const generalCalls=[];
const generalFetch=async(url,init={})=>{
  const target=String(url);generalCalls.push({url:target,init});
  if(target.includes('/youtube/v3/channels?'))return new Response(JSON.stringify({items:[{contentDetails:{relatedPlaylists:{uploads:'general-uploads'}}}]}),{status:200,headers:{'content-type':'application/json'}});
  if(target.includes('/youtube/v3/playlistItems?'))return new Response(JSON.stringify({items:[]}),{status:200,headers:{'content-type':'application/json'}});
  if(target.includes('uploadType=resumable'))return new Response('',{status:200,headers:{location:'https://upload.example/general'}});
  if(target==='https://upload.example/general')return new Response(JSON.stringify({id:'video-2'}),{status:200,headers:{'content-type':'application/json'}});
  throw new Error(`unexpected URL ${url}`);
};
const generalPublisher=new YouTubePublisher(token,loader,generalFetch,{idempotencyKey:'general-opportunity'});
await generalPublisher.uploadPrivate({fileUri:'mock://general.mp4',title:'Tech story',description:'General audience',tags:[],language:'en',containsSyntheticMedia:false,selfDeclaredMadeForKids:false});
const generalInit=generalCalls.find((call)=>call.url.includes('uploadType=resumable'));
const generalMetadata=JSON.parse(generalInit.init.body);
assert.equal(generalMetadata.status.selfDeclaredMadeForKids,false);
assert.equal(generalMetadata.status.containsSyntheticMedia,false);
console.log('✓ YouTube upload explicitly declares MADE_FOR_KIDS for child-directed series');
console.log('✓ general-audience upload explicitly remains not made for kids');
console.log('✓ YouTube private upload retries recover the prior video without duplicate bytes/session');
console.log('✓ YouTube retry verification fails closed before bytes are loaded when recovery lookup is unavailable');
