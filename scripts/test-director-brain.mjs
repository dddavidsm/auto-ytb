import assert from 'node:assert/strict';
import {
  buildCompetencyProfile,
  calibrateAutomatedScore,
  createHumanGroundTruthFeedback,
  evaluateMotionPhysics,
  rankGenerationByValuePerPoint,
  validateMossCharacterMaster,
  validateSceneStateContinuity,
} from '../packages/production/dist/index.js';

const human = createHumanGroundTruthFeedback({ runId: 'MOSS_STORY_FIRST_SHORT_FLOW_V1', humanOverallScore: 5, automatedScoreAtReview: 8.2, issues: ['CHARACTER_FACE_DRIFT', 'BODY_PROPORTION_DRIFT', 'QUADRUPED_BIPED_DRIFT', 'PROP_DRIFT', 'FLOATING_MOTION', 'LOW_CHARACTER_AGENCY', 'OVER_NARRATED'], liked: ['individual attractive frames'], disliked: ['complete video continuity'], source: 'USER', timestamp: '2026-09-15T00:00:00.000Z' });
assert.equal(human.humanOverallScore, 5);
assert.equal(human.calibrationError, 3.2);
assert.deepEqual(calibrateAutomatedScore({ humanScore: 5, automatedScore: 8.7 }), { humanScore: 5, automatedScore: 8.7, calibrationError: 3.7, authoritativeScore: 5, humanOverridesAutomated: true });

const master = { id: 'MOSS_CHARACTER_MASTER_V2', version: '2.0.0', flowCharacterId: 'f06fbacd-68e7-4644-a228-35708d84773e', source: 'google-flow:saved-frame-derived-character', canonicalReferences: ['flow://Moss'], traits: { species: 'red-panda-inspired anthropomorphic forest character', locomotion: 'BIPEDAL', headWidthHeightRatio: 1.05, muzzleSize: 0.28, eyeSize: 0.12, eyeSpacing: 0.2, earDimensions: 'rounded, cream inner ear, stable size', bodyHeight: 1, torsoProportions: 'compact upright torso', armLength: 0.38, legLength: 0.43, pawProportions: 'small expressive paws', tailLength: 0.65, tailThickness: 'large ringed tail, tapered end', tailRings: 'alternating warm russet and cream', furColors: ['warm red-orange', 'cream', 'dark brown'], creamMarkings: 'cream muzzle, cheeks and chest', scarfDimensions: 'short neck scarf with two hanging ends', scarfStripePattern: 'alternating horizontal stripes', scarfColors: ['moss green', 'cream'], }, forbiddenChanges: ['quadruped locomotion', 'face redesign', 'eye spacing drift', 'head/body ratio drift', 'scarf redesign', 'fur palette drift'] };
assert.equal(validateMossCharacterMaster(master).status, 'PASS');

const previous = { shotId: 'A-end', moss: { position: 'at workbench', pose: 'upright holding lantern', orientation: 'toward workbench', emotion: 'curious relief', locomotion: 'BIPEDAL', heldObjects: ['LANTERN_MASTER_V1'] }, lantern: { position: 'in Moss paws', state: 'lit' }, firefly: { position: 'none', state: 'not present' }, location: 'forest workshop', cameraSide: 'front-right', time: 'day', lighting: 'warm workshop light' };
const next = { ...previous, shotId: 'B-start', moss: { ...previous.moss, position: 'one step from workbench', emotion: 'concerned' } };
assert.equal(validateSceneStateContinuity(previous, next).status, 'PASS');
assert.equal(validateSceneStateContinuity(previous, { ...next, moss: { ...next.moss, locomotion: 'BIPEDAL', heldObjects: [] }, lantern: { position: 'none', state: 'MISSING' } }).status, 'FAIL');

assert.equal(evaluateMotionPhysics([{ footContact: true, groundContact: true, acceleration: true, deceleration: true, bodyWeight: true, objectContact: true, sliding: false, floating: false, teleportLikeDisplacement: false }]).status, 'PASS');
assert.equal(evaluateMotionPhysics([{ footContact: false, groundContact: false, acceleration: false, deceleration: false, bodyWeight: false, objectContact: false, sliding: true, floating: true, teleportLikeDisplacement: false }]).status, 'FAIL');

const candidates = rankGenerationByValuePerPoint([{ id: 'character-continuation', expectedInformationGain: 9, expectedProductionValue: 9, creditCost: 12 }, { id: 'random-lookdev', expectedInformationGain: 2, expectedProductionValue: 1, creditCost: 12 }]);
assert.equal(candidates[0].id, 'character-continuation');
const profiles = buildCompetencyProfile([{ provider: 'google-flow', model: 'Omni 1.1 Flash', mode: 'CHARACTER_ENTITY', shotType: 'identity-motion', referenceMethod: 'Moss-character-entity', motionType: 'biped-walk', identityConsistency: 8, bodyConsistency: 7, propConsistency: 7, motionPhysics: 6, dialoguePerformance: 5, lipSync: 4, promptAdherence: 8, cameraControl: 7, temporalStability: 7, storyAccuracy: 8, costPerGeneration: 0, creditCost: 12, latencySeconds: 60, kept: true }]);
assert.equal(Object.values(profiles)[0].sampleCount, 1);
console.log('✓ director brain preserves human calibration, character lock, scene state, physics and credit intelligence');
