import { readFile } from 'node:fs/promises';
import { profileCompetitor, rankCompetitors } from '@auto-ytb/core';
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

const allSeeds = JSON.parse(await readFile(`${process.cwd()}/config/niche-seeds.json`, 'utf8')) as Record<string, string[]>;
const seeds = allSeeds[niche];
if (!seeds?.length) {
  console.error(`Unknown niche: ${niche}`);
  process.exit(1);
}

const maxQueries = Math.max(1, Math.min(Number(arg('maxQueries') ?? 8), 20));
const maxChannels = Math.max(5, Math.min(Number(arg('maxChannels') ?? 20), 50));
const days = Math.max(7, Math.min(Number(arg('days') ?? 120), 365));
const client = new YouTubeClient(apiKey);
const publishedAfter = new Date(Date.now() - days * 86_400_000);

const aggregate = new Map<string, { title: string; hits: number; queries: Set<string> }>();
for (const query of seeds.slice(0, maxQueries)) {
  const videos = await client.searchVideos({
    query,
    regionCode: process.env.YOUTUBE_REGION ?? 'US',
    relevanceLanguage: process.env.YOUTUBE_RELEVANCE_LANGUAGE ?? 'en',
    publishedAfter,
    maxResults: 25,
    order: 'viewCount',
  });
  for (const video of videos) {
    const current = aggregate.get(video.channelId) ?? { title: video.channelTitle, hits: 0, queries: new Set<string>() };
    current.hits += 1;
    current.queries.add(query);
    aggregate.set(video.channelId, current);
  }
}

const discovered = [...aggregate.entries()]
  .sort((a, b) => b[1].queries.size - a[1].queries.size || b[1].hits - a[1].hits)
  .slice(0, maxChannels);
const channelDetails = await client.getChannels(discovered.map(([channelId]) => channelId));
const detailById = new Map(channelDetails.map((channel) => [channel.id, channel]));

const candidates = [];
for (const [channelId, discovery] of discovered) {
  const details = detailById.get(channelId);
  if (!details) continue;
  const uploads = await client.getRecentUploads(channelId, 30);
  const profile = profileCompetitor(
    channelId,
    uploads.map((video) => ({ id: video.id, title: video.title, views: video.viewCount, publishedAt: new Date(video.publishedAt) })),
  );
  candidates.push({
    ...profile,
    channelTitle: details.title,
    subscriberCount: details.subscriberCount,
    queryHits: discovery.hits,
    uniqueQueryHits: discovery.queries.size,
  });
}

const ranked = rankCompetitors(candidates);
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
