import assert from 'node:assert/strict';
import { calculateCompetitiveVisualReport, calculatePresentationLikeScore, calculateVisualCadenceReport, classifyVisualNarrativeCoverage, evaluateVisualFormatGates, recommendWinningFormat, scoreVisualizableScript } from '../packages/production/dist/index.js';

const story = [
  { spokenLine: 'The AI saw a seam in the wall.', visual: 'character notices and touches a wall seam', visualType: 'physical event' },
  { spokenLine: 'It pushed until the room opened.', visual: 'character pushes a door and the doorway opens', visualType: 'physical event' },
  { spokenLine: 'The server room lit up.', visual: 'the character crosses into a room and lights turn on', visualType: 'physical event' },
];
const coverage = story.map((beat, i) => classifyVisualNarrativeCoverage({ beatId: `b${i}`, ...beat, hasCharacter: true, hasAction: true, hasProp: true }));
assert.ok(coverage.every((item) => item.classification === 'DIRECT'));
assert.equal(classifyVisualNarrativeCoverage({ beatId: 'abstract', spokenLine: 'The system improved.', visual: 'show a dashboard chart' }).classification, 'ABSTRACT');
assert.equal(classifyVisualNarrativeCoverage({ beatId: 'bad', spokenLine: 'The system improved.', visual: 'show a mountain landscape' }).classification, 'UNRELATED');

const visualizable = scoreVisualizableScript(story);
assert.equal(visualizable.score, 100);
assert.ok(scoreVisualizableScript([{ spokenLine: 'The AI escaped.', visual: 'show a generic chart and terminal' }]).score < 50);

const cadence = calculateVisualCadenceReport({ durationSeconds: 18, referenceChangesPerSecond: .2, changes: Array.from({ length: 6 }, (_, i) => ({ action: true, pose: i > 0, camera: i % 2 === 0, prop: i > 0, location: i === 0 || i === 4, reaction: i > 0, reveal: i === 1 || i === 5 })) });
assert.equal(cadence.significantChanges, 6); assert.ok(cadence.actionChanges >= 6); assert.ok(cadence.changesPerSecond > .2);

const cleanPresentation = calculatePresentationLikeScore({ chartPrevalence: 0, dashboardPrevalence: 0, textPrevalence: .04, staticCompositionRatio: .1, repeatedLayoutRatio: .08, abstractGraphicRatio: .03, actionDensity: .75 });
const legacyPresentation = calculatePresentationLikeScore({ chartPrevalence: .5, dashboardPrevalence: .4, textPrevalence: .55, staticCompositionRatio: .82, repeatedLayoutRatio: .74, abstractGraphicRatio: .7, actionDensity: .12 });
assert.equal(cleanPresentation.decision, 'PASS'); assert.equal(legacyPresentation.decision, 'FAIL');
const competitive = calculateCompetitiveVisualReport({ hook: 8.5, actionDensity: 8, sceneProgression: 8, clarity: 8.5, focalSubject: 8.2, novelty: 8, storyReadability: 8.5 });
const gates = evaluateVisualFormatGates({ profile: 'ANIMATED_MICRO_STORY', narrativeCoverage: coverage, actionDensity: .75, presentationLike: cleanPresentation, competitive, hook: 8.5, visualRelevance: 8.2, visualConsistency: 8.1 });
assert.equal(gates.status, 'PASS');
const legacyGate = evaluateVisualFormatGates({ profile: 'ANIMATED_MICRO_STORY', narrativeCoverage: coverage.map((item) => ({ ...item, classification: 'ABSTRACT' })), actionDensity: .12, presentationLike: legacyPresentation, competitive: { ...competitive, result: 'BELOW_REFERENCE' }, hook: 5, visualRelevance: 4, visualConsistency: 5, legacyExample: true });
assert.equal(legacyGate.status, 'FAIL'); assert.equal(legacyGate.blocking, true);
const winner = recommendWinningFormat([
  { format: 'ANIMATED_MICRO_STORY', score: { total: 8.1 }, competitive, viewer: { score: 80 }, gates } ,
  { format: 'CHARACTER_STORY', score: { total: 8.8 }, competitive, viewer: { score: 92 }, gates },
].map((item) => ({ ...item, score: item.score, viewer: { ...item.viewer, decision: 'KEEP_WATCHING' }, gates: item.gates })));
assert.equal(winner.format, 'CHARACTER_STORY');
console.log('visual format pivot tests: PASS');
