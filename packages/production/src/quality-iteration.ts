import type { ProviderRoute, ProviderRouter } from '@auto-ytb/providers';

export type SceneImportance = 'HERO' | 'IMPORTANT' | 'SUPPORT' | 'UTILITY';
export type VisualStrategy = 'AI_VIDEO' | 'AI_IMAGE_MOTION' | 'AI_IMAGE' | 'PROGRAMMATIC_GRAPHIC' | 'MAP' | 'CHART' | 'KINETIC_TEXT' | 'LICENSED_STOCK' | 'LOCAL_ASSET';
export type SceneImportanceScore = { sceneId: string; score: number; class: SceneImportance; factors: Record<string, number> };
export type SceneRequirement = { sceneId: string; capability: 'VIDEO' | 'IMAGE'; durationSeconds: number; resolution: string; aspectRatio: string; referenceImages?: string[]; characterConsistency?: boolean; qualityTarget: number; budgetRemainingUsd: number };
export type VisualStrategyPlan = { sceneId: string; importance: SceneImportanceScore; preferredStrategy: VisualStrategy; fallback1: VisualStrategy; fallback2: VisualStrategy; selectedProvider?: string; reason: string; estimatedCostUsd: number };

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

export function scoreSceneImportance(input: { sceneId: string; purpose?: string; visualValue?: number; screenTimeSeconds?: number; needsMotion?: boolean; hookRelevance?: number; payoffRelevance?: number; complexity?: number }): SceneImportanceScore {
  const factors = { hookRelevance: input.hookRelevance ?? (/hook/i.test(input.purpose ?? '') ? 100 : 20), payoffRelevance: input.payoffRelevance ?? (/reveal|payoff/i.test(input.purpose ?? '') ? 90 : 30), visualValue: input.visualValue ?? 50, screenTime: Math.min(100, (input.screenTimeSeconds ?? 5) * 8), complexity: input.complexity ?? 40, motionNeed: input.needsMotion ? 80 : 25 };
  const score = clamp(factors.hookRelevance * .24 + factors.payoffRelevance * .24 + factors.visualValue * .2 + factors.screenTime * .1 + factors.complexity * .1 + factors.motionNeed * .12);
  const className: SceneImportance = score >= 68 ? 'HERO' : score >= 58 ? 'IMPORTANT' : score >= 35 ? 'SUPPORT' : 'UTILITY';
  return { sceneId: input.sceneId, score, class: className, factors };
}

export class VisualStrategyPlanner {
  constructor(private readonly router: ProviderRouter) {}
  plan(input: { sceneId: string; importance: SceneImportanceScore; durationSeconds: number; aspectRatio: string; qualityTarget?: number; budgetRemainingUsd: number; referenceImages?: string[]; narrativeValue?: number; requiresMap?: boolean; requiresChart?: boolean; needsMotion?: boolean }): VisualStrategyPlan {
    const hero = input.importance.class === 'HERO';
    const videoCandidate = this.router.route({ capability: 'VIDEO', durationSeconds: input.durationSeconds, aspectRatio: input.aspectRatio, qualityTarget: input.qualityTarget ?? 80, budgetRemainingUsd: input.budgetRemainingUsd });
    const imageCandidate = this.router.route({ capability: 'IMAGE', aspectRatio: input.aspectRatio, qualityTarget: input.qualityTarget ?? 75, budgetRemainingUsd: input.budgetRemainingUsd });
    const video = videoCandidate?.credentialStatus === 'FIXTURE' ? undefined : videoCandidate;
    const image = imageCandidate?.credentialStatus === 'FIXTURE' ? undefined : imageCandidate;
    if (input.requiresMap) return { sceneId: input.sceneId, importance: input.importance, preferredStrategy: 'MAP', fallback1: 'PROGRAMMATIC_GRAPHIC', fallback2: 'KINETIC_TEXT', selectedProvider: 'ffmpeg-local', reason: 'Map intent is clearer and cheaper as a deterministic asset.', estimatedCostUsd: 0 };
    if (input.requiresChart) return { sceneId: input.sceneId, importance: input.importance, preferredStrategy: 'CHART', fallback1: 'PROGRAMMATIC_GRAPHIC', fallback2: 'KINETIC_TEXT', selectedProvider: 'ffmpeg-local', reason: 'Quantitative evidence is rendered programmatically.', estimatedCostUsd: 0 };
    if (hero && input.needsMotion && video) return { sceneId: input.sceneId, importance: input.importance, preferredStrategy: 'AI_VIDEO', fallback1: 'AI_IMAGE_MOTION', fallback2: 'PROGRAMMATIC_GRAPHIC', selectedProvider: video.provider, reason: 'Hero motion beat earns the available video capability.', estimatedCostUsd: video.estimatedUnitCostUsd };
    if (image && (hero || input.narrativeValue == null || input.narrativeValue >= 55)) return { sceneId: input.sceneId, importance: input.importance, preferredStrategy: 'AI_IMAGE_MOTION', fallback1: 'AI_IMAGE', fallback2: 'PROGRAMMATIC_GRAPHIC', selectedProvider: image.provider, reason: 'Specific image plus local motion balances narrative relevance and cost.', estimatedCostUsd: image.estimatedUnitCostUsd };
    return { sceneId: input.sceneId, importance: input.importance, preferredStrategy: 'PROGRAMMATIC_GRAPHIC', fallback1: 'KINETIC_TEXT', fallback2: 'LOCAL_ASSET', selectedProvider: 'ffmpeg-local', reason: 'No verified external visual route is required for this supporting beat.', estimatedCostUsd: 0 };
  }
}

export type CompiledVisualPrompt = { provider: string; sections: Record<'SUBJECT' | 'ACTION' | 'SETTING' | 'COMPOSITION' | 'CAMERA' | 'LIGHTING' | 'STYLE' | 'CONTINUITY' | 'MOTION' | 'DURATION' | 'AVOID', string>; prompt: string };
export class VisualPromptCompiler {
  compile(input: { shotPlan: { instruction: string; kind?: string; durationSec?: number }; channelVisualBible?: Record<string, unknown>; seriesBible?: Record<string, unknown>; provider: ProviderRoute | { provider: string; model?: string }; durationSeconds?: number }): CompiledVisualPrompt {
    const instruction = input.shotPlan.instruction;
    const style = String(input.channelVisualBible?.imageStyle ?? input.channelVisualBible?.style ?? 'coherent editorial documentary');
    const continuity = input.seriesBible ? `Preserve canonical character/world constraints: ${JSON.stringify(input.seriesBible).slice(0, 500)}` : 'Maintain palette, typography and camera language from the channel bible.';
    const sections = { SUBJECT: instruction, ACTION: /motion|action|race|change|reveal/i.test(instruction) ? 'Show one observable state change.' : 'Use a readable stable subject.', SETTING: 'Relevant grounded environment; no invented interface text.', COMPOSITION: '16:9 editorial composition with clear focal point and safe text area.', CAMERA: 'Controlled documentary camera; motivated push, pan or parallax.', LIGHTING: 'Consistent restrained contrast and channel palette.', STYLE: style, CONTINUITY: continuity, MOTION: 'Natural motion only; no looping artifacts or impossible geometry.', DURATION: `${input.durationSeconds ?? input.shotPlan.durationSec ?? 5} seconds.`, AVOID: 'No copied assets, logos, watermarks, gibberish, unintended captions, extra limbs or generic stock montage.' };
    const prompt = Object.entries(sections).map(([key, value]) => `${key}: ${value}`).join('\n');
    return { provider: input.provider.provider, sections, prompt: input.provider.provider === 'gemini' ? `${prompt}\nMODEL NOTE: prioritize concise grounded motion and preserve reference images.` : prompt };
  }
}

export type SemanticSceneReport = { sceneId: string; expectedMeaning: string; observedMeaning?: string; relevanceScore?: number; continuityScore?: number; artifactQualityScore?: number; issues: string[]; decision: 'KEEP' | 'REPAIR' | 'REGENERATE' | 'REPLACE_WITH_FALLBACK'; evaluationStatus: 'EVALUATED' | 'NOT_EVALUATED'; };
export type VisualConsistencyReport = { status: 'PASS' | 'WARN' | 'FAIL' | 'NOT_EVALUATED'; checkedScenes: number; styleDrift: string[]; characterDrift: string[]; paletteDrift: string[]; resolutionMismatch: string[]; repeatedComposition: string[]; issues: string[] };
export type RevisionDecision = { sceneId: string; decision: 'KEEP' | 'REGENERATE' | 'USE_FALLBACK' | 'BLOCK'; reason: string; expectedImprovement: number; estimatedCostUsd: number };
export function decideRevision(input: { report: SemanticSceneReport; importance: SceneImportance; remainingBudgetUsd: number; fallbackAvailable: boolean; currentCostUsd: number }): RevisionDecision {
  if (input.report.evaluationStatus !== 'EVALUATED') return { sceneId: input.report.sceneId, decision: 'KEEP', reason: 'Semantic evaluator unavailable; preserve asset and mark NOT_EVALUATED.', expectedImprovement: 0, estimatedCostUsd: 0 };
  const relevance = input.report.relevanceScore ?? 0;
  const hero = input.importance === 'HERO' || input.importance === 'IMPORTANT';
  if (relevance >= (hero ? 78 : 62)) return { sceneId: input.report.sceneId, decision: 'KEEP', reason: 'Observed relevance is within the importance-adjusted threshold.', expectedImprovement: 0, estimatedCostUsd: 0 };
  if (input.fallbackAvailable && (!hero || input.remainingBudgetUsd < .2)) return { sceneId: input.report.sceneId, decision: 'USE_FALLBACK', reason: 'Fallback has better cost-adjusted expected improvement than another paid generation.', expectedImprovement: 22, estimatedCostUsd: 0 };
  if (input.remainingBudgetUsd <= 0) return { sceneId: input.report.sceneId, decision: 'BLOCK', reason: 'Revision reserve is exhausted.', expectedImprovement: 0, estimatedCostUsd: 0 };
  return { sceneId: input.report.sceneId, decision: 'REGENERATE', reason: `${input.importance} scene is below its semantic relevance threshold.`, expectedImprovement: 35, estimatedCostUsd: Math.min(input.remainingBudgetUsd, .4) };
}

export type VoiceQualityReport = { status: 'PASS' | 'WARN' | 'FAIL' | 'NOT_EVALUATED'; provider: string; durationSeconds: number; pronunciation: 'NOT_EVALUATED' | 'PASS' | 'WARN'; naturalness: 'NOT_EVALUATED' | 'PASS' | 'WARN'; pace: 'NOT_EVALUATED' | 'PASS' | 'WARN'; pauses: 'NOT_EVALUATED' | 'PASS' | 'WARN'; issues: string[] };
export function buildVoiceQualityReport(input: { provider: string; durationSeconds: number; evaluatorAvailable?: boolean; issues?: string[] }): VoiceQualityReport { const evaluated = Boolean(input.evaluatorAvailable); return { status: evaluated ? (input.issues?.length ? 'WARN' : 'PASS') : 'NOT_EVALUATED', provider: input.provider, durationSeconds: input.durationSeconds, pronunciation: evaluated ? 'PASS' : 'NOT_EVALUATED', naturalness: evaluated ? 'PASS' : 'NOT_EVALUATED', pace: evaluated ? 'PASS' : 'NOT_EVALUATED', pauses: evaluated ? 'PASS' : 'NOT_EVALUATED', issues: input.issues ?? [] }; }
