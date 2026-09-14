import assert from 'node:assert/strict';
import { assessCrossShotContinuity, assessMossPhase2Readiness, assessTemporalContinuity, mossMasterDesign, seriesEconomics, validateCharacterMaster } from '../packages/production/dist/index.js';
import { BlenderProvider } from '../packages/providers/dist/index.js';

const missing = validateCharacterMaster(mossMasterDesign);
assert.equal(missing.passed, false);
assert.ok(missing.issues.includes('missing canonical model identity'));
assert.ok(missing.issues.some((issue) => issue.includes('missing viseme')));

const temporal = assessTemporalContinuity([{ shotId: 'shot-01', samples: [
  { at: 'start', characterIdentity: 9, bodyMotion: 8, facialActing: 8, lipSync: 8, flicker: 0, issues: [] },
  { at: '50%', characterIdentity: 4, bodyMotion: 7, facialActing: 7, lipSync: 7, flicker: 5, issues: [] },
] }]);
assert.equal(temporal.passed, false);
assert.ok(temporal.issues.some((issue) => issue.includes('identity drift')));

const continuity = assessCrossShotContinuity([{ fromShot: 'shot-01', toShot: 'shot-02', character: 9, clothing: 9, prop: 8, location: 9, lighting: 8 }]);
assert.equal(continuity.passed, true);

const economics = seriesEconomics({ oneTime: [{ name: 'Moss master', costUsd: 2 }], perEpisode: [{ name: 'voice', costUsd: 0.4 }, { name: 'hero motion', costUsd: 1.1 }] });
assert.equal(economics.oneTimeCostUsd, 2);
assert.equal(economics.season10CostUsd, 17);

const blockedWithoutExport = assessMossPhase2Readiness({ referencePack: 'PASS', modelExportAvailable: false, modelQuality: 'NOT_EVALUATED', rig: 'NOT_STARTED', skinning: 'NOT_EVALUATED', facial: 'NOT_STARTED', motion: 'NOT_STARTED' });
assert.equal(blockedWithoutExport.state, 'BLOCKED');
assert.ok(blockedWithoutExport.blockers.includes('canonical 3D export is unavailable'));

const ready = assessMossPhase2Readiness({ referencePack: 'PASS', modelExportAvailable: true, modelQuality: 'PASS', rig: 'PASS', skinning: 'PASS', facial: 'READY', motion: 'PASS' });
assert.equal(ready.state, 'READY_FOR_HERO');

const blender = new BlenderProvider('__missing_blender_for_test__');
const probe = await blender.probe();
assert.equal(probe.available, false);

console.log('✓ CharacterMaster validation fails closed until a canonical 3D model, rig and face exist');
console.log('✓ temporal and cross-shot continuity reports detect drift and pass stable transitions');
console.log('✓ series economics separates one-time asset costs from marginal episode costs');
console.log('✓ Moss Phase 2 readiness blocks honestly until export, rig, skinning, face and motion pass');
console.log('✓ BlenderProvider probes safely without requiring installed Blender');
