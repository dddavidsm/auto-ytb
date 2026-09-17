import { readFile } from 'node:fs/promises';
import {
  SyntheticBrollEngine,
  buildVisualContinuityProfile,
  buildVisualGapReport,
  compileSyntheticShotPrompt,
  evaluateModeContract,
  evaluateVisualRealityContinuity,
} from '../packages/production/dist/index.js';

const assert = (condition, message) => {
  if (!condition) throw new Error(`ASSERTION_FAILED: ${message}`);
};

const continuity = buildVisualContinuityProfile({
  previous: [{ segmentId: 'real-a', cameraMovement: 'gentle handheld', cameraDistance: 'medium', motionLevel: 'HIGH', environment: ['industrial floor'], semanticDescription: 'documentary camera follows a metal part moving left to right' }],
  next: [{ segmentId: 'real-b', cameraMovement: 'locked', cameraDistance: 'close', motionLevel: 'MEDIUM', environment: ['industrial floor'], semanticDescription: 'close detail of the same machine in natural available light' }],
});
assert(continuity.sourceShotIds.length === 2, 'continuity profile must use adjacent shots');
assert(continuity.palette === 'NATURAL_NEUTRAL', 'continuity profile must not invent a cinematic grade');

const contract = SyntheticBrollEngine.buildContract({ subject: 'a metal component entering the same industrial machine', action: 'the component advances through the mechanism with believable contact and momentum', shotPurpose: 'bridge a missing detail between two real documentary shots', shotDurationSeconds: 2.4 });
const prompt = compileSyntheticShotPrompt(contract, continuity);
assert(/photorealistic documentary footage/i.test(prompt), 'synthetic prompt must request footage, not illustration');
assert(/no flat diagram|no infographic|no readable generated text/i.test(prompt), 'synthetic prompt must prohibit graphic fallback');
const justified = SyntheticBrollEngine.justify({ unitId: 'unit-1', visualGap: 'missing internal detail', whyRealFootageInsufficient: 'the real source only shows the exterior', whyScriptShouldRemain: 'the mechanism is central and supported by research', whySyntheticIsAppropriate: 'a generic physical reconstruction can illustrate the process without claiming documentary evidence', providerChoice: 'test-provider', expectedQuality: 'HIGH', estimatedCost: { value: 0, currency: 'USD', source: 'fixture' }, alternativesConsidered: ['deeper real search', 'script rewrite'] });
assert(justified.evidenceRole === 'SYNTHETIC_ILLUSTRATION', 'synthetic evidence role must never be direct evidence');

const gap = buildVisualGapReport([{ unitId: 'unit-1', startTime: 0, endTime: 3, narration: 'The mechanism works inside the housing.', requiredMechanism: ['internal mechanism'], syntheticCandidateNeeded: true }]);
assert(gap.rows[0].severity === 'HIGH' && gap.rows[0].selectedStrategy === 'SYNTHETIC_PHOTOREAL', 'uncovered gap must become a justified synthetic candidate, not a graphic');

const badMode = evaluateModeContract({ mode: 'FOOTAGE_PRO', durationSeconds: 60, realVideoSeconds: 30, syntheticVideoSeconds: 10, graphicSeconds: 20, imageSeconds: 0, criticalVisualsCovered: true, syntheticShots: [] });
assert(badMode.status === 'FAIL' && badMode.failures.includes('GRAPHIC_RATIO_ABOVE_MODE_CAP'), 'FOOTAGE_PRO must reject graphic-dominant timelines');
const goodMode = evaluateModeContract({ mode: 'HYBRID_EDITORIAL', durationSeconds: 60, realVideoSeconds: 48, syntheticVideoSeconds: 8, graphicSeconds: 4, imageSeconds: 0, criticalVisualsCovered: true, syntheticShots: [{ photorealism: 'STRONG', temporalRealism: 'STRONG', styleMatch: 'STRONG', physics: 'STRONG', score: 100, evidence: ['fixture frames reviewed'], method: 'fixture' }] });
assert(goodMode.status === 'PASS', 'coherent real plus synthetic footage should pass the hybrid contract');
const continuityFail = evaluateVisualRealityContinuity({ mode: 'FOOTAGE_PRO', transitions: [{ from: 'REAL_VIDEO', to: 'GRAPHIC', hasEditorialReason: false }] });
assert(continuityFail.status === 'FAIL' && continuityFail.failures.includes('REAL_TO_GRAPHIC_BREAK'), 'unmotivated real-to-graphic transition must fail');
const continuityPass = evaluateVisualRealityContinuity({ mode: 'HYBRID_EDITORIAL', transitions: [{ from: 'REAL_VIDEO', to: 'SYNTHETIC_VIDEO', styleMatch: 'STRONG', hasEditorialReason: true }] });
assert(continuityPass.status === 'PASS', 'strongly matched synthetic bridge must pass');

const renderer = await readFile(new URL('../packages/runtime-node/index.mjs', import.meta.url), 'utf8');
assert(!renderer.includes('motionBridge'), 'renderer must not contain the old visual motion bridge');
assert(renderer.includes('RENDER_PLAN_INVALID: scene'), 'renderer must fail when a visual source is too short');
assert(renderer.includes('await this.probeDuration(source)'), 'renderer must inspect source duration before cutting');
assert(!renderer.includes("'-stream_loop','-1','-i',source"), 'renderer must not loop visual sources');

console.log('visual continuity cutover tests: PASS');
