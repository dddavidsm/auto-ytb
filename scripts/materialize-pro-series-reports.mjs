import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const reportPath = process.argv[2];
if (!reportPath) throw new Error('Usage: node scripts/materialize-pro-series-reports.mjs <report.json>');

const report = JSON.parse(await readFile(reportPath, 'utf8'));
const reportsDir = dirname(reportPath);
const writeJson = async (name, value) => {
  const target = join(reportsDir, name);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return target;
};

const outputs = [];
outputs.push(await writeJson('market-report.json', report.marketReport ?? {}));
outputs.push(await writeJson('concepts.json', {
  concepts: report.concepts ?? [],
  recommendation: report.recommendedConcept ?? report.recommendation ?? null,
}));
outputs.push(await writeJson('tool-bakeoff.json', {
  hardware: report.hardware ?? null,
  productionStack: report.productionStack ?? null,
  sources: report.marketReport?.sources ?? [],
}));
outputs.push(await writeJson('quality-summary.json', {
  status: report.status,
  recommendation: report.recommendedConcept ?? report.recommendation ?? null,
  proofs: report.proofs,
  nextGate: report.nextGate,
}));
outputs.push(await writeJson('manifest.json', {
  runId: report.runId,
  generatedAt: report.generatedAt,
  status: report.status,
  files: report.artifacts ?? [],
  reports: outputs.map((path) => path.split('\\').pop()),
}));

console.log(JSON.stringify({ reportsDir, outputs }, null, 2));
