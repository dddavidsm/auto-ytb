import assert from 'node:assert/strict';
import { buildShotContracts, evaluateShotCoverage } from '../packages/production/dist/index.js';

const script = { title: 'Test', language: 'en', targetDurationSec: 12, thesis: 'A process', outro: '', beats: [
  { id: 'b1', startSec: 0, targetDurationSec: 6, purpose: 'hook', narration: 'Watch the server room cool the machines', visualIntent: 'server room cooling equipment', sourceIds: [] },
  { id: 'b2', startSec: 6, targetDurationSec: 6, purpose: 'payoff', narration: 'The grid connects the facility', visualIntent: 'power grid connection', sourceIds: [] },
] };
const contracts = buildShotContracts(script);
assert.equal(contracts.length, 2);
assert.ok(contracts[0].requiredContext.includes('room'));
const footage = [
  { id: 's1', uri: 'file:///server.mp4', title: 'Server room cooling equipment', sourceId: 'server', startSec: 0, endSec: 8, license: 'Pexels', rightsStatus: 'CLEARED' },
  { id: 's2', uri: 'file:///grid.mp4', title: 'Power grid facility connection', sourceId: 'grid', startSec: 0, endSec: 8, license: 'Pexels', rightsStatus: 'CLEARED' },
];
const scenes = [
  { id: 'b1-s1', startSec: 0, durationSec: 6, kind: 'broll', instruction: '', sourceIds: [], generated: false, sourceFootageId: 's1' },
  { id: 'b2-s1', startSec: 6, durationSec: 6, kind: 'broll', instruction: '', sourceIds: [], generated: false, sourceFootageId: 's2' },
];
const report = evaluateShotCoverage({ script, scenes, sourceFootage: footage });
assert.equal(report.passed, true);
assert.equal(report.beatCoverageRatio, 1);
const blocked = evaluateShotCoverage({ script, scenes: [scenes[0]], sourceFootage: footage });
assert.equal(blocked.passed, false);
console.log('shot contracts: PASS');
