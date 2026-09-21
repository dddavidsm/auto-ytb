import type { PackagingVariant } from './types.js';

export type PackagingAttribute = 'curiosity' | 'clarity' | 'credibility' | 'differentiation';
export type PackagingAttributeLearning = {
  attribute: PackagingAttribute;
  sampleSize: number;
  slope: number;
  confidence: number;
};
export type PackagingLearningProfile = {
  sampleSize: number;
  attributes: PackagingAttributeLearning[];
};
export type PackagingSelection = {
  selected: PackagingVariant;
  mode: 'EXPLOIT' | 'EXPLORE';
  explorationRate: number;
  scores: Array<{ id: string; baseScore: number; learnedScore: number; noveltyScore: number; banditScore: number }>;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const round = (value: number) => Math.round(value * 10) / 10;

function stableUnit(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

export function explorationRateForSample(sampleSize: number): number {
  // Learn quickly during cold start, but keep a permanent 8% exploration floor.
  return clamp(0.28 / Math.sqrt(Math.max(1, sampleSize / 3)), 0.08, 0.28);
}

function learnedUtility(variant: PackagingVariant, profile?: PackagingLearningProfile): number {
  if (!profile || profile.sampleSize < 3) return 50;
  let weighted = 0;
  let weightTotal = 0;
  for (const item of profile.attributes) {
    const value = variant[item.attribute];
    const confidence = clamp(item.confidence, 0, 1);
    // slope is outcome-score points per 1 attribute point; cap influence to avoid runaway feedback.
    const centered = value - 70;
    const contribution = clamp(50 + centered * clamp(item.slope, -0.8, 0.8), 0, 100);
    weighted += contribution * confidence;
    weightTotal += confidence;
  }
  return weightTotal ? weighted / weightTotal : 50;
}

function noveltyUtility(variant: PackagingVariant, variants: PackagingVariant[]): number {
  if (variants.length < 2) return 50;
  const attrs: PackagingAttribute[] = ['curiosity', 'clarity', 'credibility', 'differentiation'];
  const distances = variants
    .filter((candidate) => candidate.id !== variant.id)
    .map((candidate) => attrs.reduce((sum, attr) => sum + Math.abs(variant[attr] - candidate[attr]), 0) / attrs.length);
  const nearest = Math.min(...distances);
  return clamp(nearest * 2.5, 0, 100);
}

export function selectPackagingWithExploration(input: {
  variants: PackagingVariant[];
  profile?: PackagingLearningProfile;
  experimentSeed: string;
  /**
   * Maximum number of ranked variants that are eligible to win selection.
   * The canonical pipeline materializes at most two non-Short thumbnail arms,
   * so the default keeps selection inside that materialized pool while still
   * scoring all generated ideas for learning/diagnostics.
   */
  selectionPoolSize?: number;
}): PackagingSelection {
  if (!input.variants.length) throw new Error('At least one packaging variant is required');
  const sampleSize = input.profile?.sampleSize ?? 0;
  const explorationRate = explorationRateForSample(sampleSize);
  const rows = input.variants.map((variant) => {
    const learnedScore = learnedUtility(variant, input.profile);
    const noveltyScore = noveltyUtility(variant, input.variants);
    const banditScore = variant.score * 0.58 + learnedScore * 0.30 + noveltyScore * 0.12;
    return { id: variant.id, baseScore: round(variant.score), learnedScore: round(learnedScore), noveltyScore: round(noveltyScore), banditScore: round(banditScore) };
  });
  const ranked = [...rows].sort((a, b) => b.banditScore - a.banditScore);
  const poolSize = Math.max(1, Math.min(input.variants.length, Math.floor(input.selectionPoolSize ?? 2)));
  const eligible = ranked.slice(0, poolSize);
  const explore = stableUnit(`${input.experimentSeed}:mode`) < explorationRate && eligible.length > 1;
  let selectedId = eligible[0]!.id;
  if (explore) {
    // Explore only among variants that the caller can actually materialize.
    // This prevents a valid bandit arm from winning without a corresponding
    // thumbnail asset, while retaining all variants in the learning scores.
    const alternatives = eligible.slice(1).sort((a, b) => (b.noveltyScore * 0.65 + b.baseScore * 0.35) - (a.noveltyScore * 0.65 + a.baseScore * 0.35));
    const index = Math.floor(stableUnit(`${input.experimentSeed}:arm`) * alternatives.length);
    selectedId = alternatives[Math.min(index, alternatives.length - 1)]!.id;
  }
  return {
    selected: input.variants.find((variant) => variant.id === selectedId)!,
    mode: explore ? 'EXPLORE' : 'EXPLOIT',
    explorationRate: round(explorationRate * 100) / 100,
    scores: rows,
  };
}
