import type { BenchmarkFormat } from './benchmark.js';

export type ContentFormatName = 'DOCUMENTARY' | 'EXPLAINER' | 'RANKING' | 'CHARACTER_SERIES' | 'SHORT';
export type ContentFormatProfile = {
  format: ContentFormatName | 'LONG_FORM' | 'SHORTS';
  targetDurationSeconds: number;
  aspectRatio?: '16:9' | '9:16';
  hookIntensity?: number;
  hookProfile?: { intensity: number; firstPayoffSeconds: number; variants: number };
  storyStructure?: string[];
  visualCadence?: { sceneLengthRangeSeconds: [number, number]; changeMode: string };
  sceneLengthSeconds: number;
  visualCategories: string[];
  researchDepth: 'NONE' | 'LIGHT' | 'STANDARD' | 'DEEP';
  factCheckLevel?: 'NONE' | 'CLAIMS' | 'EVERY_CRITICAL_CLAIM';
  factChecking: boolean;
  voiceProfile?: { mode: 'NARRATION' | 'DIALOGUE' | 'HYBRID' | 'NONE'; language: string };
  musicProfile?: { mode: 'DUCKED_BED' | 'SPARSE_SFX' | 'NATURAL_SOUND' | 'NONE'; rightsRequired: boolean };
  ctaStrategy?: string;
  thumbnailStrategy?: string;
  titleStrategy?: string;
  productionStrategy: 'DRAFT_THEN_FINAL' | 'FINAL_ONLY';
  benchmarkFormat?: BenchmarkFormat | 'CHARACTER_SERIES' | 'RANKING';
};

const profile = (input: ContentFormatProfile): ContentFormatProfile => Object.freeze(input);

export const CONTENT_FORMAT_PROFILES: Record<ContentFormatName, ContentFormatProfile> = {
  DOCUMENTARY: profile({ format: 'DOCUMENTARY', benchmarkFormat: 'LONG_FORM', targetDurationSeconds: 600, aspectRatio: '16:9', hookProfile: { intensity: 82, firstPayoffSeconds: 45, variants: 15 }, storyStructure: ['cold open', 'promise', 'context', 'evidence', 'escalation', 'reveal', 'payoff', 'cta'], visualCadence: { sceneLengthRangeSeconds: [5, 16], changeMode: 'change visual mode when narrative function changes' }, sceneLengthSeconds: 10, visualCategories: ['DOCUMENT', 'MAP', 'CHART', 'AI_IMAGE', 'KINETIC_TEXT'], researchDepth: 'DEEP', factCheckLevel: 'EVERY_CRITICAL_CLAIM', factChecking: true, voiceProfile: { mode: 'NARRATION', language: 'en' }, musicProfile: { mode: 'DUCKED_BED', rightsRequired: true }, ctaStrategy: 'after payoff', thumbnailStrategy: 'one dominant subject plus withheld context', titleStrategy: 'specific causal promise', productionStrategy: 'DRAFT_THEN_FINAL' }),
  EXPLAINER: profile({ format: 'EXPLAINER', benchmarkFormat: 'LONG_FORM', targetDurationSeconds: 480, aspectRatio: '16:9', hookProfile: { intensity: 76, firstPayoffSeconds: 35, variants: 15 }, storyStructure: ['question', 'promise', 'model', 'worked example', 'counterexample', 'takeaway', 'cta'], visualCadence: { sceneLengthRangeSeconds: [4, 12], changeMode: 'switch between model, example and annotation' }, sceneLengthSeconds: 8, visualCategories: ['INFOGRAPHIC', 'CHART', 'SCREEN', 'MAP', 'AI_IMAGE'], researchDepth: 'STANDARD', factCheckLevel: 'EVERY_CRITICAL_CLAIM', factChecking: true, voiceProfile: { mode: 'NARRATION', language: 'en' }, musicProfile: { mode: 'SPARSE_SFX', rightsRequired: true }, ctaStrategy: 'related next question after takeaway', thumbnailStrategy: 'clear object and visible transformation', titleStrategy: 'how/why mechanism', productionStrategy: 'DRAFT_THEN_FINAL' }),
  RANKING: profile({ format: 'RANKING', benchmarkFormat: 'RANKING', targetDurationSeconds: 540, aspectRatio: '16:9', hookProfile: { intensity: 88, firstPayoffSeconds: 25, variants: 15 }, storyStructure: ['highest-stakes result', 'scoring rule', 'ranked blocks', 'upsets', 'winner reveal', 'cta'], visualCadence: { sceneLengthRangeSeconds: [3, 10], changeMode: 'new proof and rank transition per item' }, sceneLengthSeconds: 7, visualCategories: ['CHART', 'MAP', 'DOCUMENT', 'SCREEN', 'KINETIC_TEXT'], researchDepth: 'DEEP', factCheckLevel: 'EVERY_CRITICAL_CLAIM', factChecking: true, voiceProfile: { mode: 'NARRATION', language: 'en' }, musicProfile: { mode: 'DUCKED_BED', rightsRequired: true }, ctaStrategy: 'invite the next comparison after winner', thumbnailStrategy: 'one winner/loser contrast with rank cue', titleStrategy: 'numbered or strongest-result promise', productionStrategy: 'DRAFT_THEN_FINAL' }),
  CHARACTER_SERIES: profile({ format: 'CHARACTER_SERIES', benchmarkFormat: 'CHARACTER_SERIES', targetDurationSeconds: 360, aspectRatio: '16:9', hookProfile: { intensity: 84, firstPayoffSeconds: 30, variants: 15 }, storyStructure: ['character problem', 'goal', 'attempt', 'complication', 'choice', 'payoff', 'next-episode seed'], visualCadence: { sceneLengthRangeSeconds: [3, 9], changeMode: 'preserve identity while varying composition and action' }, sceneLengthSeconds: 6, visualCategories: ['CHARACTER', 'AI_IMAGE', 'AI_VIDEO', 'KINETIC_TEXT'], researchDepth: 'NONE', factCheckLevel: 'NONE', factChecking: false, voiceProfile: { mode: 'DIALOGUE', language: 'en' }, musicProfile: { mode: 'NATURAL_SOUND', rightsRequired: true }, ctaStrategy: 'continuity question after payoff', thumbnailStrategy: 'canonical character plus episode-specific prop', titleStrategy: 'specific episode conflict', productionStrategy: 'DRAFT_THEN_FINAL' }),
  SHORT: profile({ format: 'SHORT', benchmarkFormat: 'SHORTS', targetDurationSeconds: 45, aspectRatio: '9:16', hookProfile: { intensity: 94, firstPayoffSeconds: 8, variants: 15 }, storyStructure: ['cold open', 'promise', 'proof', 'twist', 'payoff', 'cta'], visualCadence: { sceneLengthRangeSeconds: [1.5, 5], changeMode: 'visual action or meaningful state change every few seconds' }, sceneLengthSeconds: 3, visualCategories: ['AI_VIDEO', 'AI_IMAGE', 'SCREEN', 'KINETIC_TEXT', 'CHART'], researchDepth: 'LIGHT', factCheckLevel: 'CLAIMS', factChecking: true, voiceProfile: { mode: 'NARRATION', language: 'en' }, musicProfile: { mode: 'SPARSE_SFX', rightsRequired: true }, ctaStrategy: 'after payoff, never before', thumbnailStrategy: 'mobile-first single subject', titleStrategy: 'short concrete consequence', productionStrategy: 'DRAFT_THEN_FINAL' }),
};

export function getContentFormatProfile(format: ContentFormatName | 'LONG_FORM' | 'SHORTS'): ContentFormatProfile {
  if (format === 'LONG_FORM') return CONTENT_FORMAT_PROFILES.DOCUMENTARY;
  if (format === 'SHORTS') return CONTENT_FORMAT_PROFILES.SHORT;
  return CONTENT_FORMAT_PROFILES[format];
}
