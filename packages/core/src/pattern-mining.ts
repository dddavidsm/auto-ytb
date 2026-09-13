import type { BenchmarkVideo } from './benchmark.js';
import type { ContentDNA } from './content-dna.js';

export type PatternCluster = {
  name: string;
  description: string;
  evidenceCount: number;
  referenceVideos: string[];
  referenceChannels: string[];
  successCorrelation: number;
  confidence: number;
  nicheSpecificity: number;
  transferable: boolean;
  evidence: string[];
};

const round = (value: number) => Math.round(value * 10) / 10;
const clamp = (value: number) => Math.max(0, Math.min(100, value));

export function minePatternClusters(input: { videos: BenchmarkVideo[]; dnaByVideoId: Record<string, ContentDNA>; minEvidence?: number }): PatternCluster[] {
  const minEvidence = Math.max(2, input.minEvidence ?? 3);
  const groups = new Map<string, BenchmarkVideo[]>();
  for (const video of input.videos) {
    const dna = input.dnaByVideoId[video.id];
    if (!dna) continue;
    const keys = [
      `title:${dna.titleDNA.grammarPattern}`,
      `thumb:${dna.thumbnailDNA.compositionType ?? dna.thumbnailDNA.availability}`,
      `trigger:${dna.titleDNA.emotionalTrigger}`,
      `format:${video.format}:${Math.round(video.durationSeconds / 60)}`,
    ];
    for (const key of keys) groups.set(key, [...(groups.get(key) ?? []), video]);
  }
  return [...groups.entries()]
    .filter(([, videos]) => videos.length >= minEvidence)
    .map(([key, videos]) => {
      const [kind, value] = key.split(':');
      const avgOutlier = videos.reduce((sum, video) => sum + video.likelyOutlier.score, 0) / videos.length;
      const winnerRate = videos.filter((video) => video.likelyOutlier.classification === 'BREAKOUT' || video.likelyOutlier.classification === 'EXTREME_OUTLIER').length / videos.length;
      const confidence = clamp(videos.length / 12 * 55 + new Set(videos.map((video) => video.channelId)).size / 5 * 45);
      return {
        name: `${kind === 'title' ? 'Title grammar' : kind === 'thumb' ? 'Thumbnail composition' : kind === 'trigger' ? 'Emotional trigger' : 'Format cadence'} · ${value}`,
        description: `${videos.length} observed reference videos share ${kind}=${value}; use the mechanism as a constraint for original expression.`,
        evidenceCount: videos.length,
        referenceVideos: videos.map((video) => video.id),
        referenceChannels: [...new Set(videos.map((video) => video.channelId))],
        successCorrelation: round(avgOutlier * 0.65 + winnerRate * 100 * 0.35),
        confidence: round(confidence),
        nicheSpecificity: kind === 'format' ? 35 : 65,
        transferable: kind !== 'thumb' || value !== 'UNAVAILABLE',
        evidence: videos.slice(0, 5).map((video) => `${video.title} · ${video.likelyOutlier.classification} · ${video.likelyOutlier.score}/100`),
      } satisfies PatternCluster;
    })
    .sort((a, b) => b.successCorrelation * b.confidence - a.successCorrelation * a.confidence);
}
