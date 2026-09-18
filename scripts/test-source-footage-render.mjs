import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { FfmpegRenderer } from '../packages/runtime-node/index.mjs';

function run(command,args,{capture=false}={}){return new Promise((resolve,reject)=>{const child=spawn(command,args,{stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',(chunk)=>stdout+=chunk.toString());child.stderr.on('data',(chunk)=>stderr+=chunk.toString());child.on('error',reject);child.on('close',(code)=>code===0?resolve(capture?stdout:''):reject(new Error(`${command} exited ${code}: ${stderr.slice(-1800)}`)));});}

const root=await mkdtemp(join(tmpdir(),'auto-ytb-source-footage-'));
try{
  const source=join(root,'source.mp4');
  await run('ffmpeg',['-y','-f','lavfi','-i','testsrc=size=320x320:rate=24:duration=3','-c:v','libx264','-pix_fmt','yuv420p',source]);
  const manifestPath=join(root,'manifest.json');
  await writeFile(manifestPath,JSON.stringify({projectId:'source-footage-test',createdAt:'x',contentFormat:'LONG_HORIZONTAL',aspectRatio:'1:1',frame:{width:320,height:320},script:{title:'x',language:'en',targetDurationSec:1.5,thesis:'x',beats:[],outro:''},packaging:[],thumbnails:[],selectedPackagingId:'p',scenes:[{id:'broll-1',startSec:0,durationSec:1.5,kind:'broll',instruction:'show the action',sourceIds:[],generated:false}],assets:[{id:'footage-1',uri:`file://${source}`,mimeType:'video/mp4',provider:'user-source-footage',sceneId:'broll-1',generated:false,sourceIds:[],license:'owned-or-licensed',metadata:{sourceFootageId:'footage-1',clipStartSec:1,clipEndSec:2,cropMode:'SMART_CENTER'}}],estimatedCostUsd:0,actualCostUsd:0,containsSyntheticMedia:false}));
  const renderer=new FfmpegRenderer({outputRoot:root,width:320,height:320,fps:24});
  await assert.rejects(() => renderer.render({manifestUri:`file://${manifestPath}`,outputKey:'out.mp4'}), /RENDER_PLAN_INVALID/);
  console.log('✓ renderer fails loudly when source footage cannot cover the requested scene duration');
}finally{await rm(root,{recursive:true,force:true});}
