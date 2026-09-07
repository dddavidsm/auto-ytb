import { profileCompetitor, rankCompetitors, type RankedCompetitor } from '@auto-ytb/core';
import type { YouTubeClient } from '@auto-ytb/youtube';

export async function discoverCompetitors(input: {
  client: YouTubeClient;
  seeds: string[];
  regionCode?: string;
  relevanceLanguage?: string;
  maxQueries?: number;
  maxChannels?: number;
  recentDays?: number;
  uploadsPerChannel?: number;
}): Promise<RankedCompetitor[]> {
  const maxQueries = Math.max(1, Math.min(input.maxQueries ?? 6, 20));
  const maxChannels = Math.max(5, Math.min(input.maxChannels ?? 16, 50));
  const recentDays = Math.max(7, Math.min(input.recentDays ?? 120, 365));
  const uploadsPerChannel = Math.max(10, Math.min(input.uploadsPerChannel ?? 30, 50));
  const publishedAfter = new Date(Date.now() - recentDays * 86_400_000);
  const aggregate = new Map<string, { title: string; hits: number; queries: Set<string> }>();

  for (const query of input.seeds.slice(0, maxQueries)) {
    const videos = await input.client.searchVideos({
      query,
      regionCode: input.regionCode,
      relevanceLanguage: input.relevanceLanguage,
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
  const channelDetails = await input.client.getChannels(discovered.map(([channelId]) => channelId));
  const details = new Map(channelDetails.map((channel) => [channel.id, channel]));
  const candidates = [];

  for (const [channelId, discovery] of discovered) {
    const channel = details.get(channelId);
    if (!channel) continue;
    const uploads = await input.client.getRecentUploads(channelId, uploadsPerChannel);
    const profile = profileCompetitor(channelId, uploads.map((video) => ({
      id: video.id,
      title: video.title,
      views: video.viewCount,
      publishedAt: new Date(video.publishedAt),
    })));
    candidates.push({
      ...profile,
      channelTitle: channel.title,
      subscriberCount: channel.subscriberCount,
      queryHits: discovery.hits,
      uniqueQueryHits: discovery.queries.size,
    });
  }
  return rankCompetitors(candidates);
}
