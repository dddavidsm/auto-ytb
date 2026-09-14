import assert from 'node:assert/strict';
import { buildDialogueFormatDNA, evaluateDialogueCharacterFormatGate } from '../packages/production/dist/index.js';

const negativeFastRender = evaluateDialogueCharacterFormatGate({
  speakerCount: 1,
  speakingCharacterCount: 1,
  lipSync: 'NOT_EVALUATED',
  voiceDiversity: 'FAIL',
  motionCoverage: 0.08,
  staticImageCoverage: 0.92,
  cameraShotTypes: ['DOCUMENTARY_CARD'],
  reactionShotCount: 0,
  captionStyle: 'SMALL_SRT',
  presentationLikeScore: 0.71,
  pipContinuity: 'WARN',
});
assert.equal(negativeFastRender.status, 'FAIL');
assert.ok(negativeFastRender.blockers.includes('real lip sync is missing'));
assert.ok(negativeFastRender.blockers.includes('distinct character voices are missing'));
assert.ok(negativeFastRender.blockers.includes('static-image coverage is too high'));

const positive = evaluateDialogueCharacterFormatGate({
  speakerCount: 2,
  speakingCharacterCount: 2,
  lipSync: 'PASS',
  voiceDiversity: 'PASS',
  motionCoverage: 0.82,
  staticImageCoverage: 0.04,
  cameraShotTypes: ['TWO_SHOT', 'SHOT_REVERSE_SHOT', 'CLOSE_UP'],
  reactionShotCount: 3,
  captionStyle: 'BURNED_VIRAL',
  presentationLikeScore: 0.05,
  pipContinuity: 'PASS',
});
assert.equal(positive.status, 'PASS');
assert.equal(buildDialogueFormatDNA(positive.evidence).formatFamily, 'DIALOGUE_ANIMATED_STORY');
console.log('✓ dialogue animated story gate rejects FastRender and accepts a real two-character proof');
