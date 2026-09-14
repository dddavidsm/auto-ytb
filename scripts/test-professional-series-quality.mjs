import assert from 'node:assert/strict';
import { buildProfessionalSeriesQualityGate, referenceCalibratedQualityScore, recordHumanReview } from '../packages/production/dist/index.js';

const strong = Object.fromEntries([
  'CHARACTER_QUALITY', 'CHARACTER_CONSISTENCY', 'FACIAL_PERFORMANCE', 'BODY_PERFORMANCE',
  'LIP_SYNC_QUALITY', 'VOICE_PERFORMANCE', 'SCENE_DESIGN', 'ENVIRONMENT_QUALITY',
  'LIGHTING', 'MATERIALS', 'ANIMATION_QUALITY', 'CAMERA', 'STAGING', 'AUDIO',
  'STORY', 'EMOTION', 'MUSIC', 'SFX', 'FOLEY', 'CAPTIONS', 'THUMBNAIL', 'REFERENCE_COMPETITIVENESS',
].map((key) => [key, 8]));

const pending = buildProfessionalSeriesQualityGate({ dimensions: strong, targetAudience: 'FAMILY_GENERAL' });
assert.equal(pending.status, 'READY_FOR_HUMAN_REVIEW');
assert.ok(pending.blockers.some((item) => item.startsWith('HUMAN_REVIEW')));

const lowMotion = buildProfessionalSeriesQualityGate({ dimensions: { ...strong, BODY_PERFORMANCE: 3, ANIMATION_QUALITY: 4 }, humanApproved: true });
assert.equal(lowMotion.status, 'READY_FOR_HUMAN_REVIEW');
assert.ok(lowMotion.blockers.some((item) => item.startsWith('BODY_PERFORMANCE')));

const review = recordHumanReview({ runId: 'cheap-puppet-fixture', score: 3, issues: ['flat acting', 'cheap rig'], liked: ['clear story'], disliked: ['static mouth'] });
const calibrated = referenceCalibratedQualityScore({ dimensions: strong, humanReviews: [review], referenceFloor: 7 });
assert.ok(calibrated.score < 7, `score should learn from the 3/10 human review: ${calibrated.score}`);
assert.equal(calibrated.humanMean, 3);
assert.ok(calibrated.calibrationPenalty > 0);

console.log('✓ professional series quality gate requires human approval and calibrates against low human scores');
