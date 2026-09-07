import { readFile } from 'node:fs/promises';
import { calculateNicheScore, type NicheRisks, type NicheSignals } from '@auto-ytb/core';

declare const process: { cwd(): string };

const path = `${process.cwd()}/config/niche-priors.json`;
const candidates = JSON.parse(await readFile(path, 'utf8')) as Array<{
  id: string;
  label: string;
  signals: NicheSignals;
  risks: NicheRisks;
}>;

const ranked = candidates
  .map((candidate) => ({ ...candidate, score: calculateNicheScore(candidate.signals, candidate.risks) }))
  .sort((a, b) => b.score.finalScore - a.score.finalScore);

console.table(ranked.map((item, index) => ({
  rank: index + 1,
  niche: item.label,
  score: item.score.finalScore,
  recommendation: item.score.recommendation,
  confidence: item.signals.evidenceConfidence,
})));
