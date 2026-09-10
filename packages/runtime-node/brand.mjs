import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { pathFromUri } from './file-path.mjs';

async function run(command,args){await new Promise((res,rej)=>{const child=spawn(command,args,{stdio:['ignore','pipe','pipe']});let stderr='';child.stderr.on('data',(d)=>stderr+=d.toString());child.on('error',rej);child.on('close',(code)=>code===0?res():rej(new Error(`${command} exited ${code}: ${stderr.slice(-1800)}`)));});}
function esc(path){return path.replaceAll("'","\\'");}

export class FfmpegBrandComposer{
  name='ffmpeg-brand';
  constructor(options={}){this.ffmpeg=options.ffmpeg??'ffmpeg';this.outputRoot=resolve(options.outputRoot??'.data/brand');}
  async materialize(uri,key){
    const local=pathFromUri(uri);if(local)return local;
    if(/^https?:\/\//.test(uri)){const response=await fetch(uri);if(!response.ok)throw new Error(`Brand source download failed ${response.status}`);const path=resolve(this.outputRoot,'.sources',`${key}.png`);await mkdir(dirname(path),{recursive:true});await writeFile(path,Buffer.from(await response.arrayBuffer()));return path;}
    throw new Error(`Unsupported brand background URI ${uri}`);
  }
  async compose(input){
    const source=await this.materialize(input.backgroundUri,input.outputKey.replace(/[^a-z0-9]/gi,'-'));
    const out=resolve(this.outputRoot,input.outputKey);await mkdir(dirname(out),{recursive:true});
    const variant=input.variant??'avatar';
    let width=800,height=800,filter=`scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;
    if(variant==='banner'){width=2560;height=1440;filter=`scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},eq=contrast=1.05:saturation=1.03,drawbox=x=0:y=0:w=${width}:h=${height}:color=black@0.18:t=fill`;}
    else if(variant==='social_banner'){width=1500;height=500;filter=`scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},eq=contrast=1.05:saturation=1.03,drawbox=x=0:y=0:w=${width}:h=${height}:color=black@0.16:t=fill`;}
    else if(variant==='watermark'){width=150;height=150;filter=`scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}`;}
    const title=String(input.title??'').trim().slice(0,80);
    const tagline=String(input.tagline??'').trim().slice(0,120);
    if((variant==='banner'||variant==='social_banner')&&(title||tagline)){
      const titleFile=`${out}.title.txt`,taglineFile=`${out}.tagline.txt`;await writeFile(titleFile,title.toUpperCase());await writeFile(taglineFile,tagline);
      const titleSize=variant==='banner'?92:56,tagSize=variant==='banner'?38:26;
      const boxY=variant==='banner'?560:160,boxH=variant==='banner'?330:210;
      filter+=`,drawbox=x=${Math.round(width*0.18)}:y=${boxY}:w=${Math.round(width*0.64)}:h=${boxH}:color=black@0.38:t=fill`;
      if(title)filter+=`,drawtext=textfile='${esc(titleFile)}':fontcolor=white:fontsize=${titleSize}:borderw=2:bordercolor=black:x=(w-text_w)/2:y=${boxY+55}`;
      if(tagline)filter+=`,drawtext=textfile='${esc(taglineFile)}':fontcolor=white@0.9:fontsize=${tagSize}:borderw=1:bordercolor=black:x=(w-text_w)/2:y=${boxY+175}`;
    }
    const mimeType=variant==='watermark'?'image/png':'image/jpeg';
    const args=['-y','-i',source,'-vf',filter,'-frames:v','1'];
    if(mimeType==='image/jpeg')args.push('-q:v','3');
    args.push(out);await run(this.ffmpeg,args);
    return {id:`brand-${variant}-${Date.now()}`,uri:`file://${out}`,mimeType,bytes:(await readFile(out)).byteLength,provider:this.name,model:'brand-compose-v1'};
  }
}
