import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { NodeLocalObjectStore } from '../packages/runtime-node/index.mjs';
import { bindDialogueVoiceProviderToSeries, parseSeriesDialogueTurns } from '../packages/runtime-node/series-dialogue-voice.mjs';
import { auditSeriesVoiceContinuity } from '../packages/runtime-node/series-voice.mjs';

const work=await mkdtemp(join(tmpdir(),'auto-ytb-dialogue-test-'));
try{
  const source=join(work,'source.mp3');
  const ff=spawnSync('ffmpeg',['-y','-f','lavfi','-i','anullsrc=r=44100:cl=mono','-t','0.25','-c:a','libmp3lame','-b:a','128k',source],{stdio:'ignore'});
  if(ff.status!==0)throw new Error('ffmpeg fixture generation failed');
  const context={required:true,seriesKey:'old-owl',primaryVoiceKey:'old-owl',voiceCast:[
    {key:'old-owl',name:'Old Owl',role:'narrator',continuityKey:'owl-v1',voiceProfile:{provider:'elevenlabs',voiceId:'voice-owl',stability:0.62}},
    {key:'luna',name:'Luna',role:'companion',continuityKey:'luna-v1',voiceProfile:{provider:'elevenlabs',voiceId:'voice-luna',stability:0.7}},
  ]};
  const turns=parseSeriesDialogueTurns('[Old Owl] Did you hear that?\n[Luna] The moon chime rang!',context);
  assert.equal(turns.length,2);
  assert.equal(turns[0].voice.key,'old-owl');
  assert.equal(turns[1].voice.key,'luna');

  const calls=[];
  const provider={name:'mock-tts',async synthesize(input){calls.push(input);const chars=[...input.text],duration=0.25,step=duration/Math.max(1,chars.length);return{id:`turn-${calls.length}`,uri:`file://${source}`,mimeType:'audio/mpeg',provider:'mock-tts',voiceId:input.voice,durationSeconds:duration,costUsd:0.1,alignment:{characters:chars,characterStartTimesSeconds:chars.map((_,i)=>i*step),characterEndTimesSeconds:chars.map((_,i)=>(i+1)*step)}};}};
  const store=new NodeLocalObjectStore(join(work,'store'));
  const bound=bindDialogueVoiceProviderToSeries(provider,context,{store,ffmpeg:'ffmpeg'});
  const result=await bound.synthesize({text:'[Old Owl] Did you hear that?\n[Luna] The moon chime rang!',voice:'channel-default',language:'en'});
  assert.deepEqual(calls.map((call)=>call.voice),['voice-owl','voice-luna']);
  assert.equal(result.voiceId,'multi-speaker');
  assert.equal(result.metadata.voiceContinuity.multiSpeaker,true);
  assert.equal(result.metadata.voiceContinuity.speakerCount,2);
  assert.equal(result.metadata.voiceContinuity.speakerProofs.length,2);
  assert.equal(result.metadata.voiceContinuity.unknownSpeakers.length,0);
  assert.ok(result.alignment.characters.length>10);
  assert.ok(result.durationSeconds>=0.5);
  assert.equal(result.costUsd,0.2);
  const audit=auditSeriesVoiceContinuity(result,context);
  assert.equal(audit.passed,true);
  assert.equal(audit.multiSpeaker,true);
  assert.equal(audit.speakerCount,2);

  calls.length=0;
  await assert.rejects(
    ()=>bound.synthesize({text:'[Old Owl] Come closer.\n[Stranger] I found it!',voice:'channel-default',language:'en'}),
    /Unknown series dialogue speaker\(s\): Stranger/
  );
  assert.equal(calls.length,0);

  console.log('✓ dialogue tags route recurring characters to distinct canonical voices');
  console.log('✓ per-turn audio is concatenated into one aligned voice asset for scene/subtitle synchronization');
  console.log('✓ multi-speaker continuity proof passes only for canonical cast and voice IDs');
  console.log('✓ unknown dialogue speakers fail before spending TTS budget');
} finally {await rm(work,{recursive:true,force:true});}
