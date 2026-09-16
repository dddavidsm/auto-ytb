import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve('.');
const out = resolve(root, '.data', 'sourced-proof-v2');
const packageReport = JSON.parse(await readFile(resolve(out, 'production-package.json'), 'utf8'));
const manifest = JSON.parse(await readFile(resolve(out, 'v2', 'manifest.json'), 'utf8'));
const rights = packageReport.rightsLedger;
const writes = {
  'research-pack.json': packageReport.research,
  'reference-comparison-report.json': packageReport.referenceComparison,
  'media-availability-report.json': packageReport.mediaAvailability,
  'rights-ledger.json': rights,
  'script.json': packageReport.script,
  'video-blueprint.json': packageReport.blueprint,
  'media-resource-pack.json': packageReport.mediaResourcePack,
  'visual-coverage-report.json': packageReport.v2.qc.visualCoverage,
  'master-timeline.json': { schema: 'MASTER_TIMELINE_V1', projectId: manifest.projectId, durationSec: manifest.script.targetDurationSec, editable: true, scenes: manifest.scenes, voice: manifest.voice, music: manifest.music },
  'edit-patches.json': manifest.repairHistory,
  'production-quote.json': { format: 'SOURCED_NARRATIVE', targetDurationSec: 180, qualityMode: 'MAX_QUALITY', expectedCostUsd: null, knownNewPaidCostUsd: 0, voice: 'Gemini TTS', mediaStrategy: 'rights-resolved local exact segments', note: 'Gemini API billing is not exposed by the provider response.' },
};
await mkdir(out, { recursive: true });
await Promise.all(Object.entries(writes).map(([name, value]) => writeFile(resolve(out, name), `${JSON.stringify(value, null, 2)}\n`)));
console.log(JSON.stringify({ written: Object.keys(writes), out }, null, 2));
