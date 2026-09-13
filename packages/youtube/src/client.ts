import { DailyBudget } from '@auto-ytb/core';

const API = 'https://www.googleapis.com/youtube/v3';

export type SearchVideo = {
  id: string;
  title: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  description?: string;
  thumbnailUrl?: string;
};

export type ChannelDetails = {
  id: string;
  title: string;
  subscriberCount: number | null;
  viewCount: number;
  videoCount: number;
  uploadsPlaylistId: string;
  handle?: string;
  description?: string;
  createdAt?: string;
};

export type EnrichedVideo = SearchVideo & {
  viewCount: number;
  likeCount: number | null;
  commentCount: number | null;
  duration: string;
  description?: string;
  thumbnailUrl?: string;
};

export type YouTubeClientAuth = string | { apiKey?: string; accessToken?: string };

export class YouTubeClient {
  readonly searchBudget = new DailyBudget(100);
  private readonly apiKey?: string;
  private readonly accessToken?: string;

  constructor(auth: YouTubeClientAuth) {
    if (typeof auth === 'string') this.apiKey = auth.trim() || undefined;
    else {
      this.apiKey = auth.apiKey?.trim() || undefined;
      this.accessToken = auth.accessToken?.trim() || undefined;
    }
    if (!this.apiKey && !this.accessToken) throw new Error('YouTubeClient requires YOUTUBE_API_KEY or an OAuth access token');
  }

  private async get<T>(path: string, params: URLSearchParams): Promise<T> {
    if (this.apiKey) params.set('key', this.apiKey);
    const response = await fetch(`${API}/${path}?${params.toString()}`, {
      headers: this.accessToken ? { authorization: `Bearer ${this.accessToken}` } : undefined,
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`YouTube API ${response.status}: ${body.slice(0, 500)}`);
    }
    return (await response.json()) as T;
  }

  async searchVideos(input: {
    query: string;
    regionCode?: string;
    relevanceLanguage?: string;
    publishedAfter?: Date;
    maxResults?: number;
    order?: 'date' | 'relevance' | 'viewCount';
  }): Promise<SearchVideo[]> {
    this.searchBudget.consume(1);
    const params = new URLSearchParams({
      part: 'snippet',
      type: 'video',
      q: input.query,
      maxResults: String(Math.min(input.maxResults ?? 25, 50)),
      order: input.order ?? 'relevance',
      safeSearch: 'moderate',
    });
    if (input.regionCode) params.set('regionCode', input.regionCode);
    if (input.relevanceLanguage) params.set('relevanceLanguage', input.relevanceLanguage);
    if (input.publishedAfter) params.set('publishedAfter', input.publishedAfter.toISOString());

    const json = await this.get<{
      items: Array<{
        id: { videoId: string };
        snippet: { title: string; description?: string; channelId: string; channelTitle: string; publishedAt: string; thumbnails?: { high?: { url: string }; default?: { url: string } } };
      }>;
    }>('search', params);

    return json.items.map((item) => ({
      id: item.id.videoId,
      title: item.snippet.title,
      channelId: item.snippet.channelId,
      channelTitle: item.snippet.channelTitle,
      publishedAt: item.snippet.publishedAt,
      description: item.snippet.description,
      thumbnailUrl: item.snippet.thumbnails?.high?.url ?? item.snippet.thumbnails?.default?.url,
    }));
  }

  async searchChannels(input: { query: string; regionCode?: string; relevanceLanguage?: string; limit?: number }): Promise<string[]> {
    this.searchBudget.consume(1);
    const params = new URLSearchParams({ part: 'snippet', type: 'channel', q: input.query, maxResults: String(Math.min(input.limit ?? 10, 50)), safeSearch: 'moderate' });
    if (input.regionCode) params.set('regionCode', input.regionCode);
    if (input.relevanceLanguage) params.set('relevanceLanguage', input.relevanceLanguage);
    const json = await this.get<{ items: Array<{ id: { channelId: string } }> }>('search', params);
    return json.items.map((item) => item.id.channelId).filter(Boolean);
  }

  async getChannels(channelIds: string[]): Promise<ChannelDetails[]> {
    const unique = [...new Set(channelIds)].filter(Boolean);
    const channels: ChannelDetails[] = [];
    for (let i = 0; i < unique.length; i += 50) {
      const chunk = unique.slice(i, i + 50);
      const params = new URLSearchParams({
        part: 'snippet,statistics,contentDetails',
        id: chunk.join(','),
        maxResults: '50',
      });
      const json = await this.get<{
        items: Array<{
          id: string;
          snippet: { title: string; description?: string; customUrl?: string; publishedAt?: string };
          statistics?: { subscriberCount?: string; viewCount?: string; videoCount?: string };
          contentDetails: { relatedPlaylists: { uploads: string } };
        }>;
      }>('channels', params);
      for (const item of json.items) {
        channels.push({
          id: item.id,
          title: item.snippet.title,
          subscriberCount: item.statistics?.subscriberCount ? Number(item.statistics.subscriberCount) : null,
          viewCount: Number(item.statistics?.viewCount ?? 0),
          videoCount: Number(item.statistics?.videoCount ?? 0),
          uploadsPlaylistId: item.contentDetails.relatedPlaylists.uploads,
          handle: item.snippet.customUrl,
          description: item.snippet.description,
          createdAt: item.snippet.publishedAt,
        });
      }
    }
    return channels;
  }

  async getRecentUploads(channelId: string, maxResults = 50): Promise<EnrichedVideo[]> {
    const [channel] = await this.getChannels([channelId]);
    if (!channel) return [];
    const params = new URLSearchParams({
      part: 'snippet,contentDetails',
      playlistId: channel.uploadsPlaylistId,
      maxResults: String(Math.min(Math.max(maxResults, 1), 50)),
    });
    const json = await this.get<{
      items: Array<{
        contentDetails: { videoId: string; videoPublishedAt?: string };
      snippet: { title: string; description?: string; channelId: string; channelTitle: string; publishedAt: string; thumbnails?: { high?: { url: string }; default?: { url: string } } };
      }>;
    }>('playlistItems', params);
    const base: SearchVideo[] = json.items.map((item) => ({
      id: item.contentDetails.videoId,
      title: item.snippet.title,
      channelId: item.snippet.channelId || channelId,
      channelTitle: item.snippet.channelTitle || channel.title,
      publishedAt: item.contentDetails.videoPublishedAt ?? item.snippet.publishedAt,
      description: item.snippet.description,
      thumbnailUrl: item.snippet.thumbnails?.high?.url ?? item.snippet.thumbnails?.default?.url,
    }));
    return this.enrichVideos(base);
  }

  async enrichVideos(videos: SearchVideo[]): Promise<EnrichedVideo[]> {
    if (videos.length === 0) return [];
    const results: EnrichedVideo[] = [];
    for (let i = 0; i < videos.length; i += 50) {
      const chunk = videos.slice(i, i + 50);
      const params = new URLSearchParams({
        part: 'snippet,statistics,contentDetails',
        id: chunk.map((video) => video.id).join(','),
        maxResults: '50',
      });
      const json = await this.get<{
        items: Array<{
          id: string;
          snippet: { title: string; description?: string; channelId: string; channelTitle: string; publishedAt: string; thumbnails?: { high?: { url: string }; default?: { url: string } } };
          statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
          contentDetails: { duration: string };
        }>;
      }>('videos', params);
      for (const item of json.items) {
        results.push({
          id: item.id,
          title: item.snippet.title,
          channelId: item.snippet.channelId,
          channelTitle: item.snippet.channelTitle,
          publishedAt: item.snippet.publishedAt,
          viewCount: Number(item.statistics?.viewCount ?? 0),
          likeCount: item.statistics?.likeCount ? Number(item.statistics.likeCount) : null,
          commentCount: item.statistics?.commentCount ? Number(item.statistics.commentCount) : null,
          duration: item.contentDetails.duration,
          description: item.snippet.description,
          thumbnailUrl: item.snippet.thumbnails?.high?.url ?? item.snippet.thumbnails?.default?.url,
        });
      }
    }
    return results;
  }
}
