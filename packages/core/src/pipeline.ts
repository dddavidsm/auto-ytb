import type { BenchmarkFormat } from './benchmark.js';
import type { EvidenceBackedOpportunity } from './opportunity-engine.js';
import type { OriginalityReport, PackagingCandidate, ThumbnailConcept, TitleCandidate } from './labs.js';
import type { ReferencePack } from './reference-pack.js';

export type DataMode = 'REAL' | 'FIXTURE' | 'HYBRID';
export type ProviderState = 'NOT_CONFIGURED' | 'NO_CREDENTIALS' | 'RATE_LIMITED' | 'PROVIDER_ERROR' | 'LIVE' | 'FIXTURE';

export function resolveDataMode(input: { requested?: DataMode; liveAvailable: boolean; fixtureAvailable: boolean }): { mode: DataMode; state: ProviderState; note: string } {
  if (input.requested === 'REAL' && !input.liveAvailable) return { mode: input.fixtureAvailable ? 'HYBRID' : 'REAL', state: 'NO_CREDENTIALS', note: 'Real provider requested but credentials are unavailable; no live data is represented as real.' };
  if (input.requested === 'FIXTURE' || (!input.liveAvailable && input.fixtureAvailable)) return { mode: 'FIXTURE', state: 'FIXTURE', note: 'Deterministic fixture data; never presented as live market data.' };
  if (input.requested === 'HYBRID') return { mode: 'HYBRID', state: input.liveAvailable ? 'LIVE' : 'NO_CREDENTIALS', note: input.liveAvailable ? 'Live providers are used where configured; unconfigured providers use explicit fixtures.' : 'No live credentials; hybrid run is fixture-only and marked accordingly.' };
  return input.liveAvailable ? { mode: 'REAL', state: 'LIVE', note: 'Live provider data.' } : { mode: 'FIXTURE', state: 'NO_CREDENTIALS', note: 'No credentials; live execution was not attempted.' };
}

export type ResearchStatus = 'VERIFIED' | 'PLAUSIBLE' | 'UNVERIFIED' | 'CONFLICTED';
export type ResearchSource = { id: string; url: string; title: string; sourceType: 'REFERENCE' | 'PRIMARY' | 'OFFICIAL' | 'SECONDARY' | 'UNKNOWN'; publishedAt?: string; quality: number; note?: string };
export type ResearchClaim = { id: string; claim: string; sourceIds: string[]; importance: 'CRITICAL' | 'SUPPORTING'; confidence: number; verification: ResearchStatus; evidenceNote?: string };
export type ResearchPack = { version: 1; topic: string; referenceSourceIds: string[]; factSources: ResearchSource[]; claims: ResearchClaim[]; conflicts: string[]; criticalUnverified: string[]; confidence: number; limitations: string[] };

export function createResearchPack(input: { topic: string; referenceSources?: ResearchSource[]; factSources: ResearchSource[]; claims: Array<Omit<ResearchClaim, 'verification' | 'confidence'> & { confidence?: number; verification?: ResearchStatus }> }): ResearchPack {
  const allSources = [...(input.referenceSources ?? []), ...input.factSources];
  const sourceById = new Map(allSources.map((source) => [source.id, source]));
  const claims = input.claims.map((claim) => {
    const validSources = claim.sourceIds.filter((id) => sourceById.has(id));
    const hasFactSource = validSources.some((id) => sourceById.get(id)?.sourceType !== 'REFERENCE');
    const verification = claim.verification ?? (hasFactSource && (claim.confidence ?? 0) >= 75 ? 'VERIFIED' : validSources.length ? 'PLAUSIBLE' : 'UNVERIFIED');
    return { ...claim, sourceIds: validSources, confidence: Math.max(0, Math.min(100, claim.confidence ?? (verification === 'VERIFIED' ? 82 : verification === 'PLAUSIBLE' ? 58 : 15))), verification };
  });
  const criticalUnverified = claims.filter((claim) => claim.importance === 'CRITICAL' && claim.verification === 'UNVERIFIED').map((claim) => claim.id);
  const conflicts = claims.filter((claim) => claim.verification === 'CONFLICTED').map((claim) => claim.id);
  const confidence = claims.length ? claims.reduce((sum, claim) => sum + claim.confidence, 0) / claims.length : 0;
  return { version: 1, topic: input.topic, referenceSourceIds: (input.referenceSources ?? []).map((source) => source.id), factSources: input.factSources, claims, conflicts, criticalUnverified, confidence: Math.round(confidence * 10) / 10, limitations: input.factSources.length ? [] : ['No independent fact sources were supplied. Competitor videos remain references, not truth sources.'] };
}

export type StoryBeat = { id: string; targetStartSeconds: number; targetDurationSeconds: number; purpose: 'COLD_OPEN' | 'HOOK' | 'PROMISE' | 'SETUP' | 'ACT' | 'PAYOFF' | 'ESCALATION' | 'REVEAL' | 'ENDING' | 'CTA'; newInformation: string; tension: string; openLoop?: string; payoff?: string; narrationGoal: string; visualGoal: string; evidenceRefs: string[] };
export type StoryArchitecture = { version: 1; format: BenchmarkFormat | 'RANKING' | 'CHARACTER_SERIES'; targetDurationSeconds: number; beats: StoryBeat[]; adaptationNote: string };

export function buildStoryArchitecture(input: { format: BenchmarkFormat | 'RANKING' | 'CHARACTER_SERIES'; topic: string; promise: string; targetDurationSeconds: number; research: ResearchPack; referencePack?: ReferencePack }): StoryArchitecture {
  const duration = Math.max(20, input.targetDurationSeconds);
  const short = input.format === 'SHORTS';
  const serial = input.format === 'CHARACTER_SERIES';
  const steps: Array<[StoryBeat['purpose'], string, string]> = serial ? [['COLD_OPEN', 'character faces a concrete problem', 'establish the recurring world'], ['HOOK', 'the problem becomes emotionally specific', 'make the character goal visible'], ['ACT', 'character tries an imperfect solution', 'show cause and consequence'], ['ESCALATION', 'the solution creates a new complication', 'change the situation on screen'], ['PAYOFF', 'character makes a meaningful choice', 'resolve the episode question'], ['CTA', 'invite the next episode question', 'leave a continuity seed']] : input.format === 'RANKING' ? [['COLD_OPEN', 'show the highest-stakes result', 'establish ranking promise'], ['PROMISE', input.promise, 'define the scoring rule'], ['SETUP', 'explain the evidence and selection criteria', 'make comparison legible'], ['ACT', 'ranked item blocks with escalating stakes', 'give each item a distinct visual proof'], ['REVEAL', 'the top item changes the interpretation', 'pay off the ranking tension'], ['CTA', 'invite the next comparison', 'preserve audience agency']] : [['COLD_OPEN', `show the consequence of ${input.topic}`, 'create immediate tension'], ['HOOK', `state the surprising question behind ${input.topic}`, 'open a causal loop'], ['PROMISE', input.promise, 'set an accurate viewer contract'], ['SETUP', 'introduce only context required for the first payoff', 'orient without padding'], ['ACT', 'trace the evidence and competing explanations', 'build a causal chain'], ['ESCALATION', 'show why the stakes grow', 'increase tension through verified consequences'], ['REVEAL', 'answer the hidden-cause question', 'resolve the main open loop'], ['PAYOFF', 'connect the evidence to a durable insight', 'deliver the promised transformation'], ['ENDING', 'state what remains uncertain', 'leave an honest conclusion'], ['CTA', 'offer a related next question', 'delay CTA until after payoff']];
  const selected = short ? steps.filter(([purpose]) => !['SETUP', 'ENDING'].includes(purpose)) : steps;
  const stepDuration = duration / selected.length;
  const evidenceRefs = input.research.claims.filter((claim) => claim.verification !== 'UNVERIFIED').map((claim) => claim.id);
  return { version: 1, format: input.format, targetDurationSeconds: duration, adaptationNote: serial ? 'Character-led continuity replaces documentary exposition.' : input.format === 'RANKING' ? 'Ranking blocks must use the same evidence rule while escalating stakes.' : short ? 'Shorts compress setup and move the first payoff into the opening interval.' : 'Documentary/explainer structure uses evidence-backed escalation and an explicit uncertainty beat.', beats: selected.map(([purpose, information, visualGoal], index) => ({ id: `beat-${String(index + 1).padStart(2, '0')}`, targetStartSeconds: Math.round(index * stepDuration * 10) / 10, targetDurationSeconds: Math.round(stepDuration * 10) / 10, purpose, newInformation: information, tension: purpose === 'PAYOFF' || purpose === 'ENDING' ? 'resolve or qualify the open loop' : 'increase the unanswered question', openLoop: ['HOOK', 'PROMISE', 'ESCALATION'].includes(purpose) ? `what the evidence reveals about ${input.topic}` : undefined, payoff: ['REVEAL', 'PAYOFF'].includes(purpose) ? 'answer the central promise with sourced evidence' : undefined, narrationGoal: information, visualGoal, evidenceRefs })) };
}

export type ShotPlanItem = { id: string; beatId: string; startSeconds: number; durationSeconds: number; narrationRange: string; visualObjective: string; visualType: 'AI_VIDEO' | 'AI_IMAGE' | 'STOCK' | 'ARCHIVAL' | 'MAP' | 'CHART' | 'INFOGRAPHIC' | 'KINETIC_TEXT' | 'SCREEN' | 'CHARACTER' | 'DOCUMENT' | 'OTHER'; assetRequirement: string; providerCapability: string; generationPrompt: string; motion: string; transition: string; overlay?: string; sfx?: string; musicState: 'DUCKED' | 'RISE' | 'SILENCE' | 'BED'; estimatedCostUsd: number };
export type ShotPlan = { version: 1; scenes: ShotPlanItem[]; totalEstimatedCostUsd: number; rationale: string };

export function buildShotPlan(input: { architecture: StoryArchitecture; budgetUsd?: number; sourceBacked?: boolean }): ShotPlan {
  const scenes = input.architecture.beats.map((beat, index) => {
    const type: ShotPlanItem['visualType'] = beat.purpose === 'COLD_OPEN' || beat.purpose === 'REVEAL' ? 'AI_IMAGE' : beat.purpose === 'SETUP' ? 'INFOGRAPHIC' : beat.purpose === 'ACT' ? (input.sourceBacked ? 'DOCUMENT' : 'AI_IMAGE') : beat.purpose === 'ESCALATION' ? 'CHART' : beat.purpose === 'CTA' ? 'KINETIC_TEXT' : input.architecture.format === 'CHARACTER_SERIES' ? 'CHARACTER' : 'MAP';
    const cost = type === 'AI_IMAGE' ? 0.04 : 0.002;
    const musicState: ShotPlanItem['musicState'] = beat.purpose === 'REVEAL' ? 'SILENCE' : beat.purpose === 'ESCALATION' ? 'RISE' : 'DUCKED';
    return { id: `scene-${String(index + 1).padStart(2, '0')}`, beatId: beat.id, startSeconds: beat.targetStartSeconds, durationSeconds: beat.targetDurationSeconds, narrationRange: `${beat.targetStartSeconds.toFixed(1)}–${(beat.targetStartSeconds + beat.targetDurationSeconds).toFixed(1)}s`, visualObjective: beat.visualGoal, visualType: type, assetRequirement: type === 'DOCUMENT' ? 'cleared source-backed evidence or transformed source card' : 'original visual that demonstrates the beat purpose', providerCapability: type === 'AI_IMAGE' ? 'IMAGE + optional reference conditioning' : type === 'CHARACTER' ? 'IMAGE/VIDEO + character consistency' : type === 'DOCUMENT' ? 'SOURCE/PROCEDURAL' : 'PROCEDURAL/RENDER', generationPrompt: `Show the narrative objective, not a keyword collage: ${beat.visualGoal}. Context: ${beat.newInformation}.`, motion: type === 'KINETIC_TEXT' ? 'motivated text reveal' : 'restrained push or evidence-led transition', transition: index === 0 ? 'open' : 'motivated cut', overlay: beat.purpose === 'PROMISE' ? 'accurate viewer promise' : undefined, sfx: ['REVEAL', 'ESCALATION'].includes(beat.purpose) ? 'single restrained impact' : undefined, musicState, estimatedCostUsd: cost };
  });
  const total = scenes.reduce((sum, scene) => sum + scene.estimatedCostUsd, 0);
  return { version: 1, scenes, totalEstimatedCostUsd: Math.round(total * 100) / 100, rationale: 'Every scene has a narrative objective, visual category, provider capability and cost; no random keyword visual assignment.' };
}

export type QualityGateStatus = 'PASS' | 'WARN' | 'FAIL' | 'NOT_RUN';
export type QualityGate = { id: string; status: QualityGateStatus; message: string; critical: boolean };
export type BenchmarkQualityReport = { ready: boolean; gates: QualityGate[]; blockers: string[]; score: number };

export type ProductionReadinessReport = {
  preflight: QualityGate[];
  postGeneration: QualityGate[];
  readyForFinal: boolean;
  readyForRelease: boolean;
  blockers: string[];
  score: number;
};

export function evaluateProductionReadiness(input: {
  referencePack?: ReferencePack;
  research?: ResearchPack;
  originality?: OriginalityReport;
  hooks?: { length: number; pass?: boolean };
  packaging?: PackagingCandidate[];
  story?: StoryArchitecture;
  shotPlan?: ShotPlan;
  cost?: { allowed: boolean; estimatedCostUsd: number; budgetUsd?: number };
  providerPass?: boolean;
  seriesContinuityPass?: boolean;
  seriesRelevant?: boolean;
  sync?: boolean;
  audio?: boolean;
  visual?: boolean;
  copyright?: boolean;
  ypp?: boolean;
  render?: boolean;
}): ProductionReadinessReport {
  const gate = (id: string, condition: boolean | undefined, message: string, critical = true): QualityGate => ({ id, status: condition === undefined ? 'NOT_RUN' : condition ? 'PASS' : 'FAIL', message, critical });
  const preflight: QualityGate[] = [
    gate('REFERENCE_PASS', Boolean(input.referencePack && input.referencePack.items.length >= 3), 'Reference Pack contains at least 3 structural references.'),
    gate('RESEARCH_PASS', input.research ? input.research.criticalUnverified.length === 0 && input.research.conflicts.length === 0 : undefined, input.research ? 'Research Pack has no critical unverified or conflicting claims.' : 'Research Pack not run.'),
    gate('ORIGINALITY_PASS', input.originality ? input.originality.status !== 'FAIL' : undefined, input.originality ? `Originality ${input.originality.status}.` : 'Originality guard not run.'),
    gate('SCRIPT_PASS', Boolean(input.story?.beats.length), 'Story architecture exists.'),
    gate('HOOK_PASS', input.hooks ? input.hooks.length >= 15 && input.hooks.pass !== false : undefined, input.hooks ? `${input.hooks.length} hook variants available.` : 'Hook Engineer not run.'),
    gate('PACKAGING_PASS', Boolean(input.packaging?.length), 'Title, thumbnail and packaging candidates exist.'),
    gate('SHOT_PLAN_PASS', Boolean(input.shotPlan?.scenes.length), 'Shot Plan exists.'),
    gate('BUDGET_PASS', input.cost ? input.cost.allowed : undefined, input.cost ? `$${input.cost.estimatedCostUsd.toFixed(2)} estimated against budget.` : 'Budget check not run.'),
    gate('PROVIDER_PASS', input.providerPass, 'Every required production capability has a usable route.'),
    gate('SERIES_CONTINUITY_PASS', input.seriesRelevant ? input.seriesContinuityPass : true, input.seriesRelevant ? 'Series Bible continuity is valid.' : 'Not applicable to this format.'),
  ];
  const postGeneration: QualityGate[] = [
    gate('SYNC_PASS', input.sync, 'Narration, visuals, audio and captions are synchronized.'),
    gate('AUDIO_PASS', input.audio, 'Audio inspection passed.'),
    gate('VISUAL_PASS', input.visual, 'Visual inspection passed.'),
    gate('COPYRIGHT_PASS', input.copyright, 'Rights and provenance checks passed.'),
    gate('YPP_PASS', input.ypp, 'Authenticity and YPP checks passed.'),
    gate('RENDER_PASS', input.render, 'Final render inspection passed.'),
  ];
  const failed = (items: QualityGate[]) => items.filter((item) => item.critical && item.status !== 'PASS').map((item) => `${item.id}: ${item.message}`);
  const preflightBlockers = failed(preflight);
  const postBlockers = failed(postGeneration);
  const all = [...preflight, ...postGeneration];
  return { preflight, postGeneration, readyForFinal: preflightBlockers.length === 0, readyForRelease: preflightBlockers.length === 0 && postBlockers.length === 0, blockers: [...preflightBlockers, ...postBlockers], score: Math.round(all.reduce((sum, item) => sum + (item.status === 'PASS' ? 100 : item.status === 'WARN' ? 70 : 0), 0) / all.length) };
}

export function evaluateBenchmarkQualityGates(input: { referencePack?: ReferencePack; packaging?: PackagingCandidate[]; originality?: OriginalityReport; research?: ResearchPack; hooks?: { length: number; pass?: boolean }; story?: StoryArchitecture; shotPlan?: ShotPlan; cost?: { allowed: boolean; estimatedCostUsd: number; budgetUsd?: number }; sync?: boolean; audio?: boolean; copyright?: boolean; ypp?: boolean; render?: boolean }): BenchmarkQualityReport {
  const gate = (id: string, condition: boolean | undefined, message: string, critical = true): QualityGate => ({ id, status: condition === undefined ? 'NOT_RUN' : condition ? 'PASS' : 'FAIL', message, critical });
  const gates: QualityGate[] = [gate('REFERENCE_EVIDENCE_PASS', Boolean(input.referencePack && input.referencePack.items.length >= 3), 'Reference Pack contains at least 3 structural references.'), gate('PACKAGING_PASS', Boolean(input.packaging?.length), 'Packaging candidates exist.'), gate('ORIGINALITY_PASS', input.originality ? input.originality.status !== 'FAIL' : undefined, input.originality ? `Originality ${input.originality.status}.` : 'Originality guard not run.'), gate('FACT_CHECK_PASS', input.research ? input.research.criticalUnverified.length === 0 && input.research.conflicts.length === 0 : undefined, input.research ? `${input.research.criticalUnverified.length} critical claims unverified.` : 'Research Pack not run.'), gate('HOOK_PASS', input.hooks ? input.hooks.length >= 15 && input.hooks.pass !== false : undefined, input.hooks ? `${input.hooks.length} hook variants available.` : 'Hook Lab not run.'), gate('SCRIPT_PASS', Boolean(input.story?.beats.length), 'Story architecture exists.'), gate('VISUAL_PLAN_PASS', Boolean(input.shotPlan?.scenes.length), 'Shot Plan exists.'), gate('SYNC_PASS', input.sync, 'Narration-to-visual synchronization status.'), gate('AUDIO_PASS', input.audio, 'Audio plan status.'), gate('COPYRIGHT_PASS', input.copyright, 'Rights status.'), gate('YPP_PASS', input.ypp, 'Authenticity/YPP status.'), gate('COST_PASS', input.cost ? input.cost.allowed : undefined, input.cost ? `$${input.cost.estimatedCostUsd.toFixed(2)} estimated.` : 'Cost gate not run.'), gate('RENDER_PASS', input.render, 'Render inspection status.')];
  const blockers = gates.filter((item) => item.critical && item.status !== 'PASS').map((item) => `${item.id}: ${item.message}`);
  return { ready: blockers.length === 0, gates, blockers, score: Math.round(gates.reduce((sum, item) => sum + (item.status === 'PASS' ? 100 : item.status === 'WARN' ? 70 : 0), 0) / gates.length) };
}

export type GenerationModePlan = { mode: 'DRAFT' | 'FINAL'; allowed: boolean; providers: string[]; outputs: string[]; reasons: string[] };
export function buildGenerationModePlan(mode: GenerationModePlan['mode'], input: { budgetUsd: number; estimatedCostUsd: number; expensiveVideoSeconds?: number; validated?: boolean }): GenerationModePlan {
  if (mode === 'FINAL' && !input.validated) return { mode, allowed: false, providers: [], outputs: [], reasons: ['Final generation blocked until hook, script, storyboard, timing and scene order are validated.'] };
  if (input.estimatedCostUsd > input.budgetUsd) return { mode, allowed: false, providers: [], outputs: [], reasons: ['Estimated generation cost exceeds budget cap.'] };
  return mode === 'DRAFT' ? { mode, allowed: true, providers: ['cheap/mock voice', 'procedural renderer', 'low-cost image'], outputs: ['storyboard', 'temporary voice', 'rough timeline', 'captions', 'preview render'], reasons: ['Draft mode validates editorial decisions before expensive media.'] } : { mode, allowed: true, providers: ['configured final voice', 'selected image/video provider', 'final renderer'], outputs: ['final voice', 'final assets', 'final render', 'QC package'], reasons: ['Editorial validation and budget cap passed.'] };
}

export type Experiment = { id: string; hypothesis: string; axis: 'TITLE' | 'THUMBNAIL' | 'HOOK' | 'DURATION' | 'VISUAL_STYLE' | 'TOPIC_FRAMING'; variantA: unknown; variantB: unknown; metric: 'CTR' | 'RETENTION' | 'AVD' | 'RPM' | 'ROI'; measurementWindowDays: number; state: 'PLANNED' | 'RUNNING' | 'WINNER' | 'LOSER' | 'INCONCLUSIVE'; result?: unknown; confidence?: number };
export function planExperiment(input: Omit<Experiment, 'id' | 'state'> & { id?: string }): Experiment { return { ...input, id: input.id ?? `experiment-${Date.now()}`, state: 'PLANNED' }; }

export type ChannelLearningProfile = { channelId: string; sampleSize: number; marketEvidenceWeight: number; ownedEvidenceWeight: number; ownMetrics: { ctr?: number; retention?: number; avd?: number; rpm?: number; profitability?: number }; winningDNA: string[]; lastUpdated: string };
export function updateChannelLearning(profile: ChannelLearningProfile, input: { ownMetrics?: ChannelLearningProfile['ownMetrics']; winningDNA?: string[]; additionalSamples?: number }): ChannelLearningProfile { const sampleSize = Math.max(0, profile.sampleSize + (input.additionalSamples ?? 0)); const ownWeight = Math.min(0.8, 0.1 + sampleSize / 40 * 0.7); return { ...profile, sampleSize, marketEvidenceWeight: Math.round((1 - ownWeight) * 100) / 100, ownedEvidenceWeight: Math.round(ownWeight * 100) / 100, ownMetrics: { ...profile.ownMetrics, ...input.ownMetrics }, winningDNA: [...new Set([...profile.winningDNA, ...(input.winningDNA ?? [])])], lastUpdated: new Date().toISOString() }; }
