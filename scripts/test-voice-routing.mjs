import assert from 'node:assert/strict';
import { resolveVoiceId } from '../packages/runtime-node/voice-routing.mjs';

const env={
  ELEVENLABS_VOICE_ID_ES:'voice-es',
  ELEVENLABS_VOICE_ID_EN:'voice-en',
  ELEVENLABS_VOICE_ID:'voice-fallback',
  GEMINI_VOICE_ID:'Kore',
  VOICE_ID:'legacy',
};

assert.equal(resolveVoiceId({provider:'elevenlabs',language:'es-ES',env}),'voice-es');
assert.equal(resolveVoiceId({provider:'elevenlabs',language:'en-US',env}),'voice-en');
assert.equal(resolveVoiceId({provider:'elevenlabs',language:'fr-FR',env}),'voice-fallback');
assert.equal(resolveVoiceId({provider:'gemini',language:'es-ES',env}),'Kore');
assert.throws(()=>resolveVoiceId({provider:'elevenlabs',language:'es-ES',env:{}}),/ELEVENLABS_VOICE_ID_MISSING_FOR_LANGUAGE:es-es/);
console.log('voice routing tests passed');
