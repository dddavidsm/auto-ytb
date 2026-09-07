import type { SqlClient } from './sql.js';
import { withTransaction } from './sql.js';

export type ChannelInput = {
  youtubeChannelId: string;
  title: string;
  language?: string | null;
  country?: string | null;
  niche?: string | null;
  isCompetitor?: boolean;
};

export type VideoInput = {
  youtubeVideoId: string;
  channelId: string;
  title: string;
  publishedAt: Date;
  durationSeconds?: number | null;
  language?: string | null;
  topicCluster?: string | null;
};

export type VideoSnapshotInput = {
  videoId: string;
  capturedAt?: Date;
  views: number;
  likes?: number | null;
  comments?: number | null;
  viewsPerHour?: number | null;
};

export class ChannelRepository {
  constructor(private readonly db: SqlClient) {}

  async upsert(input: ChannelInput): Promise<string> {
    const result = await this.db.query<{ id: string }>(
      `insert into channels (youtube_channel_id, title, language, country, niche, is_competitor, updated_at)
       values ($1,$2,$3,$4,$5,$6,now())
       on conflict (youtube_channel_id) do update set
         title=excluded.title,
         language=coalesce(excluded.language, channels.language),
         country=coalesce(excluded.country, channels.country),
         niche=coalesce(excluded.niche, channels.niche),
         is_competitor=channels.is_competitor or excluded.is_competitor,
         updated_at=now()
       returning id`,
      [input.youtubeChannelId, input.title, input.language ?? null, input.country ?? null, input.niche ?? null, input.isCompetitor ?? false],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Channel upsert returned no row');
    return row.id;
  }
}

export class VideoRepository {
  constructor(private readonly db: SqlClient) {}

  async upsert(input: VideoInput): Promise<string> {
    const result = await this.db.query<{ id: string }>(
      `insert into videos (youtube_video_id, channel_id, title, published_at, duration_seconds, language, topic_cluster, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,now())
       on conflict (youtube_video_id) do update set
         channel_id=excluded.channel_id,
         title=excluded.title,
         published_at=excluded.published_at,
         duration_seconds=coalesce(excluded.duration_seconds, videos.duration_seconds),
         language=coalesce(excluded.language, videos.language),
         topic_cluster=coalesce(excluded.topic_cluster, videos.topic_cluster),
         updated_at=now()
       returning id`,
      [input.youtubeVideoId, input.channelId, input.title, input.publishedAt, input.durationSeconds ?? null, input.language ?? null, input.topicCluster ?? null],
    );
    const row = result.rows[0];
    if (!row) throw new Error('Video upsert returned no row');
    return row.id;
  }

  async addSnapshot(input: VideoSnapshotInput): Promise<void> {
    await this.db.query(
      `insert into video_snapshots (video_id, captured_at, views, likes, comments, views_per_hour)
       values ($1,$2,$3,$4,$5,$6)`,
      [input.videoId, input.capturedAt ?? new Date(), input.views, input.likes ?? null, input.comments ?? null, input.viewsPerHour ?? null],
    );
  }

  async upsertWithSnapshot(video: VideoInput, snapshot: Omit<VideoSnapshotInput, 'videoId'>): Promise<string> {
    return withTransaction(this.db, async (tx) => {
      const repository = new VideoRepository(tx);
      const videoId = await repository.upsert(video);
      await repository.addSnapshot({ ...snapshot, videoId });
      return videoId;
    });
  }
}

export class CompetitorSnapshotRepository {
  constructor(private readonly db: SqlClient) {}

  async add(input: {
    channelId: string;
    capturedAt?: Date;
    subscribers?: number | null;
    totalViews?: number | null;
    videoCount?: number | null;
    medianRecentViews: number;
    medianRecentViewsPerDay: number;
    breakoutCount: number;
    strongestOutlier: number;
  }): Promise<void> {
    await this.db.query(
      `insert into competitor_snapshots
       (channel_id,captured_at,subscribers,total_views,video_count,median_recent_views,median_recent_views_per_day,breakout_count,strongest_outlier)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [input.channelId, input.capturedAt ?? new Date(), input.subscribers ?? null, input.totalViews ?? null, input.videoCount ?? null, input.medianRecentViews, input.medianRecentViewsPerDay, input.breakoutCount, input.strongestOutlier],
    );
  }
}
