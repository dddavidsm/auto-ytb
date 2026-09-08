import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { NodeUploadAssetLoader } from './index.mjs';

function run(command,args){return new Promise((resolve,reject)=>{const child=spawn(command,args,{stdio:['ignore','ignore','pipe']});let stderr='';child.stderr.on('data',(chunk)=>stderr=(stderr+chunk.toString()).slice(-4000));child.on('error',reject);child.on('exit',(code)=>code===0?resolve():reject(new Error(`${command} failed ${code}: ${stderr}`)));});}
const num=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;

export function buildCaptureAestheticFilter(capture={}){
  const targetHeight=Math.max(360,Math.min(1920,Math.round(num(capture.targetHeight,1280))));
  const filters=[`scale=-2:'min(ih,${targetHeight})'`];
  if(capture.subtleSensorNoise)filters.push('noise=alls=1.6:allf=t+u');
  filters.push('format=yuv420p');
  return filters.join(',');
}

export function captureAestheticEnabled(profileValue){
  return Boolean(profileValue?.captureAesthetic?.enabled&&profileValue.captureAesthetic.preserveSyntheticDisclosure!==false);
}

export function withCaptureAesthetic(provider,profileValue,options={}){
  const profile=profileValue&&typeof profileValue==='object'?profileValue:null,capture=profile?.captureAesthetic??{};
  if(!profile||!captureAestheticEnabled(profile)||!options.store)return provider;
  const ffmpeg=options.ffmpeg||'ffmpeg',loader=options.loader??new NodeUploadAssetLoader(),store=options.store;
  return{
    name:provider.name,
    async generate(input){
      const asset=await provider.generate(input);
      if(!String(asset.mimeType??'').startsWith('video/'))return asset;
      const work=await mkdtemp(join(tmpdir(),'auto-ytb-capture-'));
      try{
        const loaded=await loader.load(asset.uri),source=join(work,'source.mp4'),output=join(work,'capture.mp4');await writeFile(source,loaded.body);
        const bitrate=Math.max(600,Math.min(12000,Math.round(num(capture.targetVideoBitrateKbps,2200)))),fps=Math.max(20,Math.min(60,Math.round(num(capture.frameRate,30)))),filter=buildCaptureAestheticFilter(capture);
        await run(ffmpeg,['-y','-i',source,'-vf',filter,'-r',String(fps),'-an','-c:v','libx264','-preset','veryfast','-b:v',`${bitrate}k`,'-maxrate',`${Math.round(bitrate*1.15)}k`,'-bufsize',`${bitrate*2}k`,'-movflags','+faststart',output]);
        const bytes=new Uint8Array(await readFile(output)),key=`capture/${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`,stored=await store.put({key,contentType:'video/mp4',data:bytes});
        return{
          ...asset,uri:stored.uri,bytes:stored.bytes??bytes.byteLength,
          metadata:{...(asset.metadata??{}),captureAesthetic:{...(asset.metadata?.captureAesthetic??{}),applied:true,purpose:capture.purpose||'editorial-naturalism',cameraProfile:profile.cameraProfile??null,targetHeight:num(capture.targetHeight,1280),targetVideoBitrateKbps:bitrate,frameRate:fps,transformations:['downscale-without-upscale','h264-consumer-compression',...(capture.subtleSensorNoise?['subtle-sensor-noise']:[])],syntheticProvenancePreserved:true,sourceAssetId:asset.id,sourceAssetUri:asset.uri}},
        };
      }finally{await rm(work,{recursive:true,force:true});}
    },
  };
}
