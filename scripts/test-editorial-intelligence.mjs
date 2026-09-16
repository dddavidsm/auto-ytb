import assert from 'node:assert/strict';
import { activeKaraokeWord, buildKaraokeChunks, buildNarrationUnits, coverageFromTimeline, evaluateCreativeGreenlightEvidence, matchSemanticFootage, normalizeVisualIntent, parseShotBoundaries, segmentMediaRange, timelineMediaRatios, validateWordAlignment } from '../packages/production/dist/index.js';

const words = 'The truck feeds hot mix forward, the paver spreads it, and rollers compress it immediately.'.split(/\s+/).map((word, index) => ({ word: word.replace(/[,.]/g, ''), startTime: index * 0.4, endTime: index * 0.4 + 0.35, confidence: 0.92 }));
const beats = [{ id: 'beat-1', narration: 'The truck feeds hot mix forward, the paver spreads it, and rollers compress it immediately.', entities: ['asphalt paver'], importance: 'HIGH', visualIntent: { requiredEntities: ['asphalt paver'], requiredActions: ['paving', 'compacting'], semanticGoal: 'show the continuous paving sequence' } }];
const units = buildNarrationUnits(beats, words);
assert.equal(units.length, 3);
assert.equal(units[0].startTime, 0);
assert.ok(units[1].startTime > units[0].startTime);
assert.equal(normalizeVisualIntent({ requiredActions: ['paving'] }).requiredActions[0], 'paving');
const numericUnits = buildNarrationUnits([{ id: 'numeric', narration: 'A twenty-seven meter cliff.' }], [{ word: 'A', startTime: 0, endTime: 0.1, confidence: null }, { word: '27', startTime: 0.1, endTime: 0.25, confidence: null }, { word: 'meter', startTime: 0.25, endTime: 0.4, confidence: null }, { word: 'cliff', startTime: 0.4, endTime: 0.55, confidence: null }]);
assert.equal(numericUnits[0].endTime, 0.55);
const omittedFunctionWord = buildNarrationUnits([{ id: 'omitted', narration: 'Once the diver breaks through, the air shuts off.' }], [{ word: 'Once', startTime: 0, endTime: 0.1, confidence: null }, { word: 'diver', startTime: 0.1, endTime: 0.25, confidence: null }, { word: 'breaks', startTime: 0.25, endTime: 0.4, confidence: null }, { word: 'through', startTime: 0.4, endTime: 0.55, confidence: null }, { word: 'the', startTime: 0.55, endTime: 0.65, confidence: null }, { word: 'air', startTime: 0.65, endTime: 0.8, confidence: null }, { word: 'shuts', startTime: 0.8, endTime: 0.95, confidence: null }, { word: 'off', startTime: 0.95, endTime: 1.1, confidence: null }]);
assert.equal(omittedFunctionWord.length, 2);
assert.equal(omittedFunctionWord[1].endTime, 1.1);

const segments = [
  { segmentId: 'exact', assetId: 'asset-a', startTime: 2, endTime: 5, duration: 3, representativeFrames: [], entities: ['asphalt paver'], people: [], objects: ['dump truck'], actions: ['paving', 'material transfer'], environment: ['highway construction'], location: ['highway'], visibleText: [], cameraDistance: 'wide', cameraMovement: 'tracking', motionLevel: 'HIGH', visualQuality: 'EXCELLENT', sourceAudioUseful: 'MECHANICAL', semanticDescription: 'asphalt paver advances while dump truck feeds hot mix into the hopper', confidence: 0.9, provenance: { method: 'test', sampledFrames: 3, analyzedAt: new Date().toISOString() }, rightsTier: 'PUBLISHABLE_WITH_ATTRIBUTION', sourceKey: 'source-a' },
  { segmentId: 'wrong', assetId: 'asset-b', startTime: 0, endTime: 4, duration: 4, representativeFrames: [], entities: ['office worker'], people: ['person'], objects: ['desk'], actions: ['typing'], environment: ['office'], location: ['office'], visibleText: [], cameraDistance: 'medium', cameraMovement: 'static', motionLevel: 'LOW', visualQuality: 'GOOD', sourceAudioUseful: 'NONE', semanticDescription: 'person typing at a desk in an office', confidence: 0.9, provenance: { method: 'test', sampledFrames: 3, analyzedAt: new Date().toISOString() }, rightsTier: 'PUBLISHABLE_WITH_ATTRIBUTION', sourceKey: 'source-b' },
];
const ranked = matchSemanticFootage(units[0], segments);
assert.equal(ranked[0].segment.segmentId, 'exact');
assert.equal(ranked.at(-1).classification, 'WRONG');
const avoidRanked = matchSemanticFootage({ ...units[0], visualIntent: { ...units[0].visualIntent, avoid: ['dump truck'] } }, segments);
assert.equal(avoidRanked.find((candidate) => candidate.segment.segmentId === 'exact').classification, 'WRONG');
const refinedRange = segmentMediaRange({ ...segments[0], usableStartTime: 2.4, usableEndTime: 4.2 });
assert.equal(refinedRange.startTime, 2.4);
assert.equal(refinedRange.endTime, 4.2);
assert.ok(Math.abs(refinedRange.duration - 1.8) < 1e-9);
const coverage = coverageFromTimeline(units, units.map((unit) => ({ unitId: unit.id, match: matchSemanticFootage(unit, segments)[0] })));
assert.equal(coverage.ratios.wrong, 0);
const ratios = timelineMediaRatios([{ startTime: 0, endTime: 2, visualType: 'REAL_VIDEO' }, { startTime: 2, endTime: 3, visualType: 'GRAPHIC' }]);
assert.equal(ratios.seconds.REAL_VIDEO, 2);
assert.equal(ratios.ratios.GRAPHIC, 1 / 3);
const shots = parseShotBoundaries('showinfo pts_time:4.20\nshowinfo pts_time:9.50\n', 12);
assert.deepEqual(shots.map((shot) => [shot.startTime, shot.endTime]), [[0, 4.2], [4.2, 9.5], [9.5, 12]]);
const karaokeWords = [{ word: 'This', startTime: 0, endTime: 0.2, confidence: null }, { word: 'is', startTime: 0.2, endTime: 0.4, confidence: null }, { word: 'exact.', startTime: 0.4, endTime: 0.7, confidence: null }];
assert.equal(validateWordAlignment(karaokeWords), true);
const karaokeChunks = buildKaraokeChunks(karaokeWords, 5);
assert.equal(karaokeChunks.length, 1);
assert.equal(activeKaraokeWord(karaokeChunks[0], 0.25), 1);
const greenlight = evaluateCreativeGreenlightEvidence({ promise: 'See the paving train work continuously', hook: { match: ranked[0], firstFrameEvidence: 'exact moving action' }, units, coverage, semanticSegments: segments, noveltySimilarity: 0.1, thumbnailEvidence: 'selected action frame with readable promise' });
assert.equal(greenlight.status, 'PASS');
console.log('✓ editorial intelligence alignment, semantic matching, final coverage, ratios, and evidence greenlight pass');
