import type { ContentLibraryProvider } from './types.js';

function q(value:string){return value.replaceAll('\\','\\\\').replaceAll("'","\\'");}
function runtimeEnv():Record<string,string|undefined>{
  const processLike=(globalThis as unknown as {process?:{env?:Record<string,string|undefined>}}).process;
  return processLike?.env??{};
}

type DriveOauthCredentials={clientId:string;clientSecret:string;refreshToken:string};

export class GoogleDriveLibraryProvider implements ContentLibraryProvider {
  readonly name='google-drive';
  private driveToken?:{value:string;expiresAt:number};
  constructor(private readonly options:{getAccessToken:()=>Promise<string>;rootFolderName?:string;rootFolderId?:string;oauth?:DriveOauthCredentials;fetchFn?:typeof fetch}){}
  private dedicatedCredentials():DriveOauthCredentials|null{
    if(this.options.oauth?.refreshToken)return this.options.oauth;
    const env=runtimeEnv();
    const refreshToken=String(env.DRIVE_REFRESH_TOKEN??'').trim();
    if(!refreshToken)return null;
    const clientId=String(env.DRIVE_CLIENT_ID??env.YOUTUBE_CLIENT_ID??'').trim();
    const clientSecret=String(env.DRIVE_CLIENT_SECRET??env.YOUTUBE_CLIENT_SECRET??'').trim();
    if(!clientId||!clientSecret)throw new Error('DRIVE_REFRESH_TOKEN is configured but DRIVE_CLIENT_ID/DRIVE_CLIENT_SECRET (or fallback YOUTUBE client credentials) are missing');
    return{clientId,clientSecret,refreshToken};
  }
  private async accessToken(){
    const credentials=this.dedicatedCredentials();
    if(!credentials)return this.options.getAccessToken();
    if(this.driveToken&&this.driveToken.expiresAt>Date.now()+60_000)return this.driveToken.value;
    const fetchFn=this.options.fetchFn??fetch;
    const body=new URLSearchParams({client_id:credentials.clientId,client_secret:credentials.clientSecret,refresh_token:credentials.refreshToken,grant_type:'refresh_token'});
    const response=await fetchFn('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body});
    if(!response.ok)throw new Error(`Google Drive OAuth refresh failed ${response.status}: ${(await response.text()).slice(0,500)}`);
    const json=await response.json() as {access_token:string;expires_in:number};
    this.driveToken={value:json.access_token,expiresAt:Date.now()+Number(json.expires_in??3600)*1000};
    return this.driveToken.value;
  }
  private async request(url:string,init:RequestInit={}){
    const fetchFn=this.options.fetchFn??fetch;
    const token=await this.accessToken();
    const response=await fetchFn(url,{...init,headers:{authorization:`Bearer ${token}`,...(init.headers??{})}});
    if(!response.ok)throw new Error(`Google Drive ${init.method??'GET'} failed ${response.status}: ${(await response.text()).slice(0,700)}`);
    return response;
  }
  private async findFolder(name:string,parentId?:string){
    const terms=[`name='${q(name)}'`,`mimeType='application/vnd.google-apps.folder'`,`trashed=false`];
    if(parentId)terms.push(`'${q(parentId)}' in parents`);
    const url=`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(terms.join(' and '))}&fields=files(id,name,parents)&pageSize=10`;
    const json=await (await this.request(url)).json() as {files?:Array<{id:string;name:string}>};
    return json.files?.[0]??null;
  }
  private async createFolder(name:string,parentId?:string){
    const response=await this.request('https://www.googleapis.com/drive/v3/files?fields=id,name,parents',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name,mimeType:'application/vnd.google-apps.folder',...(parentId?{parents:[parentId]}:{})})});
    return response.json() as Promise<{id:string;name:string}>;
  }
  async ensurePath(pathSegments:string[]){
    const env=runtimeEnv();
    const rootFolderId=String(this.options.rootFolderId??env.DRIVE_ROOT_FOLDER_ID??'').trim()||undefined;
    const rootFolderName=String(this.options.rootFolderName??env.DRIVE_ROOT_FOLDER??'AUTO-YTB').trim()||'AUTO-YTB';
    const clean=(rootFolderId?pathSegments:[rootFolderName,...pathSegments]).map((value)=>String(value).trim()).filter(Boolean);
    let parentId: string|undefined=rootFolderId;
    const resolved:string[]=rootFolderId?[rootFolderName]:[];
    for(const name of clean){
      const found=await this.findFolder(name,parentId);
      const folder=found??await this.createFolder(name,parentId);
      parentId=folder.id;
      resolved.push(name);
    }
    if(!parentId)throw new Error('Google Drive library path cannot be empty');
    return {folderId:parentId,path:resolved.join('/')};
  }
  private async resumableUpload(input:{folderId:string;fileName:string;mimeType:string;data:Uint8Array;metadata?:Record<string,unknown>}){
    const metadata={name:input.fileName,parents:[input.folderId],appProperties:{managedBy:'auto-ytb'},description:input.metadata?JSON.stringify(input.metadata).slice(0,5000):undefined};
    const init=await this.request('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,webViewLink,size',{method:'POST',headers:{'content-type':'application/json; charset=UTF-8','x-upload-content-type':input.mimeType,'x-upload-content-length':String(input.data.byteLength)},body:JSON.stringify(metadata)});
    const location=init.headers.get('location');
    if(!location)throw new Error('Google Drive resumable upload did not return a session URL');
    const copy=new Uint8Array(input.data.byteLength);
    copy.set(input.data);
    const fetchFn=this.options.fetchFn??fetch;
    const response=await fetchFn(location,{method:'PUT',headers:{'content-type':input.mimeType,'content-length':String(copy.byteLength)},body:copy.buffer});
    if(!response.ok)throw new Error(`Google Drive upload failed ${response.status}: ${(await response.text()).slice(0,700)}`);
    return response.json() as Promise<{id:string;webViewLink?:string;size?:string}>;
  }
  async upload(input:{pathSegments:string[];fileName:string;mimeType:string;data:Uint8Array|string;metadata?:Record<string,unknown>}){
    const folder=await this.ensurePath(input.pathSegments);
    const data=typeof input.data==='string'?new TextEncoder().encode(input.data):input.data;
    const result=await this.resumableUpload({folderId:folder.folderId,fileName:input.fileName,mimeType:input.mimeType,data,metadata:input.metadata});
    return {externalId:result.id,uri:result.webViewLink??`https://drive.google.com/open?id=${result.id}`,bytes:Number(result.size??data.byteLength)};
  }
  async writeJson(input:{pathSegments:string[];fileName:string;value:unknown;metadata?:Record<string,unknown>}){
    return this.upload({...input,mimeType:'application/json',data:JSON.stringify(input.value,null,2)});
  }
}
