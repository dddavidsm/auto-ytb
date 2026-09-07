import { calculateOutlier, median, viewsPerDay } from './outlier.js';
import type { VideoSample } from './types.js';

export type CompetitorVideo = VideoSample & { title: string };
export type CompetitorProfile = {
  channelId: string;
  medianViews: number;
  medianViewsPerDay: number;
  breakoutCount: number;
  strongestOutlier: number;
  recentVideos: number;
};

export function profileCompetitor(
  channelId: string,
  videos: CompetitorVideo[],
  now = new Date(),
): CompetitorProfile {
  if (videos.length === 0) {
    return { channelId, medianViews: 0, medianViewsPerDay: 0, breakoutCount: 0, strongestOutlier: 0, recentVideos: 0 };
  }
  const results = videos.map((video) => calculateOutlier(video, videos, now));
  return {
    channelId,
    medianViews: Math.round(median(videos.map((v) => v.views))),
    medianViewsPerDay: Math.round(median(videos.map((v) => viewsPerDay(v, now)))),
    breakoutCount: results.filter((r) => r.score >= 80).length,
    strongestOutlier: Math.max(...results.map((r) => r.score)),
    recentVideos: videos.length,
  };
}
