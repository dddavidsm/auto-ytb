import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.join(process.cwd(), '.data', 'pro-series-rnd');
const runs = (await readdir(root, { withFileTypes: true }).catch(() => [])).filter((entry) => entry.isDirectory() && entry.name.startsWith('moss-meshy6lite-rnd-')).map((entry) => entry.name).sort();
if (!runs.length) {
  console.log('✓ Meshy 6 Lite phase-2 fixture not present; schema test skipped');
  process.exit(0);
}

const reportPath = path.join(root, runs.at(-1), 'reports', 'moss-meshy6lite-phase2.json');
assert.ok(existsSync(reportPath), 'Meshy 6 Lite report must exist');
const report = JSON.parse(await readFile(reportPath, 'utf8'));
assert.equal(report.meshy.model, 'Meshy 6 Lite');
assert.equal(report.meshy.download.status, 'PASS');
assert.equal(report.meshy.license, 'CC BY 4.0');
assert.equal(report.license.status, 'RND_PROTOTYPE_ONLY');
assert.equal(report.blender.import, 'PASS');
assert.ok(report.blender.model.triangles > 0);
assert.equal(report.modelQuality.materialStatus, 'FAIL');
assert.equal(report.modelQuality.textureStatus, 'FAIL');
assert.equal(report.skinning.status, 'FAIL');
assert.equal(report.facial.status, 'NOT_READY');
assert.equal(report.noHeroScene, true);
assert.equal(report.readiness.state, 'BLOCKED');
console.log('✓ Meshy 6 Lite export, Blender validation, licensing, and readiness gates are correctly recorded');
