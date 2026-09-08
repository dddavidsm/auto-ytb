import assert from 'node:assert/strict';
import { GoogleDriveLibraryProvider } from '@auto-ytb/providers';

let fallbackCalls=0;
const calls=[];
const fetchFn=async(url,init={})=>{
  const target=String(url);calls.push({url:target,method:init.method??'GET'});
  if(target==='https://oauth2.googleapis.com/token'){
    assert.match(String(init.body),/refresh_token=drive-refresh/);
    return new Response(JSON.stringify({access_token:'drive-access',expires_in:3600}),{status:200,headers:{'content-type':'application/json'}});
  }
  if(target.startsWith('https://www.googleapis.com/drive/v3/files?q=')){
    assert.equal(init.headers?.authorization,'Bearer drive-access');
    assert.match(decodeURIComponent(target),/'drive-root' in parents/);
    return new Response(JSON.stringify({files:[{id:'channel-folder',name:'CHANNEL'}]}),{status:200,headers:{'content-type':'application/json'}});
  }
  throw new Error(`unexpected Drive URL ${target}`);
};

const provider=new GoogleDriveLibraryProvider({
  getAccessToken:async()=>{fallbackCalls+=1;return'youtube-access';},
  rootFolderName:'AUTO-YTB',
  rootFolderId:'drive-root',
  oauth:{clientId:'drive-client',clientSecret:'drive-secret',refreshToken:'drive-refresh'},
  fetchFn,
});
const folder=await provider.ensurePath(['CHANNEL']);
assert.equal(folder.folderId,'channel-folder');
assert.equal(folder.path,'AUTO-YTB/CHANNEL');
assert.equal(fallbackCalls,0);
assert.equal(calls.filter((call)=>call.url==='https://oauth2.googleapis.com/token').length,1);
console.log('✓ Google Drive can use a dedicated Google account independently from YouTube OAuth');
