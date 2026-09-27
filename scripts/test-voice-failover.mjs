import assert from 'node:assert/strict';
import { withVoiceFailover, classifyVoiceProviderFailure } from '../packages/runtime-node/voice-failover.mjs';

const input = { text: 'A short diagnostic sentence.', voice: 'voice-en', language: 'en-US' };
let primaryCalls = 0;
let fallbackCalls = 0;
const primary = { name: 'elevenlabs', async synthesize() { primaryCalls += 1; throw new Error('ElevenLabs TTS failed 401: invalid api key'); } };
const fallback = { name: 'gemini', async synthesize(value) { fallbackCalls += 1; return { provider: 'gemini', model: 'gemini-tts', uri: 'mock://audio', mimeType: 'audio/mpeg', durationSeconds: 1.2, voiceId: value.voice }; } };
const routed = withVoiceFailover(primary, fallback);
const result = await routed.synthesize(input);
assert.equal(primaryCalls, 1);
assert.equal(fallbackCalls, 1);
assert.equal(result.provider, 'gemini');
assert.equal(result.metadata.voiceRouting.fallback, true);
assert.equal(result.metadata.voiceRouting.status, 'INVALID_CREDENTIALS');
assert.equal(classifyVoiceProviderFailure(new Error('HTTP 429 rate limit')), 'RATE_LIMITED');
assert.equal(classifyVoiceProviderFailure(new Error('HTTP 503 temporary upstream')), 'RECOVERABLE_FAILURE');
console.log('voice failover tests passed');
