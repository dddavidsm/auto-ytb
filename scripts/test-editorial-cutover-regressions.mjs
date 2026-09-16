import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const runtime = await readFile(new URL('./run-autonomous-studio.mjs', import.meta.url), 'utf8');
const alignment = await readFile(new URL('../packages/runtime-node/gemini-word-alignment.mjs', import.meta.url), 'utf8');

assert.doesNotMatch(runtime, /segment\.id\.startsWith\(/, 'final footage cannot be selected by segment-id prefix');
assert.doesNotMatch(runtime, /segments\[index\s*%\s*segments\.length\]/, 'final footage cannot fall back to round-robin assignment');
assert.doesNotMatch(runtime, /sine=frequency=/, 'procedural sine music cannot enter production code');
assert.doesNotMatch(runtime, /hookStrength:\s*78|viewerPromiseClarity:\s*78|storyProgression:\s*72|thumbnailStrength:\s*76/, 'greenlight cannot contain fixed creative scores');
assert.match(runtime, /buildNarrationUnits\(/, 'narration units must be derived from real word timestamps');
assert.match(runtime, /matchSemanticFootage\(/, 'semantic matcher must drive final selection');
assert.match(runtime, /segmentMediaRange\(/, 'final assets must use semantically refined usable timecodes');
assert.match(runtime, /temporalAnalysis: 'gemini-frame-sequence-with-source-timestamps'/, 'segment understanding must retain temporal provenance');
assert.match(runtime, /inspectEditorialVideo\(/, 'final render must receive temporal editorial inspection');
assert.match(runtime, /EDITORIAL_INSPECTION_FAILED/, 'failed temporal inspection cannot be reported as a pass');
assert.match(runtime, /detectDefaultMotionEffects\(/, 'fake-motion preflight must be derived from the manifest');
assert.match(runtime, /music: null/, 'FOOTAGE_PRO must not silently synthesize a fake music bed');
assert.doesNotMatch(alignment, /confidence:1/, 'provider alignment cannot manufacture confidence=1');

console.log('✓ editorial cutover regression guards pass');
