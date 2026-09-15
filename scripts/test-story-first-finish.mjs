import assert from 'node:assert/strict';
import { detectStoryFirstPlaceholders, evaluateStoryFirstFinalGate, separateStoryFirstScores } from '../packages/production/dist/index.js';

assert.deepEqual(detectStoryFirstPlaceholders([{ provider: 'gemini-video' }, { provider: 'local-storyboard-fallback-after-429' }]), { placeholderCount: 1, placeholderIds: ['local-storyboard-fallback-after-429'], status: 'PARTIAL_RENDER' });
assert.deepEqual(separateStoryFirstScores({ storyScore: 9, executionScore: 2, placeholders: 3, visualQcComplete: false }), { storyScore: 9, executionScore: 2, finalContentScore: 2, status: 'PARTIAL_RENDER' });
assert.deepEqual(evaluateStoryFirstFinalGate({ placeholders: 3, storyComplete: true, audioFinal: true, captionsFinal: true, visualQcComplete: false }), { status: 'PARTIAL_RENDER', blockers: ['PLACEHOLDER_SHOTS', 'VISUAL_QC_INCOMPLETE'] });
assert.equal(evaluateStoryFirstFinalGate({ placeholders: 0, storyComplete: true, audioFinal: true, captionsFinal: true, visualQcComplete: true }).status, 'READY_FOR_HUMAN_REVIEW');
console.log('✓ story-first finish blocks placeholders and separates story/execution scores');
