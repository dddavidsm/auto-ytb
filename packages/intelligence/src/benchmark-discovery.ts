import { normalizeBenchmarkVideo, SEED_BENCHMARK_CHANNELS, type BenchmarkChannel, type BenchmarkReport, type BenchmarkRequest, type BenchmarkVideo } from '@auto-ytb/core';
import type { YouTubeClient } from '@auto-ytb/youtube';

export type BenchmarkProvider = {
  readonly name: string;
  searchChannels(input: { query: string; regionCode?: string; relevanceLanguage?: string; limit?: number }): Promise<string[]>;
  getChannels(ids: string[]): Promise<Array<{ id: string; handle?: string; name: string; description?: string; createdAt?: string; subscribers: number | null; totalViews: number; totalVideos: number }>>;
  getRecentVideos(channelId: string, limit: number): Promise<Array<{ id: string; title: string; description?: string; publishDate: string; durationSeconds: number; views: number; likes: number | null; comments: number | null; thumbnailUrl?: string }>>;
};

export class YouTubeBenchmarkProvider implements BenchmarkProvider {
  readonly name = 'youtube-data-api';
  constructor(private readonly client: YouTubeClient) {}

  async searchChannels(input: { query: string; regionCode?: string; relevanceLanguage?: string; limit?: number }): Promise<string[]> {
    return this.client.searchChannels(input);
  }

  async getChannels(ids: string[]) {
    const channels = await this.client.getChannels(ids);
    return channels.map((channel) => ({ id: channel.id, handle: channel.handle, name: channel.title, description: channel.description, createdAt: channel.createdAt, subscribers: channel.subscriberCount, totalViews: channel.viewCount, totalVideos: channel.videoCount }));
  }

  async getRecentVideos(channelId: string, limit: number) {
    const videos = await this.client.getRecentUploads(channelId, limit);
    return videos.map((video) => ({ id: video.id, title: video.title, description: video.description, publishDate: video.publishedAt, durationSeconds: parseDuration(video.duration), views: video.viewCount, likes: video.likeCount, comments: video.commentCount, thumbnailUrl: video.thumbnailUrl }));
  }
}

export function parseDuration(value: string): number {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/i.exec(value);
  if (!match) return 0;
  return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
}

export async function discoverBenchmark(input: { request: BenchmarkRequest; provider: BenchmarkProvider; seeds?: string[]; includeSeedChannels?: boolean; maxChannels?: number; uploadsPerChannel?: number; now?: Date }): Promise<BenchmarkReport> {
  const request = { ...input.request, language: input.request.language ?? 'en' };
  const queries = [...new Set([request.niche, request.subniche, ...(input.seeds ?? [])].filter(Boolean) as string[])].slice(0, 20);
  const discovered = new Set<string>();
  for (const query of queries) for (const channelId of await input.provider.searchChannels({ query, regionCode: request.country, relevanceLanguage: request.language, limit: 10 })) discovered.add(channelId);
  const seedNames = input.includeSeedChannels === false ? [] : [...SEED_BENCHMARK_CHANNELS];
  for (const seed of seedNames) for (const channelId of await input.provider.searchChannels({ query: seed.handle, regionCode: request.country, relevanceLanguage: request.language, limit: 2 })) discovered.add(channelId);
  const ids = [...discovered].slice(0, Math.max(5, Math.min(input.maxChannels ?? 24, 50)));
  const channelRows = await input.provider.getChannels(ids);
  const now = input.now ?? new Date();
  const channels: BenchmarkChannel[] = [];
  const videos: BenchmarkVideo[] = [];
  for (const row of channelRows) {
    const rawVideos = await input.provider.getRecentVideos(row.id, Math.max(10, Math.min(input.uploadsPerChannel ?? 30, 50)));
    const normalized = rawVideos.map((video) => normalizeBenchmarkVideo({ ...video, channelId: row.id, channelSubscribers: row.subscribers, comparable: rawVideos.map((peer) => ({ ...peer, channelSubscribers: row.subscribers })), now }));
    const recent = normalized.filter((video) => video.ageHours <= 24 * 30);
    channels.push({ id: row.id, handle: row.handle, name: row.name, description: row.description, createdAt: row.createdAt, subscribers: row.subscribers, totalViews: row.totalViews, totalVideos: row.totalVideos, recentUploadFrequencyPerWeek: normalized.length ? normalized.length / Math.max(1, Math.max(...normalized.map((video) => video.ageHours)) / 24 / 7) : 0, estimatedViewsPerMonth: recent.reduce((sum, video) => sum + video.views, 0), language: request.language, country: request.country, niche: request.niche, recentMomentum: recent.length ? recent.reduce((sum, video) => sum + Math.min(100, video.likelyOutlier.velocityMultiple * 20), 0) / recent.length : 0, source: 'youtube-data-api', observedAt: now.toISOString() });
    videos.push(...normalized);
  }
  return { request: request as Required<Pick<BenchmarkRequest, 'niche' | 'language'>> & BenchmarkRequest, channels, videos, evidence: [{ source: input.provider.name, observedAt: now.toISOString(), note: 'Public metadata and statistics retrieved through the provider abstraction.' }], limitations: ['Public competitor analytics do not include private CTR, retention or revenue.', 'Thumbnail vision analysis and transcripts are unavailable unless a permitted provider is configured.'], generatedAt: now.toISOString() };
}

export function fixtureBenchmarkProvider(input: { channels: BenchmarkChannel[]; videos: Record<string, BenchmarkVideo[]> }): BenchmarkProvider {
  return { name: 'fixture', async searchChannels() { return input.channels.map((channel) => channel.id); }, async getChannels(ids) { return input.channels.filter((channel) => ids.includes(channel.id)).map((channel) => ({ id: channel.id, handle: channel.handle, name: channel.name, description: channel.description, createdAt: channel.createdAt, subscribers: channel.subscribers, totalViews: channel.totalViews, totalVideos: channel.totalVideos })); }, async getRecentVideos(channelId) { return (input.videos[channelId] ?? []).map((video) => ({ id: video.id, title: video.title, description: video.description, publishDate: video.publishDate, durationSeconds: video.durationSeconds, views: video.views, likes: video.likes, comments: video.comments, thumbnailUrl: video.thumbnailUrl })); } };
}
