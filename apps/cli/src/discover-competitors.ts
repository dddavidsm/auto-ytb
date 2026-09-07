import { readFile } from 'node:fs/promises';
import { discoverCompetitors } from '@auto-ytb/intelligence';
import { YouTubeClient } from '@auto-ytb/youtube';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const niche = arg('niche') ?? 'future-tech-business';
const apiKey = process.env.YOUTUBE_API_KEY;
if (!apiKey) {
  console.error('YOUTUBE_API_KEY is required');
  process.exit(1);
}
const seedsByNiche = JSON.parse(await readFile(`${process.cwd()}/config/niche-seeds.json`, 'utf8')) as Record<string, string[]>;
const seeds = seedsByNiche[niche];
if (!seeds?.length) {
  console.error(`Unknown niche: ${niche}`);
  process.exit(1);
}
const client = new YouTubeClient(apiKey);
const ranked = await discoverCompetitors({
  client,
  seeds,
  regionCode: process.env.YOUTUBE_REGION ?? 'US',
  relevanceLanguage: process.env.YOUTUBE_RELEVANCE_LANGUAGE ?? 'en',
  maxQueries: Number(arg('maxQueries') ?? 8),
  maxChannels: Number(arg('maxChannels') ?? 20),
  recentDays: Number(arg('days') ?? 120),
  uploadsPerChannel: 30,
});
console.table(ranked.map((item, index) => ({
  rank: index + 1,
  channel: item.channelTitle.slice(0, 34),
  score: item.score,
  tier: item.tier,
  subs: item.subscriberCount ?? 'hidden',
  queries: item.uniqueQueryHits,
  outlier: item.strongestOutlier,
  breakouts: item.breakoutCount,
  medianViewsDay: item.medianViewsPerDay,
})));
console.log(JSON.stringify({ niche, searchBudget: client.searchBudget.snapshot(), channelsAnalyzed: ranked.length }, null, 2));
