import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { evaluateNiches, selectNicheWinner, summarizeNicheObservation, type NichePrior } from '@auto-ytb/core';
import { discoverCompetitors } from '@auto-ytb/intelligence';
import { YouTubeClient } from '@auto-ytb/youtube';

const apiKey = process.env.YOUTUBE_API_KEY;
if (!apiKey) {
  console.error('YOUTUBE_API_KEY is required');
  process.exit(1);
}

const priors = JSON.parse(await readFile(`${process.cwd()}/config/niche-priors.json`, 'utf8')) as NichePrior[];
const seeds = JSON.parse(await readFile(`${process.cwd()}/config/niche-seeds.json`, 'utf8')) as Record<string, string[]>;
const client = new YouTubeClient(apiKey);
const observations = [];

for (const prior of priors) {
  const nicheSeeds = seeds[prior.id] ?? [];
  if (!nicheSeeds.length) continue;
  const competitors = await discoverCompetitors({
    client,
    seeds: nicheSeeds,
    regionCode: process.env.YOUTUBE_REGION ?? 'US',
    relevanceLanguage: process.env.YOUTUBE_RELEVANCE_LANGUAGE ?? 'en',
    maxQueries: 6,
    maxChannels: 12,
    recentDays: 120,
    uploadsPerChannel: 25,
  });
  observations.push(summarizeNicheObservation({ nicheId: prior.id, competitors }));
}

const evaluated = evaluateNiches(priors, observations);
const decision = selectNicheWinner(evaluated);
const report = {
  generatedAt: new Date().toISOString(),
  searchBudget: client.searchBudget.snapshot(),
  decision: {
    status: decision.decision,
    winner: decision.winner?.id ?? null,
    label: decision.winner?.label ?? null,
    margin: decision.margin,
    reason: decision.reason,
  },
  niches: evaluated.map((niche, index) => ({
    rank: index + 1,
    id: niche.id,
    label: niche.label,
    finalScore: niche.finalScore,
    recommendation: niche.recommendation,
    evidenceConfidence: niche.evidence.evidenceConfidence,
    observedOpportunity: niche.evidence.observedOpportunity,
    competitors: niche.evidence.competitorCount,
    breakouts: niche.evidence.totalBreakouts,
    medianViewsPerDay: niche.evidence.medianViewsPerDay,
  })),
};

await mkdir(`${process.cwd()}/.data`, { recursive: true });
await writeFile(`${process.cwd()}/.data/niche-live-latest.json`, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.table(report.niches);
console.log(JSON.stringify(report.decision, null, 2));
console.log('Saved .data/niche-live-latest.json');
