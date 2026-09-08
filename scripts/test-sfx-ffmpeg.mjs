import assert from 'node:assert/strict';
import { mkdtemp, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { mixTimedSfx } from '../packages/runtime-node/soundtrack.mjs';

function run(command,args,capture=false){return new Promise((resolve,reject)=>{const child=spawn(command,args,{stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',(d)=>stdout+=d.toString());child.stderr.on('data',(d)=>stderr+=d.toString());child.on('error',reject);child.on('close',(code)=>code===0?resolve(capture?stdout:undefined):reject(new Error(`${command} exited ${code}: ${stderr.slice(-2000)}`)));});}

const root=await mkdtemp(join(tmpdir(),'auto-ytb-sfx-'));
const base=join(root,'base.mp4');
const sfx=join(root,'impact.wav');
await run('ffmpeg',['-y','-f','lavfi','-i','color=c=black:s=320x180:r=24:d=2','-f','lavfi','-i','sine=frequency=220:sample_rate=48000:duration=2','-shortest','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-b:a','96k',base]);
await run('ffmpeg',['-y','-f','lavfi','-i','sine=frequency=880:sample_rate=48000:duration=0.20','-c:a','pcm_s16le',sfx]);
const before=(await stat(base)).size;
const renderUri=pathToFileURL(base).href;
const returned=await mixTimedSfx({renderUri,sfx:[{assetId:'impact',uri:pathToFileURL(sfx).href,startSec:0.8,gain:0.25}]});
assert.equal(returned,renderUri);
const after=(await stat(base)).size;
assert.ok(after>0&&after!==before,'real SFX pass must rewrite the media file');
const probe=JSON.parse(await run('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type','-of','json',base],true));
const streamTypes=(probe.streams??[]).map((stream)=>stream.codec_type);
assert.ok(streamTypes.includes('video'),'mixed output must retain video');
assert.ok(streamTypes.includes('audio'),'mixed output must retain audio');
const duration=Number(probe.format?.duration??0);
assert.ok(duration>1.8&&duration<2.2,`mixed output duration should remain near 2s, got ${duration}`);
const unchanged=await mixTimedSfx({renderUri,sfx:[]});assert.equal(unchanged,renderUri);
console.log('✓ real FFmpeg timed SFX graph preserves video and audio streams');
console.log('✓ timed SFX mix preserves base video duration and rewrites final media');
