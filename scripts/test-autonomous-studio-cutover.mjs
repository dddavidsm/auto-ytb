import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const legacyTerms = JSON.parse(readFileSync(resolve(root, 'scripts/fixtures/legacy-topic-terms.json'), 'utf8'));
const genericFiles = [
  'scripts/run-autonomous-studio.mjs',
  'apps/web/app/api/production/brief/route.ts',
  'apps/web/app/create/page.tsx',
];
for (const file of genericFiles) {
  const source = readFileSync(resolve(root, file), 'utf8').toLowerCase();
  for (const term of legacyTerms) assert.equal(source.includes(term.toLowerCase()), false, `${file} contains quarantined topic term: ${term}`);
}
const requiredRuntimeSignals = ['MEDIA_RECONNAISSANCE', 'RENDER', 'CRITIC', 'REPAIR', 'PACKAGING'];
const runtime = readFileSync(resolve(root, 'scripts/run-autonomous-studio.mjs'), 'utf8');
for (const signal of requiredRuntimeSignals) assert.match(runtime, new RegExp(signal), `canonical runtime missing ${signal}`);

const runs = ['gauntlet-a4', 'gauntlet-b3', 'gauntlet-c'].map((runId) => JSON.parse(readFileSync(resolve(root, `.data/autonomous-production/${runId}/reports/production-run.json`), 'utf8')));
for (const run of runs) {
  assert.ok(existsSync(run.output.video), `${run.runId}: final video is missing`);
  assert.ok(existsSync(run.output.thumbnail), `${run.runId}: thumbnail artifact is missing`);
  assert.ok(existsSync(resolve(root, `.data/autonomous-production/${run.runId}/reports/media-search-receipts.json`)), `${run.runId}: discovery receipts are missing`);
  assert.ok(run.qc?.final?.critic?.inspectedRenderedArtifact, `${run.runId}: critic did not inspect rendered output`);
}
const repaired = runs.find((run) => run.runId === 'gauntlet-a4').qc.repair;
assert.equal(repaired.applied, true, 'A must contain a real targeted repair');
assert.equal(repaired.pixelsChanged, true, 'A repair must change rendered pixels');
assert.notEqual(repaired.beforeHash, repaired.afterHash, 'A repair must change the final artifact hash');
console.log(`autonomous cutover checks passed: ${runs.length} real runs, one verified pixel-changing repair`);
