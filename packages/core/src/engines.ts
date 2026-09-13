import type { BenchmarkFormat, BenchmarkVideo } from './benchmark.js';
import type { ContentDNA } from './content-dna.js';
import type { EvidenceBackedOpportunity } from './opportunity-engine.js';
import type { PatternCluster } from './pattern-mining.js';
import type { ReferencePack } from './reference-pack.js';
import type { ContentFormatProfile } from './format-profiles.js';
export type { ContentFormatProfile } from './format-profiles.js';

export const SEVEN_ENGINE_NAMES = [
  'NICHE_HUNTER',
  'HOOK_ENGINEER',
  'CLIP_RANKING_RESEARCHER',
  'RETENTION_DOCTOR',
  'VIRAL_DECONSTRUCTOR',
  'PRODUCTION_ENGINE',
  'SERIES_FACTORY',
] as const;
export type SevenEngineName = typeof SEVEN_ENGINE_NAMES[number];
export type EngineRegistry = Record<SevenEngineName, { status: 'READY'; responsibilities: string[] }>;

export function createSevenEngineRegistry(): EngineRegistry {
  return {
    NICHE_HUNTER: { status: 'READY', responsibilities: ['benchmark discovery', 'evidence-backed niche scoring', 'demand/competition/feasibility'] },
    HOOK_ENGINEER: { status: 'READY', responsibilities: ['15 audio + visual hook variants', '0–3s / 3–8s / 8–15s timing', 'retention proxy scoring'] },
    CLIP_RANKING_RESEARCHER: { status: 'READY', responsibilities: ['optional clip discovery', 'rights and license status', 'ranking evidence'] },
    RETENTION_DOCTOR: { status: 'READY', responsibilities: ['analytics-to-timeline diagnosis', 'prioritized intervention', 'test recommendation'] },
    VIRAL_DECONSTRUCTOR: { status: 'READY', responsibilities: ['abstract winning-video template', 'constants vs variables', 'originality boundary'] },
    PRODUCTION_ENGINE: { status: 'READY', responsibilities: ['shared format profiles', 'provider plan', 'estimated cost and budget gate'] },
    SERIES_FACTORY: { status: 'READY', responsibilities: ['causal-variable hypotheses', 'bounded expansion candidates', 'evidence/originality re-check'] },
  };
}

export type HookVariant = {
  id: string;
  spokenLine: string;
  onScreenVisual: string;
  shotDescription: string;
  cameraAction: string;
  textOverlay?: string;
  soundDesign: string;
  durationSeconds: number;
  curiosityDevice: string;
  emotion: string;
  promise: string;
  openLoop: string;
  referencePattern: string;
  estimatedGenerationCostUsd: number;
  scores: { clarity: number; novelty: number; curiosity: number; visualStrength: number; speedToValue: number; specificity: number; credibility: number; retentionProbabilityProxy: number };
  visualConcept: string;
  cameraMotion: string;
  sfx: string;
  musicState: 'DUCKED' | 'RISE' | 'SILENCE' | 'BED';
  durationWindow: '0-3S' | '3-8S' | '8-15S';
  estimatedCost: number;
};

const hookFrames = [
  ['CONTRADICTION', 'This looks like success. It was the warning sign.', 'contradiction', 'unease'],
  ['HIDDEN_CAUSE', 'The visible failure was not the real failure.', 'hidden cause', 'mystery'],
  ['SCALE', 'One decision moved millions—and almost nobody noticed.', 'scale reveal', 'awe'],
  ['QUESTION', 'Why did the obvious solution make everything worse?', 'open question', 'intrigue'],
  ['COUNTDOWN', 'The clock was already running when they found the problem.', 'time pressure', 'urgency'],
] as const;

export function engineerHooks(input: { topic: string; promise: string; dna?: ContentDNA; count?: number }): HookVariant[] {
  const count = Math.max(15, input.count ?? 15);
  const patterns = input.dna?.titleDNA.grammarPattern ?? 'REFERENCE_WINNER_PATTERN';
  return Array.from({ length: count }, (_, index) => {
    const [kind, line, device, emotion] = hookFrames[index % hookFrames.length]!;
    const duration = index % 3 === 0 ? 3 : index % 3 === 1 ? 7 : 13;
    const durationWindow: HookVariant['durationWindow'] = duration <= 3 ? '0-3S' : duration <= 8 ? '3-8S' : '8-15S';
    const visual = `${input.topic} represented with one dominant subject, contextual background and a visible change at ${duration}s`;
    const base = 68 + (index % 5) * 3;
    const musicState: HookVariant['musicState'] = index % 3 === 0 ? 'DUCKED' : index % 3 === 1 ? 'BED' : 'SILENCE';
    return {
      id: `hook-${String(index + 1).padStart(2, '0')}`,
      spokenLine: `${line} ${input.topic}.`,
      onScreenVisual: visual,
      shotDescription: `Open on the consequence, then reveal only enough context to make the question concrete: ${input.topic}.`,
      cameraAction: index % 2 ? 'slow push-in with motivated cut at the reveal' : 'hard cut from wide context to close subject',
      textOverlay: index % 4 === 0 ? kind.replaceAll('_', ' ') : undefined,
      soundDesign: index % 3 === 0 ? 'single impact + restrained low bed' : 'short riser, then ducked ambience',
      visualConcept: visual,
      cameraMotion: index % 2 ? 'slow push-in with motivated cut at the reveal' : 'hard cut from wide context to close subject',
      sfx: index % 3 === 0 ? 'single restrained impact' : 'short riser',
      musicState,
      durationWindow,
      estimatedCost: index % 3 === 0 ? 0.01 : index % 3 === 1 ? 0.02 : 0.04,
      durationSeconds: duration,
      curiosityDevice: device,
      emotion,
      promise: input.promise,
      openLoop: `what actually caused ${input.topic}`,
      referencePattern: patterns,
      estimatedGenerationCostUsd: duration <= 3 ? 0.01 : duration <= 7 ? 0.02 : 0.04,
      scores: { clarity: Math.min(96, base + 4), novelty: Math.min(94, base + (index % 4)), curiosity: Math.min(98, base + 8), visualStrength: Math.min(95, base + 5), speedToValue: duration <= 3 ? 94 : duration <= 7 ? 84 : 72, specificity: 72 + (index % 6) * 3, credibility: 76, retentionProbabilityProxy: Math.round((base + 6) * 10) / 10 },
    };
  }).sort((a, b) => b.scores.retentionProbabilityProxy - a.scores.retentionProbabilityProxy);
}

export type ClipCandidate = {
  sourcePlatform: string;
  sourceId: string;
  sourceUrl: string;
  creator?: string;
  publishedAt?: string;
  candidateStart: number;
  candidateEnd: number;
  description: string;
  whyRelevant: string;
  verificationStatus: 'VERIFIED' | 'PLAUSIBLE' | 'UNVERIFIED';
  rightsStatus: 'CLEARED' | 'VERIFY' | 'BLOCKED';
  downloadUseAllowed: boolean;
  attributionRequired: boolean;
  timestamp?: string;
  candidateMoment?: string;
  verification?: 'VERIFIED' | 'PLAUSIBLE' | 'UNVERIFIED';
  usageAllowed?: boolean;
  attributionRequirement?: string;
  quality: number;
  rankingPosition?: number;
};

export type ClipResearchPack = { version: 1; format: 'CLIP_BASED' | 'RANKING'; candidates: ClipCandidate[]; limitations: string[] };

export function rankClipCandidates(candidates: ClipCandidate[]): ClipResearchPack {
  const ranked = candidates.map((candidate) => ({ ...candidate, quality: Math.max(0, Math.min(100, candidate.quality)), verification: candidate.verification ?? candidate.verificationStatus, usageAllowed: candidate.usageAllowed ?? (candidate.rightsStatus === 'CLEARED' && candidate.downloadUseAllowed), attributionRequirement: candidate.attributionRequirement ?? (candidate.attributionRequired ? 'credit creator/source before public use' : undefined), downloadUseAllowed: candidate.rightsStatus === 'CLEARED' && candidate.downloadUseAllowed })).sort((a, b) => Number(b.rightsStatus === 'CLEARED') - Number(a.rightsStatus === 'CLEARED') || b.quality - a.quality).map((candidate, index) => ({ ...candidate, rankingPosition: index + 1 }));
  return { version: 1, format: 'CLIP_BASED', candidates: ranked, limitations: ranked.some((candidate) => candidate.rightsStatus !== 'CLEARED') ? ['Uncleared clips are discovery/research signals only and must not enter production automatically.'] : [] };
}

export type RetentionDiagnosis = { whatHappened: string; where: string; likelyWhy: string; confidence: number; whatToChangeFirst: string; expectedImpact: string; howToTestIt: string; problem: 'PACKAGING' | 'HOOK' | 'EXPECTATION_MISMATCH' | 'SLOW_SETUP' | 'CONFUSION' | 'LOW_INFORMATION_DENSITY' | 'VISUAL_FATIGUE' | 'REPETITION' | 'WEAK_PAYOFF' | 'BAD_TRANSITION' | 'CTA_TOO_EARLY' | 'TOPIC_EXHAUSTION' | 'OTHER'; };

export function diagnoseRetention(input: { durationSeconds: number; points: Array<{ elapsedRatio: number; audienceWatchRatio: number }>; beats?: Array<{ id: string; startSec: number; targetDurationSec: number; purpose: string }>; scenes?: Array<{ id: string; startSec: number; durationSec: number; kind: string }> }): RetentionDiagnosis {
  const sorted = [...input.points].sort((a, b) => a.elapsedRatio - b.elapsedRatio);
  let worst = { delta: 0, at: 0 };
  for (let i = 1; i < sorted.length; i += 1) { const delta = sorted[i]!.audienceWatchRatio - sorted[i - 1]!.audienceWatchRatio; if (delta < worst.delta) worst = { delta, at: sorted[i]!.elapsedRatio }; }
  const beat = input.beats?.find((item) => worst.at * input.durationSeconds >= item.startSec && worst.at * input.durationSeconds <= item.startSec + item.targetDurationSec);
  const at = `${Math.round(worst.at * input.durationSeconds)}s (${Math.round(worst.at * 100)}%)`;
  const early = worst.at <= 0.15;
  return { whatHappened: sorted.length && worst.delta < -0.05 ? `Retention drops ${Math.round(Math.abs(worst.delta) * 100)} percentage points.` : 'No material retention drop was detected in the supplied curve.', where: at, likelyWhy: early ? 'The opening may not deliver the packaging promise quickly enough.' : beat?.purpose === 'setup' ? 'Setup likely runs longer than the audience will tolerate before a payoff.' : 'The local beat or visual may not communicate the promised progression.', confidence: sorted.length >= 5 ? 72 : 42, whatToChangeFirst: early ? 'Rewrite the first 15 seconds and test a clearer audio + visual promise.' : `Audit ${beat?.id ?? 'the segment at ' + at} before changing the rest of the edit.`, expectedImpact: 'Recover the largest observed local loss without changing unrelated variables.', howToTestIt: 'Run one controlled packaging/hook variant while keeping topic, duration and later beats fixed.', problem: early ? 'HOOK' : beat?.purpose === 'setup' ? 'SLOW_SETUP' : 'OTHER' };
}

export type ViralTemplate = { topicArchetype: string; audiencePromise: string; constants: string[]; variables: string[]; titleGrammar: string; thumbnailGrammar: string; hookMechanics: string[]; storyArchitecture: string[]; storyStructure: string[]; pacingProfile: string; pacing: string; retentionDevices: string[]; escalation: string; payoffPositions: string[]; visualCadence: string; editingGrammar: string; audioGrammar: string; ctaPlacement: string; durationProfile: string; originalityGuard: string[]; sourceEvidence: Array<{ videoId: string; signal: string; contentRemoved: boolean }>; confidence: number };

export function deconstructWinningVideo(video: BenchmarkVideo, dna?: ContentDNA): ViralTemplate {
  const storyArchitecture = ['contradiction or consequence', 'context', 'evidence escalation', 'false explanation', 'causal reveal', 'consequence/payoff'];
  const pacingProfile = video.durationSeconds > 600 ? 'long-form escalation with regular micro-payoffs' : 'compressed progression with short payoff interval';
  const confidence = Math.round((dna?.scriptDNA.availability === 'TRANSCRIPT' ? 78 : 58) + (dna?.thumbnailDNA.availability === 'VISION' ? 8 : 0));
  return { topicArchetype: dna?.topicDNA.topics[0] ?? video.topic ?? 'evidence-led change', audiencePromise: dna?.topicDNA.audiencePromise ?? 'understand the hidden mechanism and its consequence', constants: ['evidence-led premise', 'visible escalation', 'clear payoff', 'one dominant packaging promise'], variables: ['entity', 'country/market', 'time period', 'specific conflict', 'visual subject', 'supporting evidence'], titleGrammar: dna?.titleDNA.grammarPattern ?? 'UNKNOWN_UNTIL_TITLE_ANALYSIS', thumbnailGrammar: dna?.thumbnailDNA.compositionType ?? 'STRUCTURED_COMPOSITION_REQUIRED', hookMechanics: ['state consequence early', 'withhold the causal explanation', 'show a concrete visual change'], storyArchitecture, storyStructure: storyArchitecture, pacingProfile, pacing: pacingProfile, retentionDevices: ['open loop', 'micro-payoff before exposition', 'pattern interrupt at escalation', 'reveal after competing explanation'], escalation: 'increase stakes through evidence, not adjectives', payoffPositions: ['first meaningful payoff in opening quarter', 'largest reveal near final third'], visualCadence: 'change visual mode when the narrative function changes', editingGrammar: 'motivated cuts; no keyword slideshow', audioGrammar: 'ducked music, selective SFX, intentional silence before reveals', ctaPlacement: 'after the final payoff', durationProfile: `${Math.round(video.durationSeconds / 60)} minute profile`, originalityGuard: ['never reuse scripts, phrases, assets or exact thumbnail composition', 'combine multiple references and replace all concrete entities'], sourceEvidence: [{ videoId: video.id, signal: `${video.likelyOutlier.score}/100 outlier evidence`, contentRemoved: true }], confidence: Math.min(95, confidence) };
}

export type ProductionEnginePlan = { profile: ContentFormatProfile; stages: string[]; providerRequirements: string[]; estimatedCostUsd: number; allowed: boolean; reasons: string[] };

export function planProductionEngine(input: { format: ContentFormatProfile; estimatedCostUsd: number; budgetUsd?: number; requiresResearch?: boolean }): ProductionEnginePlan {
  const allowed = input.budgetUsd == null || input.estimatedCostUsd <= input.budgetUsd;
  return { profile: input.format, stages: ['research', 'story architecture', 'draft assets', 'voice/timeline', 'visual plan', 'final render', 'quality gates'], providerRequirements: input.requiresResearch ? ['search', 'text', 'tts', 'render'] : ['text', 'tts', 'render'], estimatedCostUsd: input.estimatedCostUsd, allowed, reasons: allowed ? ['batch budget check passed'] : ['estimated cost exceeds budget; use reuse, cheaper provider or draft-only mode before final generation'] };
}

export type ProviderCapability = { id: string; capability: string; qualityScore: number; estimatedCostUsd: number; latencyScore: number; reliabilityScore: number; enabled: boolean; credentialsConfigured: boolean };
export function routeProvider(candidates: ProviderCapability[], preference: 'QUALITY' | 'COST' | 'BALANCED' = 'BALANCED'): ProviderCapability | null {
  const available = candidates.filter((candidate) => candidate.enabled && candidate.credentialsConfigured);
  return [...available].sort((a, b) => { const score = (item: ProviderCapability) => preference === 'QUALITY' ? item.qualityScore * 0.6 + item.reliabilityScore * 0.4 : preference === 'COST' ? 100 - item.estimatedCostUsd * 10 + item.reliabilityScore * 0.2 : item.qualityScore * 0.4 + item.reliabilityScore * 0.3 + item.latencyScore * 0.15 + (100 - item.estimatedCostUsd * 10) * 0.15; return score(b) - score(a); })[0] ?? null;
}

export type SeriesExpansionCandidate = { id: string; premise: string; variation: string; winningVariables: Array<{ name: string; status: 'LIKELY_CAUSAL' | 'CORRELATED' | 'UNKNOWN' }>; checks: string[]; autoProduce: false };
export function generateSeriesExpansion(input: { topic: string; winningVideo: BenchmarkVideo; dna?: ContentDNA; referencePack?: ReferencePack; patterns?: PatternCluster[]; maxCandidates?: number }): SeriesExpansionCandidate[] {
  const variations = ['new entity', 'new country', 'opposite case', 'bigger example', 'smaller hidden example', 'new era', 'prequel', 'sequel'];
  return variations.slice(0, Math.min(input.maxCandidates ?? 30, 30)).map((variation, index) => ({ id: `series-expansion-${index + 1}`, premise: `${input.topic}: ${variation}`, variation, winningVariables: [{ name: 'topic mechanism', status: 'LIKELY_CAUSAL' }, { name: 'specific entity', status: 'CORRELATED' }, { name: 'exact packaging', status: 'UNKNOWN' }], checks: ['demand validation', 'reference evidence', 'originality', 'packaging', 'cost', 'YPP authenticity'], autoProduce: false as const }));
}

export type NicheHunterResult = { niche: string; subniche?: string; demand: number; competition: number; saturation: number; monetization: number; productionFeasibility: number; facelessSuitability: number; formatCompatibility: number; trendEvergreenBalance: number; sourceEvidence: string[]; confidence: number };
export function huntNiche(input: { niche: string; videos: BenchmarkVideo[]; evidence?: string[]; monetization?: number; productionFeasibility?: number }): NicheHunterResult {
  const winners = input.videos.filter((video) => video.likelyOutlier.classification === 'BREAKOUT' || video.likelyOutlier.classification === 'EXTREME_OUTLIER');
  const channels = new Set(input.videos.map((video) => video.channelId)).size;
  return { niche: input.niche, demand: Math.min(100, winners.length * 12 + Math.min(55, input.videos.length * 2)), competition: Math.min(100, channels * 8), saturation: Math.min(100, channels * 6), monetization: input.monetization ?? 65, productionFeasibility: input.productionFeasibility ?? 72, facelessSuitability: 78, formatCompatibility: 82, trendEvergreenBalance: 68, sourceEvidence: input.evidence ?? winners.slice(0, 7).map((video) => video.id), confidence: Math.min(100, (input.videos.length / 30) * 50 + (channels / 8) * 50) };
}
