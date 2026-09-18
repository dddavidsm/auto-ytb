import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { BinaryAsset, GenerativeVideoProvider, VideoGenerationRequest } from '@auto-ytb/providers';

export type ProductionMode = 'FOOTAGE_PRO' | 'HYBRID_EDITORIAL' | 'GENERATIVE_EDITORIAL' | 'FULL_GENERATIVE' | 'CHARACTER_SERIES' | 'NEWS_EXPLAINER' | 'DOCUMENTARY' | 'VIDEO_ESSAY' | 'TOP_LIST' | 'COMPARISON' | 'TUTORIAL' | 'DATA_STORY' | 'ARCHIVAL' | 'ANIMATED_STORY' | 'AVATAR' | 'TALKING_CHARACTER';
export type RuntimeProfile = 'SHORT_FORM' | 'MEDIUM_FORM' | 'LONG_FORM';
export type SourcePolicy = 'RETRIEVAL_FIRST' | 'HYBRID' | 'GENERATIVE_FIRST' | 'GENERATIVE_ONLY';

export type ProductionIntent = {
  topic?: string;
  prompt?: string;
  script?: string;
  requestedMode?: ProductionMode | 'AUTO' | 'SOURCED';
  format?: string;
  targetDurationSeconds?: number;
  aspectRatio?: '16:9' | '9:16' | '1:1';
  seriesId?: string;
  characterSeries?: boolean;
  audience?: string;
  qualityMode?: 'DRAFT' | 'STANDARD' | 'MAX_QUALITY';
  budgetUsd?: number;
  userConstraints?: string[];
};

export type ProductionPlan = {
  version: 'PRODUCTION_PLAN_V2';
  mode: ProductionMode;
  runtimeProfile: RuntimeProfile;
  sourcePolicy: SourcePolicy;
  targetDurationSeconds: number;
  aspectRatio: '16:9' | '9:16' | '1:1';
  budget: { targetUsd: number | null; hardUsd: number | null; reservedUsd: number; spentUsd: number };
  finalMediaPolicy: 'VIDEO_ONLY';
  allowExternalSourcing: boolean;
  allowSyntheticGeneration: boolean;
  requireCharacterContinuity: boolean;
  qualityMode: 'DRAFT' | 'STANDARD' | 'MAX_QUALITY';
  rationale: string[];
};

export function runtimeProfileForDuration(seconds: number, aspectRatio = '16:9'): RuntimeProfile {
  if (aspectRatio === '9:16' && seconds <= 60) return 'SHORT_FORM';
  if (seconds <= 60) return 'SHORT_FORM';
  if (seconds <= 180) return 'MEDIUM_FORM';
  return 'LONG_FORM';
}

export function selectProductionMode(input: ProductionIntent): { mode: ProductionMode; rationale: string[] } {
  const requested = input.requestedMode;
  if (requested && requested !== 'AUTO' && requested !== 'SOURCED') {
    return { mode: requested, rationale: ['Explicit production mode requested by the brief.'] };
  }
  if (input.characterSeries || input.seriesId || /character|episode|cartoon|animated story|recurring/i.test(`${input.format ?? ''} ${input.prompt ?? ''}`)) return { mode: 'CHARACTER_SERIES', rationale: ['Recurring character or series intent detected.'] };
  if (/news|breaking|announcement|today|yesterday/i.test(`${input.format ?? ''} ${input.prompt ?? ''}`)) return { mode: 'NEWS_EXPLAINER', rationale: ['Time-sensitive news language detected; factual sourcing remains required.'] };
  if (requested === 'SOURCED' || input.format === 'DOCUMENTARY' || input.format === 'TOP_LIST' || input.format === 'SOURCED_NARRATIVE') return { mode: 'FOOTAGE_PRO', rationale: ['Sourced format and retrieval-first intent detected.'] };
  if (/fiction|story|imaginary|future world|what if|sketch/i.test(`${input.format ?? ''} ${input.prompt ?? ''}`)) return { mode: 'GENERATIVE_EDITORIAL', rationale: ['Original or hypothetical visual world detected.'] };
  return { mode: 'HYBRID_EDITORIAL', rationale: ['AUTO selected a reversible hybrid strategy pending media preflight.'] };
}

export class ProductionDirector {
  createPlan(input: ProductionIntent): ProductionPlan {
    const selected = selectProductionMode(input);
    const mode = selected.mode;
    const duration = Math.max(1, Number(input.targetDurationSeconds ?? (mode === 'CHARACTER_SERIES' ? 30 : 90)));
    const runtimeProfile = runtimeProfileForDuration(duration, input.aspectRatio);
    const generativeOnly = mode === 'FULL_GENERATIVE' || mode === 'CHARACTER_SERIES';
    const retrievalFirst = mode === 'FOOTAGE_PRO' || mode === 'NEWS_EXPLAINER' || mode === 'DOCUMENTARY' || mode === 'ARCHIVAL' || input.requestedMode === 'SOURCED';
    const target = input.budgetUsd == null ? null : Math.max(0, input.budgetUsd);
    return {
      version: 'PRODUCTION_PLAN_V2', mode, runtimeProfile, targetDurationSeconds: duration,
      aspectRatio: input.aspectRatio ?? (runtimeProfile === 'SHORT_FORM' ? '9:16' : '16:9'),
      sourcePolicy: generativeOnly ? 'GENERATIVE_ONLY' : retrievalFirst ? 'RETRIEVAL_FIRST' : mode === 'GENERATIVE_EDITORIAL' ? 'GENERATIVE_FIRST' : 'HYBRID',
      budget: { targetUsd: target, hardUsd: target, reservedUsd: 0, spentUsd: 0 }, finalMediaPolicy: 'VIDEO_ONLY',
      allowExternalSourcing: !generativeOnly, allowSyntheticGeneration: true,
      requireCharacterContinuity: mode === 'CHARACTER_SERIES' || Boolean(input.seriesId), qualityMode: input.qualityMode ?? 'STANDARD',
      rationale: selected.rationale.concat(generativeOnly ? ['External footage is disabled for this mode.'] : ['External footage remains eligible according to media preflight.']),
    };
  }
}

export type CharacterIdentity = {
  characterId: string;
  version: string;
  name: string;
  visualDescription: string;
  immutableTraits: string[];
  mutableTraits: string[];
  proportions: string;
  materials: string;
  eyes: string;
  clothing: string[];
  accessories: string[];
  characteristicDetails: string[];
  personality: string[];
  movementStyle: string;
  expressionRules: string[];
  voiceId?: string;
  visualStyle: string;
  referenceAssets: string[];
  continuityConstraints: string[];
  forbiddenChanges: string[];
  createdAt: string;
  updatedAt: string;
};

export type WorldIdentity = {
  worldId: string;
  version: string;
  name: string;
  visualIdentity: string;
  architecture: string;
  layout: string;
  colors: string[];
  lighting: string;
  weatherDefaults: string[];
  props: string[];
  recurringObjects: string[];
  referenceAssets: string[];
  spatialRelationships: string[];
  continuityMetadata: Record<string, string | number | boolean>;
  createdAt: string;
  updatedAt: string;
};

export type SeriesEpisodeMemory = {
  seriesId: string;
  episodeId: string;
  charactersAppearing: string[];
  outfits: Record<string, string>;
  props: string[];
  locations: string[];
  storyEvents: string[];
  continuityChanges: string[];
  secondaryCharacters: string[];
  priorEpisodeReferences: string[];
  createdAt: string;
};

export class JsonRegistry<T extends object> {
  constructor(private readonly path: string, private readonly idKey: keyof T) {}
  async list(): Promise<T[]> { try { const value = JSON.parse(await readFile(this.path, 'utf8')) as unknown; return Array.isArray(value) ? value as T[] : []; } catch { return []; } }
  async get(id: string): Promise<T | null> { return (await this.list()).find((item) => String((item as Record<PropertyKey, unknown>)[this.idKey]) === id) ?? null; }
  async upsert(value: T): Promise<T> { const rows = await this.list(); const id = String((value as Record<PropertyKey, unknown>)[this.idKey]); const index = rows.findIndex((item) => String((item as Record<PropertyKey, unknown>)[this.idKey]) === id); if (index >= 0) rows[index] = value; else rows.push(value); await mkdir(dirname(this.path), { recursive: true }); await writeFile(this.path, `${JSON.stringify(rows, null, 2)}\n`, 'utf8'); return value; }
}

export class CharacterRegistry {
  private readonly store: JsonRegistry<CharacterIdentity>;
  constructor(path: string) { this.store = new JsonRegistry<CharacterIdentity>(path, 'characterId'); }
  list(): Promise<CharacterIdentity[]> { return this.store.list(); }
  get(characterId: string): Promise<CharacterIdentity | null> { return this.store.get(characterId); }
  async register(character: CharacterIdentity): Promise<CharacterIdentity> {
    const existing = await this.get(character.characterId);
    if (existing) {
      for (const trait of existing.immutableTraits) if (!character.immutableTraits.includes(trait)) throw new Error(`CHARACTER_IMMUTABLE_TRAIT_REMOVED:${character.characterId}:${trait}`);
      if (existing.visualDescription !== character.visualDescription || existing.proportions !== character.proportions || existing.materials !== character.materials) throw new Error(`CHARACTER_IDENTITY_DRIFT:${character.characterId}`);
      return this.store.upsert({ ...existing, mutableTraits: character.mutableTraits, updatedAt: character.updatedAt });
    }
    return this.store.upsert(character);
  }
}

export class WorldRegistry {
  private readonly store: JsonRegistry<WorldIdentity>;
  constructor(path: string) { this.store = new JsonRegistry<WorldIdentity>(path, 'worldId'); }
  list(): Promise<WorldIdentity[]> { return this.store.list(); }
  get(worldId: string): Promise<WorldIdentity | null> { return this.store.get(worldId); }
  async register(world: WorldIdentity): Promise<WorldIdentity> {
    const existing = await this.get(world.worldId);
    if (existing && (existing.visualIdentity !== world.visualIdentity || existing.layout !== world.layout || existing.architecture !== world.architecture)) throw new Error(`WORLD_IDENTITY_DRIFT:${world.worldId}`);
    return this.store.upsert(existing ? { ...existing, weatherDefaults: world.weatherDefaults, updatedAt: world.updatedAt } : world);
  }
}

export class SeriesEpisodeMemoryRegistry {
  private readonly store: JsonRegistry<SeriesEpisodeMemory>;
  constructor(path: string) { this.store = new JsonRegistry<SeriesEpisodeMemory>(path, 'episodeId'); }
  list(): Promise<SeriesEpisodeMemory[]> { return this.store.list(); }
  get(episodeId: string): Promise<SeriesEpisodeMemory | null> { return this.store.get(episodeId); }
  register(memory: SeriesEpisodeMemory): Promise<SeriesEpisodeMemory> { return this.store.upsert(memory); }
}

export type ReferencePack = { characterAssets: string[]; worldAssets: string[]; previousAcceptedShots: string[]; nextPlannedShots: string[]; styleAssets: string[]; firstFrameUri?: string; lastFrameUri?: string; strategy: 'NONE' | 'MASTER_REFERENCES' | 'FIRST_LAST' | 'VIDEO_REFERENCE' | 'MIXED'; };

export type ShotContract = {
  shotId: string;
  scene: string;
  narrativePurpose: string;
  startTime: number;
  desiredDurationSeconds: number;
  aspectRatio?: '16:9' | '9:16' | '1:1';
  visualDescription: string;
  primarySubject: string;
  characterIds: string[];
  worldId?: string;
  action: string;
  emotion?: string;
  framing: string;
  camera: string;
  motion: string;
  realismTarget: 'PHOTOREAL' | 'STYLIZED_REAL' | 'ANIMATED' | 'CINEMATIC';
  styleTarget: string;
  continuityDependencies: string[];
  importance: 'UTILITY' | 'HERO' | 'PAYOFF';
  generationEligible: boolean;
  sourcePolicy: SourcePolicy;
  maxCostUsd: number | null;
  qualityFloor: number;
  referenceRequirements: string[];
};

export class GenerationPromptCompiler {
  compile(shot: ShotContract, characters: CharacterIdentity[], world: WorldIdentity | null, references: ReferencePack, negativeConstraints: string[] = []): string {
    const characterText = characters.map((item) => `${item.name}: ${item.visualDescription}; immutable traits: ${item.immutableTraits.join(', ')}; proportions: ${item.proportions}; materials: ${item.materials}; clothing: ${item.clothing.join(', ')}`).join(' | ') || 'no recurring character';
    return [`${shot.realismTarget === 'PHOTOREAL' ? 'Photorealistic believable video footage' : 'Production-quality generated video'} for ${shot.narrativePurpose}.`, `Subject: ${shot.primarySubject}. Action: ${shot.action}. Emotion: ${shot.emotion ?? 'natural, unforced'}.`, `Characters: ${characterText}.`, `World: ${world ? `${world.name}; ${world.visualIdentity}; architecture ${world.architecture}; layout ${world.layout}; lighting ${world.lighting}; recurring objects ${world.recurringObjects.join(', ')}` : 'environment appropriate to the shot contract'}.`, `Camera: ${shot.framing}, ${shot.camera}, ${shot.motion}. Duration ${shot.desiredDurationSeconds.toFixed(2)} seconds. Style: ${shot.styleTarget}.`, `Continuity: ${shot.continuityDependencies.join('; ') || 'match the approved production profile'}. Reference strategy: ${references.strategy}; preserve reference identity and geometry.`, `Do not add readable text, logos, labels or unrelated people. ${[...negativeConstraints, 'no still image', 'no slideshow', 'no frozen frame', 'no morphing', 'no impossible physics'].join(', ')}.`].join(' ');
  }
}

export type GenerationAttempt = {
  attemptId: string;
  shotId: string;
  provider: string;
  model?: string;
  mode: string;
  prompt: string;
  request: VideoGenerationRequest;
  references: ReferencePack;
  estimatedCostUsd: number | null;
  actualCostUsd: number | null;
  latencyMs: number | null;
  outputAssetId?: string;
  status: 'GENERATED' | 'ACCEPTED' | 'REJECTED' | 'FAILED';
  failureCategories: string[];
  repairOf?: string;
  createdAt: string;
};

export type GenerationPerformance = { provider: string; model: string; shotType: string; sampleCount: number; generatedCandidates: number; acceptedCandidates: number; rejectedCandidates: number; usableSeconds: number; creditsSpentUsd: number; latencyMsTotal: number; qualityTotal: number; failureCategories: Record<string, number>; };

export class GenerationPerformanceMemory {
  private readonly rows = new Map<string, GenerationPerformance>();
  constructor(initial: GenerationPerformance[] = []) { for (const row of initial) this.rows.set(this.key(row.provider, row.model, row.shotType), { ...row, failureCategories: { ...row.failureCategories } }); }
  private key(provider: string, model: string, shotType: string) { return `${provider}|${model}|${shotType}`; }
  record(input: { provider: string; model: string; shotType: string; accepted: boolean; usableSeconds: number; costUsd: number; latencyMs: number; quality: number; failureCategories?: string[] }): GenerationPerformance { const key = this.key(input.provider, input.model, input.shotType); const current = this.rows.get(key) ?? { provider: input.provider, model: input.model, shotType: input.shotType, sampleCount: 0, generatedCandidates: 0, acceptedCandidates: 0, rejectedCandidates: 0, usableSeconds: 0, creditsSpentUsd: 0, latencyMsTotal: 0, qualityTotal: 0, failureCategories: {} }; current.sampleCount += 1; current.generatedCandidates += 1; current.acceptedCandidates += input.accepted ? 1 : 0; current.rejectedCandidates += input.accepted ? 0 : 1; current.usableSeconds += input.usableSeconds; current.creditsSpentUsd += input.costUsd; current.latencyMsTotal += input.latencyMs; current.qualityTotal += input.quality; for (const failure of input.failureCategories ?? []) current.failureCategories[failure] = (current.failureCategories[failure] ?? 0) + 1; this.rows.set(key, current); return current; }
  list(): GenerationPerformance[] { return [...this.rows.values()].map((row) => ({ ...row, failureCategories: { ...row.failureCategories } })); }
  rank(candidates: Array<{ provider: string; model: string; estimatedCostUsd: number | null }>, shotType: string): Array<{ provider: string; model: string; score: number; costPerAcceptedSecond: number | null; reason: string }> { return candidates.map((candidate) => { const row = this.rows.get(this.key(candidate.provider, candidate.model, shotType)); const keepRate = row && row.generatedCandidates ? row.acceptedCandidates / row.generatedCandidates : 0.5; const avgQuality = row && row.sampleCount ? row.qualityTotal / row.sampleCount : 70; const acceptedSeconds = row?.usableSeconds || 0; const costPerAcceptedSecond = row && acceptedSeconds > 0 ? row.creditsSpentUsd / acceptedSeconds : candidate.estimatedCostUsd; const score = keepRate * 55 + avgQuality * 0.35 - (costPerAcceptedSecond ?? 1) * 10; return { provider: candidate.provider, model: candidate.model, score, costPerAcceptedSecond, reason: row ? `historical keep rate ${(keepRate * 100).toFixed(1)}%, average quality ${avgQuality.toFixed(1)}, cost/accepted-second ${costPerAcceptedSecond == null ? 'unknown' : costPerAcceptedSecond.toFixed(4)}` : 'cold-start prior; no historical samples' }; }).sort((a, b) => b.score - a.score); }
  async save(path: string): Promise<void> { await mkdir(dirname(path), { recursive: true }); await writeFile(path, `${JSON.stringify(this.list(), null, 2)}\n`, 'utf8'); }
}

export type GeneratedClipQuality = { technicalValidity: boolean; subjectCorrectness: 'STRONG' | 'MEDIUM' | 'WEAK'; actionCorrectness: 'STRONG' | 'MEDIUM' | 'WEAK'; characterIdentity: 'STRONG' | 'MEDIUM' | 'WEAK' | 'NOT_APPLICABLE'; worldIdentity: 'STRONG' | 'MEDIUM' | 'WEAK' | 'NOT_APPLICABLE'; temporalCoherence: 'STRONG' | 'MEDIUM' | 'WEAK'; physics: 'STRONG' | 'MEDIUM' | 'WEAK' | 'NOT_APPLICABLE'; styleMatch: 'STRONG' | 'MEDIUM' | 'WEAK' | 'NOT_APPLICABLE'; motion: 'STRONG' | 'MEDIUM' | 'WEAK'; artifactIssues: string[]; score: number; accepted: boolean; rejectionReasons: string[]; method: string; };

export function evaluateGeneratedClipQuality(input: Omit<GeneratedClipQuality, 'accepted' | 'rejectionReasons' | 'score'> & { qualityFloor?: number }): GeneratedClipQuality {
  const values = [input.subjectCorrectness, input.actionCorrectness, input.temporalCoherence, input.motion, input.characterIdentity, input.worldIdentity, input.physics, input.styleMatch].filter((item) => item !== 'NOT_APPLICABLE');
  const strong = values.filter((item) => item === 'STRONG').length;
  const score = Math.round((strong / Math.max(1, values.length)) * 100);
  const rejectionReasons = [...input.artifactIssues];
  if (!input.technicalValidity) rejectionReasons.push('TECHNICAL_INVALID');
  if (values.some((item) => item === 'WEAK')) rejectionReasons.push('QUALITY_DIMENSION_WEAK');
  if (score < (input.qualityFloor ?? 75)) rejectionReasons.push('QUALITY_FLOOR_NOT_MET');
  return { ...input, score, accepted: rejectionReasons.length === 0, rejectionReasons };
}

export type GenerationCostLedger = { targetUsd: number | null; hardUsd: number | null; spentUsd: number; reservedUsd: number; generatedSeconds: number; acceptedSeconds: number; rejectedCostUsd: number; providerBreakdown: Record<string, number>; modelBreakdown: Record<string, number>; };

export class CostOptimizer {
  constructor(private readonly ledger: GenerationCostLedger) {}
  reserve(costUsd: number, reason: string): void { if (costUsd < 0) throw new Error('NEGATIVE_COST'); const available = this.ledger.hardUsd == null ? Infinity : this.ledger.hardUsd - this.ledger.spentUsd - this.ledger.reservedUsd; if (costUsd > available + 1e-9) throw new Error(`BUDGET_BLOCK:${reason}`); this.ledger.reservedUsd += costUsd; }
  settle(input: { provider: string; model: string; costUsd: number; generatedSeconds: number; acceptedSeconds: number; accepted: boolean }): void { this.ledger.reservedUsd = Math.max(0, this.ledger.reservedUsd - input.costUsd); this.ledger.spentUsd += input.costUsd; this.ledger.generatedSeconds += input.generatedSeconds; this.ledger.acceptedSeconds += input.acceptedSeconds; if (!input.accepted) this.ledger.rejectedCostUsd += input.costUsd; this.ledger.providerBreakdown[input.provider] = (this.ledger.providerBreakdown[input.provider] ?? 0) + input.costUsd; this.ledger.modelBreakdown[input.model] = (this.ledger.modelBreakdown[input.model] ?? 0) + input.costUsd; }
  snapshot() { return { ...this.ledger, costPerAcceptedUsableSecond: this.ledger.acceptedSeconds > 0 ? this.ledger.spentUsd / this.ledger.acceptedSeconds : null, remainingUsd: this.ledger.hardUsd == null ? null : Math.max(0, this.ledger.hardUsd - this.ledger.spentUsd - this.ledger.reservedUsd) }; }
}

export type RepairDecision = { category: string; strategy: 'MODIFY_PROMPT' | 'ADD_REFERENCE' | 'SIMPLIFY_ACTION' | 'CHANGE_CAMERA' | 'SHORTEN_SHOT' | 'SPLIT_SHOT' | 'CHANGE_PROVIDER' | 'REUSE_ACCEPTED_ASSET' | 'REDESIGN_SHOT' | 'RETRIEVAL_FALLBACK' | 'ABORT'; reason: string; expectedGain: number; estimatedCostUsd: number | null; };

export function diagnoseGenerationFailure(quality: GeneratedClipQuality): string[] { return quality.rejectionReasons.length ? quality.rejectionReasons : ['UNKNOWN_GENERATION_FAILURE']; }

export class RepairOrchestrator {
  decide(input: { mode: ProductionMode; quality: GeneratedClipQuality; attemptNumber: number; maxAttempts: number; estimatedCostUsd: number | null; hasReferences: boolean; retrievalAllowed: boolean }): RepairDecision {
    const category = diagnoseGenerationFailure(input.quality)[0] ?? 'UNKNOWN_GENERATION_FAILURE';
    if (input.attemptNumber >= input.maxAttempts) return { category, strategy: 'ABORT', reason: 'Maximum generation attempts reached.', expectedGain: 0, estimatedCostUsd: null };
    if (/character|identity|drift/i.test(category) && !input.hasReferences) return { category, strategy: 'ADD_REFERENCE', reason: 'Identity failure needs canonical reference assets before another request.', expectedGain: 0.7, estimatedCostUsd: input.estimatedCostUsd };
    if (/physics|anatomy|interaction|artifact/i.test(category)) return { category, strategy: 'SIMPLIFY_ACTION', reason: 'Reduce action complexity before changing provider.', expectedGain: 0.55, estimatedCostUsd: input.estimatedCostUsd };
    if (/style|continuity|camera|motion/i.test(category)) return { category, strategy: 'CHANGE_CAMERA', reason: 'Change framing or motion to reduce temporal failure risk and match context.', expectedGain: 0.5, estimatedCostUsd: input.estimatedCostUsd };
    if (input.retrievalAllowed && input.mode !== 'FULL_GENERATIVE' && input.mode !== 'CHARACTER_SERIES') return { category, strategy: 'RETRIEVAL_FALLBACK', reason: 'A real asset may be more reliable for this non-core generated gap.', expectedGain: 0.6, estimatedCostUsd: 0 };
    return { category, strategy: 'MODIFY_PROMPT', reason: 'Change constraints materially; do not repeat identical generation input.', expectedGain: 0.4, estimatedCostUsd: input.estimatedCostUsd };
  }
}

export type ApprovedVideoAsset = BinaryAsset & { assetType: 'REAL_VIDEO' | 'SYNTHETIC_VIDEO'; evidenceRole: string; videoOnly: true; quality: GeneratedClipQuality | null; usageCount: number; characters: string[]; worldId?: string; provider?: string; model?: string; generationCostUsd?: number | null; };

export class GeneratedAssetRegistry {
  constructor(private readonly registry: JsonRegistry<ApprovedVideoAsset>) {}
  async approve(asset: ApprovedVideoAsset): Promise<ApprovedVideoAsset> { if (asset.assetType !== 'SYNTHETIC_VIDEO' || asset.evidenceRole === 'DIRECT_EVIDENCE') throw new Error('GENERATED_ASSET_CANNOT_BE_DIRECT_EVIDENCE'); if (asset.videoOnly !== true || !asset.mimeType.startsWith('video/')) throw new Error('APPROVED_ASSET_MUST_BE_VIDEO_ONLY'); return this.registry.upsert(asset); }
  async findReusable(input: { characters?: string[]; worldId?: string; minQuality?: number }): Promise<ApprovedVideoAsset[]> { const rows = await this.registry.list(); return rows.filter((row) => (!input.worldId || row.worldId === input.worldId) && (input.characters ?? []).every((id) => row.characters.includes(id)) && (!input.minQuality || Number(row.quality?.score ?? 0) >= input.minQuality)); }
}

export type GenerativeShotResult = { shot: ShotContract; status: 'ACCEPTED' | 'REJECTED' | 'FAILED'; asset?: ApprovedVideoAsset; attempts: GenerationAttempt[]; repairDecisions: RepairDecision[]; finalQuality?: GeneratedClipQuality; };

export class GenerativeProductionOrchestrator {
  constructor(private readonly input: { provider: GenerativeVideoProvider; promptCompiler?: GenerationPromptCompiler; performance?: GenerationPerformanceMemory; cost?: CostOptimizer; repair?: RepairOrchestrator; maxAttempts?: number; now?: () => string }) {}
  async generateShot(input: { shot: ShotContract; characters?: CharacterIdentity[]; world?: WorldIdentity | null; references?: ReferencePack; evaluate: (asset: BinaryAsset, shot: ShotContract) => Promise<GeneratedClipQuality>; mutateForRepair?: (shot: ShotContract, decision: RepairDecision) => ShotContract }): Promise<GenerativeShotResult> {
    const references = input.references ?? { characterAssets: [], worldAssets: [], previousAcceptedShots: [], nextPlannedShots: [], styleAssets: [], strategy: 'NONE' as const };
    const attempts: GenerationAttempt[] = []; const repairDecisions: RepairDecision[] = []; const maxAttempts = this.input.maxAttempts ?? 3; let shot = input.shot;
    const repairPolicy = this.input.repair ?? new RepairOrchestrator();
    for (let attemptNumber = 1; attemptNumber <= maxAttempts; attemptNumber += 1) {
      const prompt = (this.input.promptCompiler ?? new GenerationPromptCompiler()).compile(shot, input.characters ?? [], input.world ?? null, references);
      const referenceUris = [...references.characterAssets, ...references.worldAssets, ...references.styleAssets].slice(0, 3);
      const canUseReferences = references.strategy !== 'NONE' && this.input.provider.capability.referenceImageSupport && this.input.provider.capability.modes.includes('REFERENCE_TO_VIDEO');
      const request: VideoGenerationRequest = { prompt, durationSeconds: shot.desiredDurationSeconds, aspectRatio: shot.aspectRatio ?? '16:9', mode: canUseReferences ? 'REFERENCE_TO_VIDEO' : 'TEXT_TO_VIDEO', referenceUris: canUseReferences ? referenceUris : [] };
      const estimate = this.input.provider.estimateCost(request); if (estimate.estimatedUsd != null) this.input.cost?.reserve(estimate.estimatedUsd, shot.shotId);
      const started = Date.now(); let asset: BinaryAsset; let error: Error | null = null;
      try { asset = await this.input.provider.generateShot(request); } catch (value) { error = value instanceof Error ? value : new Error(String(value)); asset = { id: `failed-${shot.shotId}-${attemptNumber}`, uri: '', mimeType: 'video/unknown', provider: this.input.provider.name }; }
      const latency = Date.now() - started;
      if (error) {
        const failureCategories = [error.message.split(':')[0] ?? 'PROVIDER_ERROR'];
        attempts.push({ attemptId: `${shot.shotId}-${attemptNumber}`, shotId: shot.shotId, provider: this.input.provider.name, model: this.input.provider.capability.model, mode: request.mode ?? 'TEXT_TO_VIDEO', prompt, request, references, estimatedCostUsd: estimate.estimatedUsd, actualCostUsd: null, latencyMs: latency, status: 'FAILED', failureCategories, createdAt: this.input.now?.() ?? new Date().toISOString() });
        const failureQuality = evaluateGeneratedClipQuality({ technicalValidity: false, subjectCorrectness: 'WEAK', actionCorrectness: 'WEAK', characterIdentity: 'NOT_APPLICABLE', worldIdentity: 'NOT_APPLICABLE', temporalCoherence: 'WEAK', physics: 'NOT_APPLICABLE', styleMatch: 'WEAK', motion: 'WEAK', artifactIssues: [error.message], method: 'provider-error', qualityFloor: 75 });
        if (estimate.estimatedUsd != null) this.input.cost?.settle({ provider: this.input.provider.name, model: this.input.provider.capability.model ?? 'unknown', costUsd: estimate.estimatedUsd, generatedSeconds: 0, acceptedSeconds: 0, accepted: false });
        const decision = repairPolicy.decide({ mode: 'GENERATIVE_EDITORIAL', quality: failureQuality, attemptNumber, maxAttempts, estimatedCostUsd: estimate.estimatedUsd, hasReferences: references.strategy !== 'NONE', retrievalAllowed: false });
        repairDecisions.push(decision);
        if (decision.strategy === 'ABORT') return { shot, status: 'FAILED', attempts, repairDecisions };
        shot = input.mutateForRepair ? input.mutateForRepair(shot, decision) : { ...shot, continuityDependencies: [...shot.continuityDependencies, `repair ${attemptNumber}: ${decision.reason}`] };
        continue;
      }
      const quality = await input.evaluate(asset, shot); const accepted = quality.accepted && asset.mimeType.startsWith('video/'); const attempt: GenerationAttempt = { attemptId: `${shot.shotId}-${attemptNumber}`, shotId: shot.shotId, provider: asset.provider, model: asset.model ?? this.input.provider.capability.model, mode: request.mode ?? 'TEXT_TO_VIDEO', prompt, request, references, estimatedCostUsd: estimate.estimatedUsd, actualCostUsd: asset.costUsd ?? estimate.estimatedUsd, latencyMs: latency, outputAssetId: asset.id, status: accepted ? 'ACCEPTED' : 'REJECTED', failureCategories: quality.rejectionReasons, createdAt: this.input.now?.() ?? new Date().toISOString() }; attempts.push(attempt); const cost = asset.costUsd ?? estimate.estimatedUsd ?? 0; this.input.cost?.settle({ provider: asset.provider, model: asset.model ?? this.input.provider.capability.model ?? 'unknown', costUsd: cost, generatedSeconds: Number(asset.metadata?.generatedDurationSeconds ?? shot.desiredDurationSeconds), acceptedSeconds: accepted ? shot.desiredDurationSeconds : 0, accepted }); this.input.performance?.record({ provider: asset.provider, model: asset.model ?? this.input.provider.capability.model ?? 'unknown', shotType: shot.narrativePurpose, accepted, usableSeconds: accepted ? shot.desiredDurationSeconds : 0, costUsd: cost, latencyMs: latency, quality: quality.score, failureCategories: quality.rejectionReasons }); if (accepted) return { shot, status: 'ACCEPTED', asset: { ...asset, assetType: 'SYNTHETIC_VIDEO', evidenceRole: 'SYNTHETIC_ILLUSTRATION', videoOnly: true, quality, usageCount: 0, characters: input.characters?.map((item) => item.characterId) ?? [], worldId: input.world?.worldId, provider: asset.provider, model: asset.model ?? this.input.provider.capability.model, generationCostUsd: cost }, attempts, repairDecisions, finalQuality: quality }; const decision = repairPolicy.decide({ mode: 'GENERATIVE_EDITORIAL', quality, attemptNumber, maxAttempts, estimatedCostUsd: estimate.estimatedUsd, hasReferences: references.strategy !== 'NONE', retrievalAllowed: false }); repairDecisions.push(decision); if (decision.strategy === 'ABORT') break; shot = input.mutateForRepair ? input.mutateForRepair(shot, decision) : { ...shot, continuityDependencies: [...shot.continuityDependencies, `repair ${attemptNumber}: ${decision.reason}`] };
    }
    return { shot, status: 'REJECTED', attempts, repairDecisions, finalQuality: attempts.length ? undefined : undefined };
  }
}
