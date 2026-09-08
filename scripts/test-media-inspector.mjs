import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { inspectMediaWithFfmpeg } from '../packages/runtime-node/media-inspector.mjs';

const available=(command)=>spawnSync(command,['-version'],{stdio:'ignore'}).status===0;
if(!available('ffmpeg')||!available('ffprobe')){console.log('↷ media inspector test skipped: ffmpeg/ffprobe unavailable');process.exit(0);}
const dir=await mkdtemp(join(tmpdir(),'auto-ytb-media-'));
const good=join(dir,'good.mp4'),bad=join(dir,'bad.mp4');
function ff(args){const result=spawnSync('ffmpeg',['-y',...args],{encoding:'utf8'});if(result.status!==0)throw new Error(result.stderr.slice(-2000));}
try{
  ff(['-f','lavfi','-i','color=c=0x243447:s=1920x1080:r=30:d=2','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=2','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',good]);
  const pass=await inspectMediaWithFfmpeg({fileUri:`file://${good}`,expectedWidth:1920,expectedHeight:1080,expectedDurationSeconds:2,requireAudio:true});
  assert.equal(pass.passed,true);assert.equal(pass.hasVideo,true);assert.equal(pass.hasAudio,true);assert.equal(pass.width,1920);assert.equal(pass.height,1080);
  ff(['-f','lavfi','-i','color=c=black:s=1280x720:r=30:d=5','-f','lavfi','-i','anullsrc=r=48000:cl=stereo','-t','5','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac','-shortest',bad]);
  const fail=await inspectMediaWithFfmpeg({fileUri:`file://${bad}`,expectedWidth:1920,expectedHeight:1080,expectedDurationSeconds:5,requireAudio:true});
  assert.equal(fail.passed,false);assert.ok(fail.issues.some((issue)=>issue.startsWith('resolution-below-target')||issue.startsWith('long-black-frame')||issue.startsWith('long-audio-silence')));
  console.log('✓ final MP4 inspection accepts healthy media and blocks degraded renders');
}finally{await rm(dir,{recursive:true,force:true});}
