import assert from 'node:assert/strict';
import { withElevenLabsVoiceControls } from '../packages/runtime-node/elevenlabs-voice-controls.mjs';

const requests=[];let fallbackCalls=0;
const fallback={name:'elevenlabs',async synthesize(input){fallbackCalls+=1;return{id:'fallback',uri:'mock://fallback',mimeType:'audio/mpeg',provider:'elevenlabs',voiceId:input.voice};}};
const store={async put(input){return{uri:`mock://store/${input.key}`,bytes:input.data.byteLength};}};
const controlled=withElevenLabsVoiceControls(fallback,{apiKey:'test-key',store,modelId:'eleven_multilingual_v2',fetchFn:async(url,init)=>{
  requests.push({url,init,body:JSON.parse(init.body)});
  return new Response(JSON.stringify({audio_base64:Buffer.from('audio').toString('base64'),normalized_alignment:{characters:['H','i'],character_start_times_seconds:[0,0.2],character_end_times_seconds:[0.2,0.4]}}),{status:200,headers:{'content-type':'application/json'}});
}});
const result=await controlled.synthesize({text:'Hi',voice:'voice-owl',language:'en',seed:12345,voiceSettings:{stability:0.6,similarityBoost:0.8,speed:0.95,useSpeakerBoost:true}});
assert.equal(fallbackCalls,0);
assert.equal(requests.length,1);
assert.ok(requests[0].url.includes('/voice-owl/with-timestamps'));
assert.equal(requests[0].body.seed,12345);
assert.equal(requests[0].body.voice_settings.stability,0.6);
assert.equal(requests[0].body.voice_settings.similarity_boost,0.8);
assert.equal(requests[0].body.voice_settings.speed,0.95);
assert.equal(requests[0].body.voice_settings.use_speaker_boost,true);
assert.equal('language_code' in requests[0].body,false);
assert.equal(result.durationSeconds,0.4);
assert.equal(result.metadata.voiceControls.controlled,true);

await controlled.synthesize({text:'No controls',voice:'default',language:'en'});
assert.equal(fallbackCalls,1);
console.log('✓ canonical seed and voice settings are sent to ElevenLabs timestamps endpoint');
console.log('✓ multilingual_v2 avoids unsupported language_code and preserves timestamp alignment');
console.log('✓ ordinary non-series narration still uses the standard voice provider path');
