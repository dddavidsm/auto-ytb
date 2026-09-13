import type { BenchmarkVideo } from './benchmark.js';
import type { ContentDNA } from './content-dna.js';

export type ReferenceRole = 'TOPIC_FRAMING' | 'THUMBNAIL_COMPOSITION' | 'TITLE_GRAMMAR' | 'HOOK_ARCHITECTURE' | 'EDITING_PACING' | 'VISUAL_LANGUAGE';

export type ReferencePackItem = {
  videoId: string;
  channelId: string;
  title: string;
  role: ReferenceRole;
  evidence: string[];
  outlierScore: number;
  selectedBecause: string;
};

export type ReferencePack = {
  version: 1;
  target: { niche: string; topic?: string; format?: BenchmarkVideo['format'] };
  items: ReferencePackItem[];
  evidenceSummary: string[];
  diversity: { channels: number; videos: number; roles: number };
  limitations: string[];
};

const roles: ReferenceRole[] = ['TOPIC_FRAMING', 'THUMBNAIL_COMPOSITION', 'TITLE_GRAMMAR', 'HOOK_ARCHITECTURE', 'EDITING_PACING', 'VISUAL_LANGUAGE'];
const similarity = (a: ContentDNA | undefined, b: ContentDNA | undefined) => {
  if (!a || !b) return 0;
  let score = 0;
  if (a.titleDNA.grammarPattern === b.titleDNA.grammarPattern) score += 35;
  score += Math.max(0, 20 - Math.abs(a.titleDNA.wordCount - b.titleDNA.wordCount) * 3);
  score += Math.max(0, 20 - Math.abs(a.videoDNA.durationSeconds - b.videoDNA.durationSeconds) / 30);
  if (a.thumbnailDNA.availability !== 'UNAVAILABLE' && b.thumbnailDNA.availability !== 'UNAVAILABLE') score += 25;
  return score;
};

export function buildReferencePack(input: {
  niche: string;
  topic?: string;
  format?: BenchmarkVideo['format'];
  videos: BenchmarkVideo[];
  dnaByVideoId?: Record<string, ContentDNA>;
  minItems?: number;
  maxItems?: number;
}): ReferencePack {
  const minItems = Math.max(3, Math.min(input.minItems ?? 3, 7));
  const maxItems = Math.max(minItems, Math.min(input.maxItems ?? 7, 7));
  const eligible = input.videos.filter((video) => !input.format || video.format === input.format).sort((a, b) => b.likelyOutlier.score - a.likelyOutlier.score || b.viewsPerDay - a.viewsPerDay);
  const chosen = new Set<string>();
  const items: ReferencePackItem[] = [];
  for (const role of roles) {
    if (items.length >= maxItems) break;
    const candidate = eligible.find((video) => !chosen.has(video.id));
    if (!candidate) break;
    const dna = input.dnaByVideoId?.[candidate.id];
    chosen.add(candidate.id);
    const evidence = candidate.likelyOutlier.reasons.slice(0, 2);
    if (role === 'THUMBNAIL_COMPOSITION' && dna?.thumbnailDNA.availability === 'UNAVAILABLE') evidence.push('thumbnail metadata unavailable; role is provisional');
    items.push({ videoId: candidate.id, channelId: candidate.channelId, title: candidate.title, role, evidence, outlierScore: candidate.likelyOutlier.score, selectedBecause: `${role.toLowerCase().replaceAll('_', ' ')} from an observable winner; this is a structural reference, not an asset to copy` });
  }
  for (const candidate of eligible) {
    if (items.length >= minItems && items.length >= maxItems) break;
    if (chosen.has(candidate.id)) continue;
    chosen.add(candidate.id);
    items.push({ videoId: candidate.id, channelId: candidate.channelId, title: candidate.title, role: 'TOPIC_FRAMING', evidence: candidate.likelyOutlier.reasons.slice(0, 2), outlierScore: candidate.likelyOutlier.score, selectedBecause: 'additional independent evidence to reduce single-video imitation risk' });
  }
  const limitations: string[] = [];
  if (eligible.length < minItems) limitations.push(`Only ${eligible.length} eligible reference video(s) were available; target is ${minItems}.`);
  if (!items.some((item) => item.role === 'THUMBNAIL_COMPOSITION' && input.dnaByVideoId?.[item.videoId]?.thumbnailDNA.availability === 'VISION')) limitations.push('No vision-derived thumbnail DNA is available; thumbnail conclusions remain provisional.');
  return {
    version: 1,
    target: { niche: input.niche, topic: input.topic, format: input.format },
    items,
    evidenceSummary: items.flatMap((item) => item.evidence.map((reason) => `${item.title}: ${reason}`)).slice(0, 12),
    diversity: { channels: new Set(items.map((item) => item.channelId)).size, videos: items.length, roles: new Set(items.map((item) => item.role)).size },
    limitations,
  };
}

export { similarity as referenceSimilarity };
