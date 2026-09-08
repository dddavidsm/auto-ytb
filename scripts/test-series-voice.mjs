import assert from 'node:assert/strict';
import { auditSeriesVoiceContinuity, bindVoiceProviderToSeries, selectPrimarySeriesVoice } from '../packages/runtime-node/series-voice.mjs';

const context={
  required:true,
  seriesKey:'old-owl-stories',
  primaryVoiceKey:'old-owl',
  voiceCast:[
    {key:'old-owl',name:'Old Owl',role:'narrator',continuityKey:'owl-voice-v1',voiceProfile:{provider:'elevenlabs',voiceId:'voice-owl',stability:0.62,similarityBoost:0.82,speed:0.96}},
    {key:'luna',name:'Luna',role:'companion',continuityKey:'luna-voice-v1',voiceProfile:{provider:'elevenlabs',voiceId:'voice-luna'}},
  ],
};
const primary=selectPrimarySeriesVoice(context);
assert.equal(primary.key,'old-owl');
assert.equal(primary.voiceId,'voice-owl');
assert.equal(primary.settings.stability,0.62);

const calls=[];
const provider={name:'mock-tts',async synthesize(input){calls.push(input);return{id:'audio',uri:'mock://audio.mp3',mimeType:'audio/mpeg',provider:'mock-tts',voiceId:input.voice,durationSeconds:5,metadata:{providerProof:true}};}};
const bound=bindVoiceProviderToSeries(provider,context);
const first=await bound.synthesize({text:'The moon door opened.',voice:'generic-channel-voice',language:'en'});
const second=await bound.synthesize({text:'The moon door opened.',voice:'another-channel-voice',language:'en'});
assert.equal(calls[0].voice,'voice-owl');
assert.equal(calls[1].voice,'voice-owl');
assert.equal(calls[0].seed,calls[1].seed);
assert.equal(first.metadata.providerProof,true);
assert.equal(first.metadata.voiceContinuity.characterName,'Old Owl');
assert.equal(first.metadata.voiceContinuity.usedFallbackVoice,false);
assert.equal(auditSeriesVoiceContinuity(first,context).passed,true);

const mismatched={...first,voiceId:'wrong',metadata:{...first.metadata,voiceContinuity:{...first.metadata.voiceContinuity,resolvedVoiceId:'wrong'}}};
const mismatchAudit=auditSeriesVoiceContinuity(mismatched,context);
assert.equal(mismatchAudit.passed,false);
assert.ok(mismatchAudit.issues.includes('canonical-voice-id-mismatch'));

const fallbackContext={required:true,seriesKey:'pilot',voiceCast:[{key:'pilot-host',name:'Pilot Host',role:'host',continuityKey:'host-v1',voiceProfile:{description:'warm curious narrator'}}]};
const fallback=bindVoiceProviderToSeries(provider,fallbackContext);
const fallbackAudio=await fallback.synthesize({text:'Pilot episode.',voice:'channel-default',language:'en'});
assert.equal(fallbackAudio.voiceId,'channel-default');
assert.equal(fallbackAudio.metadata.voiceContinuity.usedFallbackVoice,true);
assert.equal(auditSeriesVoiceContinuity(fallbackAudio,fallbackContext).passed,true);

console.log('✓ recurring series narration uses the canonical narrator/lead voice instead of arbitrary channel voice');
console.log('✓ voice continuity seed remains stable for the same series character');
console.log('✓ canonical voice-id drift is detected before release');
console.log('✓ unresolved pilot voice profiles fall back safely and remain explicitly auditable');
await import('./test-elevenlabs-voice-controls.mjs');
