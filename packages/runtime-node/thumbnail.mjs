import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { escapeFfmpegFilterPath, ffmpegFontOption, pathFromUri } from './file-path.mjs';

async function run(command,args){await new Promise((res,rej)=>{const c=spawn(command,args,{stdio:['ignore','pipe','pipe']});let e='';c.stderr.on('data',d=>e+=d.toString());c.on('error',rej);c.on('close',code=>code===0?res():rej(new Error(`${command} exited ${code}: ${e.slice(-1500)}`)));});}
export class FfmpegThumbnailComposer {
  name='ffmpeg-thumbnail';
  constructor(options={}){this.ffmpeg=options.ffmpeg??'ffmpeg';this.outputRoot=resolve(options.outputRoot??'.data/thumbnails');}
  async materialize(uri,key){const local=pathFromUri(uri);if(local)return local;if(/^https?:\/\//.test(uri)){const r=await fetch(uri);if(!r.ok)throw new Error(`Thumbnail source download failed ${r.status}`);const p=resolve(this.outputRoot,'.sources',`${key}.png`);await mkdir(dirname(p),{recursive:true});await writeFile(p,Buffer.from(await r.arrayBuffer()));return p;}throw new Error(`Unsupported thumbnail background URI ${uri}`);}
  async compose(input){
    const source=await this.materialize(input.backgroundUri,input.outputKey.replace(/[^a-z0-9]/gi,'-'));
    const out=resolve(this.outputRoot,input.outputKey);
    await mkdir(dirname(out),{recursive:true});
    const text=String(input.text??'').trim().slice(0,28).toUpperCase();
    const filters=[`scale=1280:720:force_original_aspect_ratio=increase`,`crop=1280:720`,`eq=contrast=1.08:saturation=1.08`];
    if(text){
      const textFile=`${out}.txt`;await writeFile(textFile,text);
      const escaped=escapeFfmpegFilterPath(textFile);
      const font=ffmpegFontOption();
      filters.push(`drawbox=x=0:y=500:w=1280:h=220:color=black@0.42:t=fill`,`drawtext=${font?`${font}:`:''}textfile='${escaped}':fontcolor=white:fontsize=76:line_spacing=8:borderw=3:bordercolor=black:x=70:y=545`);
    }
    await run(this.ffmpeg,['-y','-i',source,'-vf',filters.join(','),'-frames:v','1','-q:v','3',out]);
    const bytes=(await readFile(out)).byteLength;
    if(bytes>2*1024*1024) await run(this.ffmpeg,['-y','-i',out,'-q:v','6','-frames:v','1',`${out}.small.jpg`]).then(async()=>{const b=await readFile(`${out}.small.jpg`);await writeFile(out,b);});
    return {id:`thumb-${Date.now()}`,uri:`file://${out}`,mimeType:'image/jpeg',bytes:(await readFile(out)).byteLength,provider:this.name};
  }
}
