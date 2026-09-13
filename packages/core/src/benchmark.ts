export type BenchmarkFormat = 'LONG_FORM' | 'SHORTS';

export type BenchmarkRequest = {
  niche: string;
  subniche?: string;
  country?: string;
  language?: string;
  format?: BenchmarkFormat;
  targetDurationSeconds?: number;
  monetizationPriority?: 'LOW' | 'MEDIUM' | 'HIGH';
  productionBudgetUsd?: number;
};

export type BenchmarkChannel = {
  id: string;
  handle?: string;
  name: string;
  description?: string;
  createdAt?: string;
  subscribers: number | null;
  totalViews: number;
  totalVideos: number;
  recentUploadFrequencyPerWeek: number;
  estimatedViewsPerMonth: number;
  language?: string;
  country?: string;
  category?: string;
  niche: string;
  recentMomentum: number;
  source: 'youtube-data-api' | 'fixture' | 'other';
  observedAt: string;
};

export type OutlierClassification = 'NORMAL' | 'GOOD' | 'STRONG_OUTLIER' | 'BREAKOUT' | 'EXTREME_OUTLIER';

export type OutlierAssessment = {
  score: number;
  classification: OutlierClassification;
  rawViewMultiple: number;
  velocityMultiple: number;
  subscriberRatio: number | null;
  persistenceScore: number;
  engagementProxy: number | null;
  reasons: string[];
};

export type BenchmarkVideo = {
  id: string;
  channelId: string;
  title: string;
  description?: string;
  publishDate: string;
  durationSeconds: number;
  views: number;
  likes: number | null;
  comments: number | null;
  thumbnailUrl?: string;
  channelSubscribers: number | null;
  viewsPerSubscriber: number | null;
  ageHours: number;
  viewsPerDay: number;
  viewsPerHour: number;
  historicalPerformance: 'UNKNOWN' | 'BELOW_BASELINE' | 'BASELINE' | 'ABOVE_BASELINE';
  recentPerformance: 'UNKNOWN' | 'SLOWING' | 'STABLE' | 'ACCELERATING';
  likelyOutlier: OutlierAssessment;
  format: BenchmarkFormat;
  topic?: string;
};

export type BenchmarkReport = {
  request: Required<Pick<BenchmarkRequest, 'niche' | 'language'>> & BenchmarkRequest;
  channels: BenchmarkChannel[];
  videos: BenchmarkVideo[];
  evidence: Array<{ source: string; url?: string; observedAt: string; note: string }>;
  limitations: string[];
  generatedAt: string;
};

const DAY = 86_400_000;
const HOUR = 3_600_000;
const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const round = (value: number, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

function median(values: number[]): number {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

export function benchmarkFormat(durationSeconds: number): BenchmarkFormat {
  return durationSeconds > 0 && durationSeconds <= 180 ? 'SHORTS' : 'LONG_FORM';
}

export function ageHours(publishDate: string | Date, now = new Date()): number {
  return Math.max(0.25, (now.getTime() - new Date(publishDate).getTime()) / HOUR);
}

export function assessBenchmarkOutlier(input: {
  target: Pick<BenchmarkVideo, 'id' | 'views' | 'publishDate' | 'likes' | 'comments' | 'channelSubscribers'>;
  comparable: Array<Pick<BenchmarkVideo, 'id' | 'views' | 'publishDate' | 'likes' | 'comments' | 'channelSubscribers'>>;
  now?: Date;
}): OutlierAssessment {
  const now = input.now ?? new Date();
  const peers = input.comparable.filter((video) => video.id !== input.target.id && video.views >= 0);
  const targetAgeHours = ageHours(input.target.publishDate, now);
  const targetViewsPerDay = input.target.views / Math.max(targetAgeHours / 24, 0.25);
  const peerViews = peers.map((video) => video.views);
  const peerVelocity = peers.map((video) => video.views / Math.max(ageHours(video.publishDate, now) / 24, 0.25));
  const baselineViews = Math.max(median(peerViews), 1);
  const baselineVelocity = Math.max(median(peerVelocity), 1);
  const rawViewMultiple = input.target.views / baselineViews;
  const velocityMultiple = targetViewsPerDay / baselineVelocity;
  const peerSubscriberRatios = peers
    .filter((video) => (video.channelSubscribers ?? 0) > 0)
    .map((video) => video.views / Math.max(video.channelSubscribers ?? 1, 1));
  const subscriberRatio = input.target.channelSubscribers && input.target.channelSubscribers > 0
    ? input.target.views / input.target.channelSubscribers
    : null;
  const baselineSubscriberRatio = Math.max(median(peerSubscriberRatios), 0.0001);
  const subscriberMultiple = subscriberRatio == null ? 1 : subscriberRatio / baselineSubscriberRatio;
  const ageDays = targetAgeHours / 24;
  const persistenceScore = ageDays >= 30 && velocityMultiple >= 1.25
    ? 100
    : ageDays >= 14 && velocityMultiple >= 1.15
      ? 80
      : ageDays >= 7 && velocityMultiple >= 1.1
        ? 60
        : 25;
  const engagementProxy = input.target.likes == null && input.target.comments == null
    ? null
    : clamp(((input.target.likes ?? 0) + (input.target.comments ?? 0)) / Math.max(input.target.views, 1) * 10_000);
  const engagementScore = engagementProxy == null ? 50 : clamp(engagementProxy * 5);
  const score = clamp(
    50 +
    Math.log2(Math.max(rawViewMultiple, 0.25)) * 15 +
    Math.log2(Math.max(velocityMultiple, 0.25)) * 18 +
    Math.log2(Math.max(subscriberMultiple, 0.25)) * 7 +
    (persistenceScore - 50) * 0.08 +
    (engagementScore - 50) * 0.05,
  );
  const classification: OutlierClassification = score >= 90 && (rawViewMultiple >= 8 || velocityMultiple >= 8)
    ? 'EXTREME_OUTLIER'
    : score >= 78 && (rawViewMultiple >= 4 || velocityMultiple >= 4)
      ? 'BREAKOUT'
      : score >= 65 && (rawViewMultiple >= 2 || velocityMultiple >= 2)
        ? 'STRONG_OUTLIER'
        : score >= 55
          ? 'GOOD'
          : 'NORMAL';
  const reasons: string[] = [];
  if (rawViewMultiple >= 2) reasons.push(`${round(rawViewMultiple)}× the comparable median views`);
  if (velocityMultiple >= 2) reasons.push(`${round(velocityMultiple)}× the comparable median velocity`);
  if (subscriberMultiple >= 2 && subscriberRatio != null) reasons.push('views-to-subscriber efficiency is unusually high');
  if (persistenceScore >= 80) reasons.push('performance persists beyond the initial launch window');
  if (peers.length < 3) reasons.push('limited comparable sample; confidence is reduced');
  if (!reasons.length) reasons.push('no material deviation from the comparable baseline');
  return {
    score: round(score, 1),
    classification,
    rawViewMultiple: round(rawViewMultiple),
    velocityMultiple: round(velocityMultiple),
    subscriberRatio: subscriberRatio == null ? null : round(subscriberRatio, 5),
    persistenceScore: round(persistenceScore, 1),
    engagementProxy: engagementProxy == null ? null : round(engagementProxy / 100, 5),
    reasons,
  };
}

export function normalizeBenchmarkVideo(input: {
  id: string;
  channelId: string;
  title: string;
  description?: string;
  publishDate: string;
  durationSeconds: number;
  views: number;
  likes?: number | null;
  comments?: number | null;
  thumbnailUrl?: string;
  channelSubscribers?: number | null;
  topic?: string;
  comparable?: Array<Pick<BenchmarkVideo, 'id' | 'views' | 'publishDate' | 'likes' | 'comments' | 'channelSubscribers'>>;
  now?: Date;
}): BenchmarkVideo {
  const now = input.now ?? new Date();
  const hours = ageHours(input.publishDate, now);
  const viewsPerDay = Math.max(0, input.views) / Math.max(hours / 24, 0.25);
  const assessment = assessBenchmarkOutlier({
    target: { id: input.id, views: input.views, publishDate: input.publishDate, likes: input.likes ?? null, comments: input.comments ?? null, channelSubscribers: input.channelSubscribers ?? null },
    comparable: input.comparable ?? [],
    now,
  });
  return {
    id: input.id,
    channelId: input.channelId,
    title: input.title,
    description: input.description,
    publishDate: new Date(input.publishDate).toISOString(),
    durationSeconds: Math.max(0, input.durationSeconds),
    views: Math.max(0, input.views),
    likes: input.likes ?? null,
    comments: input.comments ?? null,
    thumbnailUrl: input.thumbnailUrl,
    channelSubscribers: input.channelSubscribers ?? null,
    viewsPerSubscriber: input.channelSubscribers && input.channelSubscribers > 0 ? round(input.views / input.channelSubscribers, 5) : null,
    ageHours: round(hours),
    viewsPerDay: round(viewsPerDay),
    viewsPerHour: round(viewsPerDay / 24),
    historicalPerformance: assessment.rawViewMultiple >= 1.5 ? 'ABOVE_BASELINE' : assessment.rawViewMultiple < 0.7 ? 'BELOW_BASELINE' : 'BASELINE',
    recentPerformance: assessment.velocityMultiple >= 1.3 ? 'ACCELERATING' : assessment.velocityMultiple < 0.75 ? 'SLOWING' : 'STABLE',
    likelyOutlier: assessment,
    format: benchmarkFormat(input.durationSeconds),
    topic: input.topic,
  };
}

export const SEED_BENCHMARK_CHANNELS = [
  { name: 'fern', handle: '@fern-tv' },
  { name: 'Hoog', handle: '@hoog-youtube' },
  { name: 'LEMMiNO', handle: '@lemmino' },
  { name: 'RealLifeLore', handle: '@RealLifeLore' },
  { name: 'Primal Space', handle: '@primalspace' },
  { name: 'How Money Works', handle: '@howmoneyworks' },
  { name: 'MagnatesMedia', handle: '@magnatesmedia' },
  { name: 'Search Party', handle: '@searchparty' },
  { name: 'ColdFusion', handle: '@ColdFusion' },
  { name: 'The Infographics Show', handle: '@TheInfographicsShow' },
  { name: 'AiTelly', handle: '@AiTelly' },
] as const;

export { DAY };
