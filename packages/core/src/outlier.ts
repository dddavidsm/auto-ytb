import type { VideoSample } from './types.js';

const DAY_MS = 86_400_000;

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

export function viewsPerDay(video: VideoSample, now = new Date()): number {
  const ageDays = Math.max((now.getTime() - video.publishedAt.getTime()) / DAY_MS, 0.25);
  return video.views / ageDays;
}

export type OutlierResult = {
  rawViewMultiple: number;
  velocityMultiple: number;
  score: number;
};

export function calculateOutlier(
  target: VideoSample,
  comparableVideos: VideoSample[],
  now = new Date(),
): OutlierResult {
  const peers = comparableVideos.filter((video) => video.id !== target.id && video.views >= 0);
  if (peers.length < 3) return { rawViewMultiple: 1, velocityMultiple: 1, score: 50 };

  const medianViews = Math.max(median(peers.map((video) => video.views)), 1);
  const medianVelocity = Math.max(median(peers.map((video) => viewsPerDay(video, now))), 1);
  const rawViewMultiple = target.views / medianViews;
  const velocityMultiple = viewsPerDay(target, now) / medianVelocity;

  // Log scaling keeps a 100x anomaly from completely dominating a 10x anomaly.
  const combined = 0.35 * Math.log2(Math.max(rawViewMultiple, 0.25)) + 0.65 * Math.log2(Math.max(velocityMultiple, 0.25));
  const score = Math.max(0, Math.min(100, 50 + combined * 18));

  return {
    rawViewMultiple: Math.round(rawViewMultiple * 100) / 100,
    velocityMultiple: Math.round(velocityMultiple * 100) / 100,
    score: Math.round(score * 10) / 10,
  };
}
