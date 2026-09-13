import { topicSimilarity } from './topic-cluster.js';
import type { ContentDNA } from './content-dna.js';
import type { PatternCluster } from './pattern-mining.js';
import type { ReferencePack } from './reference-pack.js';

export type TitleFamily = 'WHY' | 'HOW' | 'HIDDEN_TRUTH' | 'CONTRADICTION' | 'CONSEQUENCE' | 'MYSTERY' | 'SCALE' | 'TRANSFORMATION' | 'THREAT' | 'UNEXPECTED_RESULT';
export type TitleCandidate = {
  id: string;
  text: string;
  formula: TitleFamily;
  references: string[];
  referencePatterns: string[];
  curiosity: number;
  clarity: number;
  specificity: number;
  novelty: number;
  emotionalPull: number;
  mobileReadability: number;
  saturationRisk: number;
  titleThumbnailPotential: number;
  overallScore: number;
  scoreReasons: string[];
};

const clamp = (value: number) => Math.max(0, Math.min(100, value));
const round = (value: number) => Math.round(value * 10) / 10;
const words = (value: string) => value.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
const unique = <T>(values: T[]) => [...new Set(values)];

function lexicalOverlap(left: string, right: string): number {
  const a = new Set(words(left)); const b = new Set(words(right));
  if (!a.size || !b.size) return 0;
  return [...a].filter((word) => b.has(word)).length / Math.max(1, Math.min(a.size, b.size));
}

const templates: Array<[TitleFamily, (topic: string, angle: string) => string]> = [
  ['WHY', (topic) => `Why ${topic} Was Never Going to Work`],
  ['WHY', (topic) => `Why ${topic} Quietly Changed the Game`],
  ['HOW', (topic) => `How ${topic} Created a Problem Nobody Expected`],
  ['HOW', (topic) => `How ${topic} Went From Breakthrough to Backlash`],
  ['HIDDEN_TRUTH', (topic) => `The Hidden Cost Behind ${topic}`],
  ['HIDDEN_TRUTH', (topic) => `The Part of ${topic} Everyone Missed`],
  ['CONTRADICTION', (topic) => `${topic} Looked Like Success. It Wasn't.`],
  ['CONTRADICTION', (topic) => `${topic} Solved the Wrong Problem`],
  ['CONSEQUENCE', (topic) => `The Decision That Put ${topic} at Risk`],
  ['CONSEQUENCE', (topic) => `What Happened After ${topic} Finally Worked`],
  ['MYSTERY', (topic) => `What Really Happened to ${topic}?`],
  ['MYSTERY', (topic) => `The Mystery That Explains ${topic}`],
  ['SCALE', (topic) => `The $1 Billion Detail That Changed ${topic}`],
  ['SCALE', (topic) => `How One Small Choice Reshaped ${topic}`],
  ['TRANSFORMATION', (topic) => `How ${topic} Turned Into Something Else`],
  ['TRANSFORMATION', (topic) => `The Transformation That Made ${topic} Inevitable`],
  ['THREAT', (topic) => `The Threat Hiding Inside ${topic}`],
  ['THREAT', (topic) => `Why ${topic} May Be Running Out of Time`],
  ['UNEXPECTED_RESULT', (topic) => `${topic} Worked—Until It Produced the Opposite Result`],
  ['UNEXPECTED_RESULT', (topic) => `The Unexpected Result of Trying to Fix ${topic}`],
];

export function generateTitleCandidates(input: { topic: string; angle: string; referencePack?: ReferencePack; patterns?: PatternCluster[]; referenceTitles?: string[]; count?: number }): TitleCandidate[] {
  const titles = templates.slice(0, Math.max(20, input.count ?? 20));
  const referenceTitles = input.referenceTitles ?? [];
  const referenceIds = input.referencePack?.items.map((item) => item.videoId) ?? [];
  const patterns = input.patterns?.slice(0, 4).map((pattern) => pattern.name) ?? [];
  return titles.map(([formula, build], index) => {
    const text = build(input.topic, input.angle);
    const maxSimilarity = Math.max(0, ...referenceTitles.map((reference) => reference.trim().toLowerCase() === text.trim().toLowerCase() ? 1 : lexicalOverlap(text, reference)));
    const curiosity = clamp(58 + (['MYSTERY', 'HIDDEN_TRUTH', 'CONTRADICTION', 'THREAT'].includes(formula) ? 24 : 12));
    const clarity = clamp(88 - Math.max(0, text.length - 62) * 0.7 - (formula === 'MYSTERY' ? 4 : 0));
    const specificity = clamp(54 + (/[0-9$]/.test(text) ? 18 : 0) + (input.topic.split(/\s+/).length >= 2 ? 15 : 0));
    const novelty = clamp(100 - maxSimilarity * 100);
    const emotionalPull = clamp(58 + (['THREAT', 'CONSEQUENCE', 'SCALE', 'UNEXPECTED_RESULT'].includes(formula) ? 25 : 12));
    const mobileReadability = clamp(100 - Math.max(0, text.length - 55) * 1.2);
    const saturationRisk = clamp((maxSimilarity * 60) + (['WHY', 'HOW'].includes(formula) ? 22 : 8));
    const titleThumbnailPotential = clamp(62 + (['CONTRADICTION', 'MYSTERY', 'HIDDEN_TRUTH', 'UNEXPECTED_RESULT'].includes(formula) ? 25 : 12));
    const overallScore = round(curiosity * 0.18 + clarity * 0.16 + specificity * 0.13 + novelty * 0.18 + emotionalPull * 0.12 + mobileReadability * 0.12 + titleThumbnailPotential * 0.11 - saturationRisk * 0.1);
    return { id: `title-${String(index + 1).padStart(2, '0')}`, text, formula, references: referenceIds, referencePatterns: patterns, curiosity, clarity: round(clarity), specificity, novelty: round(novelty), emotionalPull, mobileReadability: round(mobileReadability), saturationRisk: round(saturationRisk), titleThumbnailPotential, overallScore, scoreReasons: [`${formula} family`, `novelty ${round(novelty)}/100 after reference similarity penalty`, `mobile readability ${round(mobileReadability)}/100`, `${patterns.length} observed reference pattern(s) used structurally`] };
  }).sort((a, b) => b.overallScore - a.overallScore);
}

export type ThumbnailConcept = {
  id: string;
  visualFormula: string;
  referencePatterns: string[];
  subject: string;
  subjectScale: 'SMALL' | 'MEDIUM' | 'LARGE';
  background: string;
  foreground: string;
  composition: string;
  camera: string;
  lighting: string;
  palette: string[];
  contrast: number;
  text?: string;
  textPosition?: string;
  mobileReadability: number;
  curiosityDevice: string;
  visualTension: number;
  titleInteraction: string;
  imagePrompt: string;
  estimatedCostUsd: number;
};

const thumbnailFormulas = [
  ['ONE_DOMINANT_SUBJECT', 'one oversized subject against a contextual world', 'scale contrast'],
  ['CONTRADICTION_SPLIT', 'before/after split with one visible mismatch', 'contradiction'],
  ['MAP_AND_MARKER', 'simple map, one route and one high-tension marker', 'geographic uncertainty'],
  ['OBJECT_AND_SHADOW', 'recognisable object with an ominous cast shadow', 'hidden threat'],
  ['BEFORE_AFTER', 'clean transformation from stable to broken state', 'consequence'],
  ['CLOSE_CROP_CONTEXT', 'tight crop on the decisive object with sparse context', 'information withheld'],
] as const;

export function generateThumbnailConcepts(input: { topic: string; title?: string; referencePack?: ReferencePack; patterns?: PatternCluster[]; dna?: ContentDNA; count?: number }): ThumbnailConcept[] {
  const count = Math.max(6, input.count ?? 6);
  const refPatterns = unique([...(input.patterns?.slice(0, 3).map((pattern) => pattern.name) ?? []), ...(input.referencePack?.items.slice(0, 3).map((item) => item.role) ?? [])]);
  return Array.from({ length: count }, (_, index) => {
    const [formula, composition, device] = thumbnailFormulas[index % thumbnailFormulas.length]!;
    const text = index % 3 === 0 ? undefined : index % 3 === 1 ? 'THE REAL COST' : 'TOO LATE';
    const contrast = 84 + (index % 4) * 3;
    return { id: `thumbnail-${String(index + 1).padStart(2, '0')}`, visualFormula: formula, referencePatterns: refPatterns, subject: `${input.topic} represented by one concrete central object`, subjectScale: index % 3 === 0 ? 'LARGE' : 'MEDIUM', background: 'minimal contextual environment with depth and negative space', foreground: 'single sharp focal subject separated from background', composition, camera: index % 2 ? '50mm editorial close perspective' : 'slightly wide documentary perspective', lighting: index % 2 ? 'hard rim light with controlled shadow' : 'high-key subject against darker context', palette: index % 2 ? ['deep navy', 'warm amber', 'white'] : ['charcoal', 'red accent', 'cool grey'], contrast, text, textPosition: text ? 'upper-left safe area' : undefined, mobileReadability: 86 - (text ? 4 : 0), curiosityDevice: device, visualTension: 78 + (index % 5) * 4, titleInteraction: `Title supplies context; thumbnail withholds the ${device} so the pair is complementary, not redundant.`, imagePrompt: `Original YouTube thumbnail, ${composition}. Topic: ${input.topic}. ${input.dna?.thumbnailDNA.notes ?? 'No copied asset or logo.'} One dominant focal point, high mobile readability, no readable text rendered by the image model, no watermark.`, estimatedCostUsd: 0.04 };
  });
}

export type PackagingCandidate = {
  id: string;
  titleId: string;
  thumbnailId: string;
  title: string;
  thumbnail: ThumbnailConcept;
  curiosityGap: number;
  informationOverlap: number;
  complementarity: number;
  clarity: number;
  mobileStrength: number;
  expectationAccuracy: number;
  clickabilityProxy: number;
  referenceEvidence: string[];
  overallScore: number;
};

export function rankPackagingCandidates(input: { titles: TitleCandidate[]; thumbnails: ThumbnailConcept[]; topTitles?: number; topThumbnails?: number; limit?: number }): PackagingCandidate[] {
  const titles = [...input.titles].sort((a, b) => b.overallScore - a.overallScore).slice(0, input.topTitles ?? 5);
  const thumbnails = input.thumbnails.slice(0, input.topThumbnails ?? 6);
  return titles.flatMap((title) => thumbnails.map((thumbnail) => {
    const overlap = lexicalOverlap(title.text, `${thumbnail.subject} ${thumbnail.visualFormula} ${thumbnail.text ?? ''}`);
    const complementarity = clamp(100 - overlap * 100 + (thumbnail.titleInteraction.includes('complementary') ? 12 : 0));
    const curiosityGap = clamp((title.curiosity + thumbnail.visualTension) / 2);
    const clarity = clamp((title.clarity + thumbnail.mobileReadability) / 2);
    const mobileStrength = clamp((title.mobileReadability + thumbnail.mobileReadability) / 2);
    const expectationAccuracy = clamp((title.clarity + title.specificity + complementarity) / 3);
    const clickabilityProxy = clamp(curiosityGap * 0.45 + complementarity * 0.25 + mobileStrength * 0.2 + title.novelty * 0.1);
    return { id: `packaging-${title.id}-${thumbnail.id}`, titleId: title.id, thumbnailId: thumbnail.id, title: title.text, thumbnail, curiosityGap: round(curiosityGap), informationOverlap: round(overlap * 100), complementarity: round(complementarity), clarity: round(clarity), mobileStrength: round(mobileStrength), expectationAccuracy: round(expectationAccuracy), clickabilityProxy: round(clickabilityProxy), referenceEvidence: unique([...title.references, ...title.referencePatterns, ...thumbnail.referencePatterns]), overallScore: round(clickabilityProxy * 0.35 + expectationAccuracy * 0.25 + title.overallScore * 0.25 + complementarity * 0.15) };
  })).sort((a, b) => b.overallScore - a.overallScore).slice(0, input.limit ?? 12);
}

export type OriginalityReport = {
  status: 'PASS' | 'WARN' | 'FAIL';
  titleSimilarity: number;
  hookSimilarity: number;
  phraseOverlap: number;
  semanticScriptSimilarity: number;
  structuralSimilarity: number;
  thumbnailConceptSimilarity: number;
  assetProvenance: 'CLEARED' | 'VERIFY' | 'BLOCKED';
  reasons: string[];
  thresholds: { warn: number; fail: number };
};

function phraseOverlap(left: string, right: string): number {
  const grams = (value: string) => { const tokens = words(value); return new Set(tokens.slice(0, -2).map((_, index) => tokens.slice(index, index + 3).join(' '))); };
  const a = grams(left); const b = grams(right);
  return a.size ? [...a].filter((gram) => b.has(gram)).length / a.size : 0;
}

export function checkOriginality(input: { title: string; referenceTitles?: string[]; hook?: string; referenceHooks?: string[]; script?: string; referenceScripts?: string[]; structure?: string[]; referenceStructures?: string[][]; thumbnailConcept?: string; referenceThumbnailConcepts?: string[]; assetProvenance?: OriginalityReport['assetProvenance']; warnThreshold?: number; failThreshold?: number }): OriginalityReport {
  const warn = input.warnThreshold ?? 0.45; const fail = input.failThreshold ?? 0.72;
  const titleSimilarity = Math.max(0, ...(input.referenceTitles ?? []).map((reference) => reference.trim().toLowerCase() === input.title.trim().toLowerCase() ? 1 : topicSimilarity(input.title, reference) / 100));
  const hookSimilarity = Math.max(0, ...(input.referenceHooks ?? []).map((reference) => lexicalOverlap(input.hook ?? '', reference)));
  const phrase = Math.max(0, ...(input.referenceScripts ?? []).map((reference) => phraseOverlap(input.script ?? '', reference)));
  const semantic = Math.max(0, ...(input.referenceScripts ?? []).map((reference) => lexicalOverlap(input.script ?? '', reference)));
  const structure = Math.max(0, ...(input.referenceStructures ?? []).map((reference) => { const a = new Set(input.structure ?? []); const b = new Set(reference); return a.size ? [...a].filter((item) => b.has(item)).length / a.size : 0; }));
  const thumbnail = Math.max(0, ...(input.referenceThumbnailConcepts ?? []).map((reference) => lexicalOverlap(input.thumbnailConcept ?? '', reference)));
  const reasons: string[] = [];
  if (titleSimilarity >= fail) reasons.push('title is too close to a reference'); else if (titleSimilarity >= warn) reasons.push('title shares unusually much wording with a reference');
  if (phrase >= fail) reasons.push('distinctive three-word phrase overlap is too high'); else if (phrase >= warn) reasons.push('script phrase overlap requires editorial review');
  if (thumbnail >= fail) reasons.push('thumbnail concept is materially too close to a reference'); else if (thumbnail >= warn) reasons.push('thumbnail concept should be differentiated further');
  if (input.assetProvenance === 'BLOCKED') reasons.push('asset provenance is blocked'); else if (input.assetProvenance === 'VERIFY') reasons.push('asset provenance still requires verification');
  const status = input.assetProvenance === 'BLOCKED' || titleSimilarity >= fail || phrase >= fail || thumbnail >= fail || semantic >= 0.9 ? 'FAIL' : titleSimilarity >= warn || hookSimilarity >= warn || phrase >= warn || semantic >= warn || structure >= 0.85 || thumbnail >= warn || input.assetProvenance === 'VERIFY' ? 'WARN' : 'PASS';
  if (!reasons.length) reasons.push('shared structural formula is allowed; no literal expression overlap detected');
  return { status, titleSimilarity: round(titleSimilarity), hookSimilarity: round(hookSimilarity), phraseOverlap: round(phrase), semanticScriptSimilarity: round(semantic), structuralSimilarity: round(structure), thumbnailConceptSimilarity: round(thumbnail), assetProvenance: input.assetProvenance ?? 'CLEARED', reasons, thresholds: { warn, fail } };
}
