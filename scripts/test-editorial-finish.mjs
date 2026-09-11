import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { withArchetypeEditorialFinish } from '../packages/runtime-node/editorial-finish.mjs';

function run(command,args,capture=false){return new Promise((resolve,reject)=>{const child=spawn(command,args,{stdio:['ignore','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',(d)=>stdout+=d.toString());child.stderr.on('data',(d)=>stderr+=d.toString());child.on('error',reject);child.on('close',(code)=>code===0?resolve(capture?stdout:undefined):reject(new Error(`${command} exited ${code}: ${stderr.slice(-2500)}`)));});}

const root=await mkdtemp(join(tmpdir(),'auto-ytb-editorial-finish-'));
const base=join(root,'final.mp4');
const manifestPath=join(root,'manifest.json');
await run('ffmpeg',['-y','-f','lavfi','-i','color=c=0x203040:s=320x180:r=24:d=2','-f','lavfi','-i','sine=frequency=220:sample_rate=48000:duration=2','-shortest','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-b:a','96k',base]);
const before=(await stat(base)).size;
const manifest={
  projectId:'editorial-finish-test',contentFormat:'LONG_HORIZONTAL',frame:{width:320,height:180},aspectRatio:'16:9',
  executionPlan:{archetypeId:'EXPLAINER_DOCUMENTARY',scriptMode:'NARRATION',voiceMode:'SINGLE_NARRATOR',captionMode:'FULL_SPEECH',audioMode:'NARRATION_LED',visualMode:'EVIDENCE_FIRST'},
  script:{title:'Test',language:'en',targetDurationSec:2,thesis:'test',outro:'',beats:[{id:'b1',startSec:0,targetDurationSec:1,purpose:'hook',narration:'A visible caption proves the finishing pass.',onScreenText:'A visible caption',visualIntent:'A simple visual hook',sourceIds:[],retentionDevice:'open_loop'},{id:'b2',startSec:1,targetDurationSec:1,purpose:'payoff',narration:'The clean cut preserves the picture.',visualIntent:'A clear payoff',sourceIds:[],retentionDevice:'reveal'}]},
  scenes:[{id:'b1-s1',startSec:0,durationSec:1,kind:'motion_graphic',instruction:'Simple hook',sourceIds:[],generated:false},{id:'b2-s1',startSec:1,durationSec:1,kind:'motion_graphic',instruction:'Simple payoff',sourceIds:[],generated:false}],
  captionPlan:{preset:'EDITORIAL_CLEAN',enabled:true,burnIn:true,source:'ON_SCREEN_CONTEXT',speakerAware:false,maxChars:36,maxDurationSeconds:2.4,position:'BOTTOM',safeBottomPercent:8,fontScale:0.9,emphasis:'KEY_PHRASES'},
  editPlan:{preset:'DOCUMENTARY',transitionMode:'MOTIVATED',transitionDurationSeconds:0.12,punchInAnchors:true,punchInScale:1.02,filmLook:false,filmGrain:0},
};
await writeFile(manifestPath,JSON.stringify(manifest,null,2),'utf8');
const inner={name:'fixture-renderer',async render(){return{id:'render-test',uri:pathToFileURL(base).href,mimeType:'video/mp4',provider:'fixture',durationSeconds:2,metadata:{fixture:true}};}};
const wrapped=withArchetypeEditorialFinish(inner,{ffmpeg:'ffmpeg'});
const result=await wrapped.render({manifestUri:pathToFileURL(manifestPath).href,outputKey:'ignored.mp4'});
const after=(await stat(base)).size;
assert.notEqual(after,before,'editorial finish must rewrite the video');
assert.equal(result.metadata.renderExecution.captionsBurned,true);
assert.equal(result.metadata.renderExecution.captionCueCount,1);
assert.ok(result.metadata.renderExecution.punchInsApplied>=1);
assert.equal(result.metadata.renderExecution.transitionsApplied,1);
assert.equal(result.metadata.renderExecution.transitionsSkipped,0);
const persisted=JSON.parse(await readFile(manifestPath,'utf8'));
assert.equal(persisted.renderExecution.captionsBurned,true);
assert.equal(persisted.renderExecution.editPreset,'DOCUMENTARY');
const probe=JSON.parse(await run('ffprobe',['-v','error','-show_entries','format=duration:stream=codec_type','-of','json',base],true));
const types=(probe.streams??[]).map((stream)=>stream.codec_type);
assert.ok(types.includes('video'),'finished output must retain video');
assert.ok(types.includes('audio'),'finished output must retain audio');
const duration=Number(probe.format?.duration??0);
assert.ok(duration>1.8&&duration<2.2,`editorial finish must preserve duration, got ${duration}`);
const black=await run('ffmpeg',['-hide_banner','-i',base,'-vf','blackdetect=d=0.4:pix_th=0.01','-an','-f','null','-'],true);
assert.doesNotMatch(black,/black_start/,'transition fallback must not blacken the preceding timeline');
console.log('✓ archetype CaptionPlan is burned into the final MP4 with FFmpeg');
console.log('✓ EditPlan punch-ins execute and preserve the audio/video duration');
console.log('✓ render execution evidence is persisted into the canonical manifest');
