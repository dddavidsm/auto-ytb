import assert from 'node:assert/strict';
import { YouTubePublisher } from '../packages/youtube/dist/index.js';

const calls=[];
const token={async getAccessToken(){return 'token';}};
const loader={async load(){return{body:new Uint8Array([1,2,3]),mimeType:'video/mp4',size:3};}};
const fakeFetch=async(url,init={})=>{
  calls.push({url:String(url),init});
  if(String(url).includes('uploadType=resumable'))return new Response('',{status:200,headers:{location:'https://upload.example/session'}});
  if(String(url)==='https://upload.example/session')return new Response(JSON.stringify({id:'video-1'}),{status:200,headers:{'content-type':'application/json'}});
  throw new Error(`unexpected URL ${url}`);
};
const publisher=new YouTubePublisher(token,loader,fakeFetch);
await publisher.uploadPrivate({fileUri:'mock://kids.mp4',title:'A gentle story',description:'Original story',tags:[],language:'en',containsSyntheticMedia:true,selfDeclaredMadeForKids:true});
const kidsMetadata=JSON.parse(calls[0].init.body);
assert.equal(kidsMetadata.status.privacyStatus,'private');
assert.equal(kidsMetadata.status.selfDeclaredMadeForKids,true);
assert.equal(kidsMetadata.status.containsSyntheticMedia,true);
assert.equal(kidsMetadata.snippet.defaultLanguage,'en');

calls.length=0;
await publisher.uploadPrivate({fileUri:'mock://general.mp4',title:'Tech story',description:'General audience',tags:[],language:'en',containsSyntheticMedia:false,selfDeclaredMadeForKids:false});
const generalMetadata=JSON.parse(calls[0].init.body);
assert.equal(generalMetadata.status.selfDeclaredMadeForKids,false);
assert.equal(generalMetadata.status.containsSyntheticMedia,false);
console.log('✓ YouTube upload explicitly declares MADE_FOR_KIDS for child-directed series');
console.log('✓ general-audience upload explicitly remains not made for kids');
