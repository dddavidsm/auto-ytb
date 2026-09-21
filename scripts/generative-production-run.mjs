import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeLocalObjectStore, FfmpegRenderer } from '../packages/runtime-node/index.mjs';
import { GeminiVoiceProvider, GeminiVisionProvider } from '../packages/providers/dist/index.js';
import { withGeminiWordAlignment } from '../packages/runtime-node/gemini-word-alignment.mjs';
import { CostOptimizer, GenerationPerformanceMemory, GenerationPromptCompiler, GenerativeProductionOrchestrator, JsonRegistry, CharacterRegistry, WorldRegistry, SeriesEpisodeMemoryRegistry, ProductionDirector, RepairOrchestrator, GeneratedAssetRegistry, assertFinalTimelineIsVideoOnly, probeRenderedVideoOnly, evaluateCreativeQC, redesignHighRiskShot } from '../packages/production/dist/index.js';
import { createGenerativeVideoProviderRuntime, describeGenerativeVideoRuntime } from './generative-video-provider-runtime.mjs';
import { evaluateGeneratedClipSemanticQc } from './generated-clip-semantic-qc.mjs';

const now = () => new Date().toISOString();
const fileUri = (path) => `file://${resolve(path)}`;
const writeJson = async (path, value) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); };
const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const execFileAsync = promisify(execFile);

async function readBrief(scriptPath, prompt) {
  if (!scriptPath) return { narration: clean(prompt) || 'An original visual story with a clear beginning, transformation, and payoff.', storyBeats: [] };
  const raw = await readFile(scriptPath, 'utf8');
  try {
    const value = JSON.parse(raw);
    return { narration: clean(value.narration ?? value.script ?? value.text ?? value.title ?? prompt), storyBeats: Array.isArray(value.storyBeats) ? value.storyBeats : [], character: value.character ?? null, world: value.world ?? null };
  } catch { return { narration: clean(raw), storyBeats: [] }; }
}

function buildStoryBeats(narration, provided) {
  if (provided.length) return provided.map((beat, index) => ({ beatId: String(beat.beatId ?? beat.id ?? `beat-${index + 1}`), description: clean(beat.description ?? beat.visualDescription ?? beat.narration ?? `Visual beat ${index + 1}`), requiredVisualTerms: Array.isArray(beat.requiredVisualTerms) ? beat.requiredVisualTerms.map(String) : clean(beat.description ?? beat.visualDescription ?? beat.narration).split(/\s+/).slice(0, 8), purpose: beat.purpose, subject: beat.subject, action: beat.action, object: beat.object, cause: beat.cause, result: beat.result, emotion: beat.emotion, framing: beat.framing, camera: beat.camera, motion: beat.motion, importance: beat.importance }));
  return narration.split(/(?<=[.!?])\s+/).map((description, index, rows) => ({ beatId: `beat-${index + 1}`, description: clean(description), requiredVisualTerms: clean(description).split(/\s+/).slice(0, 8), purpose: index === 0 ? 'hook' : index === rows.length - 1 ? 'end' : 'story progression' }));
}

function buildShots(narration, durationSeconds, mode, characterId, aspectRatio, providedBeats = []) {
  const beats = buildStoryBeats(narration, providedBeats);
  const count = Math.max(3, Math.min(12, beats.length || Math.ceil(durationSeconds / 4)));
  const shotDuration = 4;
  return Array.from({ length: count }, (_, index) => ({
    shotId: `generated-shot-${index + 1}`,
    scene: `scene-${index + 1}`,
    narrativePurpose: beats[index]?.purpose ?? (index === 0 ? 'hook' : index === count - 1 ? 'payoff' : 'story progression'),
    startTime: index * shotDuration,
    desiredDurationSeconds: shotDuration,
    aspectRatio,
    visualDescription: `${beats[index % Math.max(1, beats.length)]?.description ?? narration} Visual beat ${index + 1} of ${count}.`,
    primarySubject: characterId ? `canonical character ${characterId}` : 'the principal subject of the story',
    characterIds: characterId ? [characterId] : [],
    action: beats[index]?.action ?? (index === 0 ? 'establish the situation with visible motion' : index === count - 1 ? 'complete the transformation and reveal the result' : 'perform one simple physically plausible action'),
    framing: beats[index]?.framing ?? (index % 3 === 0 ? 'medium-wide' : index % 3 === 1 ? 'medium close-up' : 'close detail'),
    camera: beats[index]?.camera ?? (index % 2 === 0 ? 'documentary handheld camera' : 'gentle controlled tracking camera'),
    motion: beats[index]?.motion ?? 'natural real-time motion with readable action',
    emotion: beats[index]?.emotion,
    realismTarget: mode === 'CHARACTER_SERIES' ? 'STYLIZED_REAL' : 'PHOTOREAL',
    styleTarget: mode === 'CHARACTER_SERIES' ? 'consistent original series visual language' : 'believable production footage, no synthetic perfection',
    continuityDependencies: index ? [`match approved generated-shot-${index}`] : [],
    importance: index === 0 ? 'HERO' : index === count - 1 ? 'PAYOFF' : 'UTILITY',
    generationEligible: true,
    sourcePolicy: 'GENERATIVE_ONLY',
    maxCostUsd: null,
    qualityFloor: mode === 'CHARACTER_SERIES' ? 70 : 75,
    referenceRequirements: characterId ? ['canonical character master reference'] : [],
    semanticContract: {
      subject: beats[index]?.subject ?? (characterId ? characterId : 'principal subject'),
      action: beats[index]?.action ?? (index === 0 ? 'establish the situation with visible motion' : index === count - 1 ? 'complete the transformation and reveal the result' : 'perform one simple physically plausible action'),
      object: beats[index]?.object,
      cause: beats[index]?.cause,
      result: beats[index]?.result,
      emotion: beats[index]?.emotion,
      storyBeat: beats[index]?.beatId ?? `beat-${index + 1}`,
    },
  }));
}

async function extractReferenceFrame(assetUri, outputPath) {
  try {
    await mkdir(dirname(outputPath), { recursive: true });
    await execFileAsync('ffmpeg', ['-y', '-ss', '1', '-i', fileURLToPath(assetUri), '-frames:v', '1', '-q:v', '3', outputPath], { windowsHide: true });
    return fileUri(outputPath);
  } catch { return null; }
}

async function localQualityEvaluator(asset, shot, context) {
  let technicalValidity = asset.mimeType.startsWith('video/');
  const technicalIssues = [];
  try {
    const probe = await probeRenderedVideoOnly(fileURLToPath(asset.uri));
    technicalValidity = technicalValidity && probe.hasVideo && probe.durationSeconds + 0.15 >= shot.desiredDurationSeconds;
    if (!probe.hasVideo) technicalIssues.push('NO_VIDEO_STREAM');
    if (probe.durationSeconds + 0.15 < shot.desiredDurationSeconds) technicalIssues.push('GENERATED_CLIP_SHORTER_THAN_SHOT');
    if (probe.freezeDetected) technicalIssues.push('FREEZE_DETECTED');
    if (probe.loopDetected) technicalIssues.push('LOOP_DETECTED');
  } catch (error) {
    technicalValidity = false;
    technicalIssues.push(`FFPROBE_FAILED:${String(error).slice(0, 160)}`);
  }

  const semantic = await evaluateGeneratedClipSemanticQc({
    asset,
    shot,
    characters: context.characters,
    world: context.world,
    visionProvider: context.visionProvider,
    workDir: context.workDir,
    technicalValidity,
    technicalIssues,
  });
  asset.metadata = {
    ...(asset.metadata ?? {}),
    semanticQc: semantic.evidence,
  };
  return semantic.quality;
}

function defaultCharacter(characterId, timestamp, override = null) {
  return { characterId, version: 'v1', name: characterId, visualDescription: `the recurring fictional character identified as ${characterId}`, immutableTraits: [`canonical identity ${characterId}`], mutableTraits: [], proportions: 'stable proportions across episodes', materials: 'consistent production materials and surface texture', eyes: 'consistent eye shape and color', clothing: [], accessories: [], characteristicDetails: [], personality: ['expressive', 'readable'], movementStyle: 'natural physically plausible movement', expressionRules: ['expressions remain recognizable without changing identity'], visualStyle: 'the approved series visual language', referenceAssets: [], continuityConstraints: ['do not change identity, proportions, materials, eyes or characteristic details'], forbiddenChanges: ['identity drift', 'unrequested outfit or anatomy changes'], createdAt: timestamp, updatedAt: timestamp, ...(override ?? {}) };
}

function defaultWorld(worldId, timestamp, override = null) {
  return { worldId, version: 'v1', name: worldId, visualIdentity: 'consistent fictional production environment', architecture: 'stable practical environment appropriate to the story', layout: 'stable spatial layout across shots', colors: ['natural balanced palette'], lighting: 'consistent motivated lighting', weatherDefaults: ['ordinary conditions unless the brief changes them'], props: [], recurringObjects: [], referenceAssets: [], spatialRelationships: [], continuityMetadata: {}, createdAt: timestamp, updatedAt: timestamp, ...(override ?? {}) };
}

async function createGlobalBudgetGuard(path, hardCapUsd, runId) {
  const load = async () => { try { return JSON.parse(await readFile(path, 'utf8')); } catch { return { version: 1, currency: 'USD', hardCapUsd, spentUsd: 0, reservations: [], entries: [] }; } };
  const save = async (state) => writeJson(path, state);
  let state = await load();
  if (Number(state.hardCapUsd) !== Number(hardCapUsd)) throw new Error(`GLOBAL_BUDGET_CAP_MISMATCH:${state.hardCapUsd}:${hardCapUsd}`);
  state.reservations = (state.reservations ?? []).filter((item) => item.runId !== runId);
  await save(state);
  return {
    async reserve(amountUsd, shotId) {
      state = await load();
      const reserved = (state.reservations ?? []).reduce((sum, item) => sum + Number(item.amountUsd || 0), 0);
      if (Number(state.spentUsd || 0) + reserved + amountUsd > hardCapUsd + 1e-9) throw new Error(`GLOBAL_GENERATION_BUDGET_BLOCK:${shotId}`);
      const reservationId = `${runId}-${shotId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      state.reservations = [...(state.reservations ?? []), { reservationId, runId, shotId, amountUsd, createdAt: now() }];
      await save(state);
      return reservationId;
    },
    async settle(reservationId, accountingCostUsd, metadata = {}) {
      state = await load();
      const reservation = (state.reservations ?? []).find((item) => item.reservationId === reservationId);
      if (!reservation) throw new Error(`GLOBAL_BUDGET_RESERVATION_MISSING:${reservationId}`);
      const nextSpent = Number(state.spentUsd || 0) + Number(accountingCostUsd || 0);
      state.reservations = (state.reservations ?? []).filter((item) => item.reservationId !== reservationId);
      state.spentUsd = Number(nextSpent.toFixed(6));
      state.entries = [...(state.entries ?? []), { reservationId, runId, shotId: reservation.shotId, reservedUsd: reservation.amountUsd, accountingCostUsd, actualBillingKnown: Boolean(metadata.actualBillingKnown), accountingBasis: metadata.actualBillingKnown ? 'PROVIDER_REPORTED' : 'ESTIMATED_RESERVATION', settledAt: now() }];
      await save(state);
      if (nextSpent > hardCapUsd + 1e-9) throw new Error(`GLOBAL_GENERATION_HARD_CAP_EXCEEDED:${nextSpent.toFixed(4)}`);
    },
    async snapshot() { state = await load(); return { ...state, remainingUsd: Math.max(0, hardCapUsd - Number(state.spentUsd || 0) - (state.reservations ?? []).reduce((sum, item) => sum + Number(item.amountUsd || 0), 0)) }; },
  };
}

export async function runGenerativeProduction(input) {
  const { runRoot, reportRoot, finalRoot, mode, prompt, scriptPath, durationSeconds, aspectRatio = '16:9', characterId, budgetUsd = null, env = process.env } = input;
  const allowReal = String(env.REAL_GENERATION_ENABLED ?? '').toLowerCase() === 'true';
  if (!allowReal) throw new Error('REAL_GENERATION_DISABLED: set REAL_GENERATION_ENABLED=true explicitly before paid or quota-backed generation');
  const hardBudgetUsd = budgetUsd == null ? null : Number(budgetUsd);
  if (hardBudgetUsd == null || !Number.isFinite(hardBudgetUsd) || hardBudgetUsd <= 0) throw new Error('GENERATION_HARD_BUDGET_REQUIRED: pass --budget before enabling real generation');
  if (hardBudgetUsd > Number(env.GENERATION_MAX_HARD_BUDGET_USD ?? 10)) throw new Error(`GENERATION_HARD_BUDGET_EXCEEDS_GLOBAL_CAP:${hardBudgetUsd}`);
  const store = new NodeLocalObjectStore(join(runRoot, 'storage'));
  const generationProvider = createGenerativeVideoProviderRuntime(store, env);
  const providerRuntime = describeGenerativeVideoRuntime(generationProvider);
  const geminiApiKey = env.GEMINI_API_KEY ?? env.GOOGLE_API_KEY;
  if (!geminiApiKey) throw new Error('GENERATIVE_QUALITY_REVIEW_REQUIRES_GEMINI_API_KEY');
  const visionProvider = new GeminiVisionProvider({ apiKey: geminiApiKey, model: env.GEMINI_VISION_MODEL ?? 'gemini-3.8-flash', endpoint: env.GEMINI_API_BASE_URL || undefined });
  const globalCapUsd = Number(env.GENERATION_GLOBAL_HARD_CAP_USD ?? hardBudgetUsd);
  if (!Number.isFinite(globalCapUsd) || globalCapUsd <= 0 || globalCapUsd > 10) throw new Error(`GENERATION_GLOBAL_HARD_CAP_INVALID:${globalCapUsd}`);
  const globalBudget = await createGlobalBudgetGuard(env.GENERATION_GLOBAL_BUDGET_FILE ?? join(runRoot, 'global-generation-budget.json'), globalCapUsd, input.runId);
  const guardedProvider = {
    name: generationProvider.name,
    capability: generationProvider.capability,
    estimateCost: (request) => generationProvider.estimateCost(request),
    generate: (request) => generationProvider.generate(request),
    generateShot: async (request) => {
      const estimate = generationProvider.estimateCost(request);
      if (estimate.estimatedUsd == null) throw new Error(`GENERATION_PRICE_REQUIRED:${generationProvider.name}`);
      const reservationId = await globalBudget.reserve(estimate.estimatedUsd, String(request.metadata?.shotId ?? 'shot'));
      try {
        const asset = await generationProvider.generateShot(request);
        const failoverAccounting = asset.metadata?.failover?.costAccounting === 'CONSERVATIVE_FAILOVER_RESERVATION_CEILING';
        const providerSaysActual = asset.metadata?.actualBillingKnown === true;
        const actualBillingKnown = providerSaysActual && !failoverAccounting;
        const accountingCost = asset.costUsd ?? estimate.estimatedUsd;
        await globalBudget.settle(reservationId, accountingCost, { actualBillingKnown });
        return {
          ...asset,
          metadata: {
            ...(asset.metadata ?? {}),
            globalBudgetReservationId: reservationId,
            estimatedCostUsd: estimate.estimatedUsd,
            accountingCostUsd: accountingCost,
            actualBillingKnown,
            costBasis: actualBillingKnown ? 'PROVIDER_REPORTED' : failoverAccounting ? 'FAILOVER_RESERVATION_CEILING' : 'ESTIMATED',
          },
        };
      } catch (error) {
        await globalBudget.settle(reservationId, estimate.estimatedUsd, { actualBillingKnown: false });
        throw error;
      }
    },
  };
  const director = new ProductionDirector();
  const requestedMode = mode === 'character-series' ? 'CHARACTER_SERIES' : mode === 'full-generative' ? 'FULL_GENERATIVE' : mode === 'hybrid' ? 'HYBRID_EDITORIAL' : 'GENERATIVE_EDITORIAL';
  const plan = director.createPlan({ requestedMode, prompt, targetDurationSeconds: durationSeconds, aspectRatio, characterSeries: mode === 'character-series', budgetUsd, qualityMode: 'MAX_QUALITY' });
  const brief = await readBrief(scriptPath, prompt);
  const narration = brief.narration;
  const voiceProvider = new GeminiVoiceProvider({ apiKey: geminiApiKey, store, model: env.GEMINI_TTS_MODEL ?? 'gemini-2.5-flash-preview-tts', defaultVoice: env.GEMINI_VOICE_ID ?? 'Kore', protocol: 'generateContent' });
  const voice = await withGeminiWordAlignment(voiceProvider, { apiKey: geminiApiKey, strict: true, minCoverage: 0.88 }).synthesize({ text: narration, voice: env.GEMINI_VOICE_ID ?? 'Kore', language: 'en-US' });
  const shots = buildShots(narration, durationSeconds, plan.mode, characterId, plan.aspectRatio, brief.storyBeats).map(redesignHighRiskShot);
  const creativePreflight = evaluateCreativeQC({ storyBeats: buildStoryBeats(narration, brief.storyBeats), shots, technicalPass: true, humanReviewQualityFloor: plan.qualityMode === 'MAX_QUALITY' ? 75 : 70 });
  await writeJson(join(reportRoot, 'CreativePreflight.json'), creativePreflight);
  if (!creativePreflight.creativePass) throw new Error(`CREATIVE_PREFLIGHT_FAILED:${creativePreflight.reasons.join(',')}`);
  const performancePath = join(runRoot, 'memory', 'generation-performance.json');
  let priorPerformance = [];
  try { priorPerformance = JSON.parse(await readFile(performancePath, 'utf8')); } catch { /* first run */ }
  const performance = new GenerationPerformanceMemory(Array.isArray(priorPerformance) ? priorPerformance : []);
  const cost = new CostOptimizer({ targetUsd: hardBudgetUsd, hardUsd: hardBudgetUsd, spentUsd: 0, reservedUsd: 0, generatedSeconds: 0, acceptedSeconds: 0, rejectedCostUsd: 0, wastedGenerationCostUsd: 0, providerBreakdown: {}, modelBreakdown: {} });
  const maxAttempts = Math.max(1, Math.min(3, Number(env.GENERATION_MAX_ATTEMPTS ?? 3)));
  const orchestrator = new GenerativeProductionOrchestrator({ provider: guardedProvider, performance, cost, repair: new RepairOrchestrator(), promptCompiler: new GenerationPromptCompiler(), maxAttempts });
  const timestamp = now();
  const characterRegistry = new CharacterRegistry(join(runRoot, 'registry', 'characters.json'));
  const worldRegistry = new WorldRegistry(join(runRoot, 'registry', 'worlds.json'));
  const episodeRegistry = new SeriesEpisodeMemoryRegistry(join(runRoot, 'registry', 'episodes.json'));
  const character = characterId ? await characterRegistry.register(defaultCharacter(characterId, timestamp, brief.character)) : null;
  const world = characterId ? await worldRegistry.register(defaultWorld(`${characterId}-world-v1`, timestamp, brief.world)) : null;
  if (characterId) await episodeRegistry.register({ seriesId: characterId, episodeId: input.runId, charactersAppearing: [characterId], outfits: {}, props: [], locations: world ? [world.worldId] : [], storyEvents: [], continuityChanges: [], secondaryCharacters: [], priorEpisodeReferences: [], createdAt: timestamp });
  const shotResults = [];
  const referenceFrames = [];
  for (const shot of shots) {
    const result = await orchestrator.generateShot({
      shot,
      characters: character ? [character] : [],
      world,
      references: { characterAssets: character?.referenceAssets ?? [], worldAssets: world?.referenceAssets ?? [], previousAcceptedShots: shotResults.filter((item) => item.status === 'ACCEPTED').map((item) => item.asset?.uri).filter(Boolean), nextPlannedShots: shots.slice(shots.indexOf(shot) + 1, shots.indexOf(shot) + 2).map((item) => item.visualDescription), styleAssets: referenceFrames.slice(-1), strategy: characterId || referenceFrames.length ? 'MASTER_REFERENCES' : 'NONE' },
      evaluate: async (asset, currentShot) => localQualityEvaluator(asset, currentShot, { visionProvider, characters: character ? [character] : [], world, workDir: join(reportRoot, 'semantic-qc') }),
      mutateForRepair: (currentShot, decision) => decision.strategy === 'SIMPLIFY_ACTION' ? { ...currentShot, action: 'perform one simple, continuous, physically plausible action with clear contact and no fast changes', framing: 'stable medium close-up', camera: 'locked documentary camera with only subtle natural movement', motion: 'slow readable real-time motion', continuityDependencies: [...currentShot.continuityDependencies, `simplified after ${decision.category}`] } : { ...currentShot, continuityDependencies: [...currentShot.continuityDependencies, `repair ${decision.strategy}: ${decision.reason}`] },
    });
    shotResults.push(result);
    if (result.status !== 'ACCEPTED' || !result.asset) {
      await writeJson(join(reportRoot, 'GenerationAttempts.json'), shotResults.flatMap((item) => item.attempts));
      await writeJson(join(reportRoot, 'RepairDecisions.json'), shotResults.flatMap((item) => item.repairDecisions));
      await performance.save(performancePath);
      await writeJson(join(reportRoot, 'CostReport.json'), { ...cost.snapshot(), global: await globalBudget.snapshot(), providerRuntime });
      throw new Error(`GENERATIVE_SHOT_REJECTED:${shot.shotId}`);
    }
    const frame = await extractReferenceFrame(result.asset.uri, join(runRoot, 'references', `${shot.shotId}.jpg`));
    if (frame) referenceFrames.push(frame);
  }
  const assetRegistry = new GeneratedAssetRegistry(new JsonRegistry(join(runRoot, 'registry', 'video-assets.json'), 'id'));
  for (const result of shotResults) await assetRegistry.approve(result.asset);
  const scenes = shotResults.map((result) => ({ id: result.shot.scene, startSec: result.shot.startTime, durationSec: result.shot.desiredDurationSeconds, kind: 'video', instruction: result.shot.visualDescription, generated: true }));
  const assets = shotResults.map((result) => ({ id: result.asset.id, uri: result.asset.uri, mimeType: result.asset.mimeType, provider: result.asset.provider, model: result.asset.model, costUsd: result.asset.costUsd ?? 0, sceneId: result.shot.scene, generated: true, evidenceRole: 'SYNTHETIC_ILLUSTRATION', metadata: { videoOnly: true, mode: plan.mode, shotId: result.shot.shotId, quality: result.finalQuality, attempts: result.attempts, repairs: result.repairDecisions, generationMetadata: result.asset.metadata ?? {} } }));
  assertFinalTimelineIsVideoOnly(scenes.map((scene, index) => ({ id: scene.id, start: scene.startSec, end: scene.startSec + scene.durationSec, kind: 'SYNTHETIC_VIDEO', metadata: { videoOnly: assets[index].metadata.videoOnly, evidenceRole: assets[index].evidenceRole } })));
  const costSnapshot = cost.snapshot();
  const allBillingKnown = assets.length > 0 && assets.every((asset) => asset.metadata.generationMetadata?.actualBillingKnown === true);
  const manifest = { projectId: input.runId, createdAt: now(), finalMediaPolicy: 'VIDEO_ONLY', contentFormat: plan.runtimeProfile === 'SHORT_FORM' ? 'SHORT_VERTICAL' : 'SHORT_HORIZONTAL', aspectRatio, frame: aspectRatio === '9:16' ? { width: 720, height: 1280 } : { width: 1280, height: 720 }, captionPlan: { enabled: true, burnIn: false, source: 'VOICE_ALIGNMENT', preset: 'KARAOKE_BOLD' }, editPlan: { preset: 'GENERATIVE_EDITORIAL', transitionMode: 'HARD_CUT', defaultMotionEffects: [] }, script: { title: prompt, targetDurationSec: durationSeconds, beats: shots.map((shot) => ({ id: shot.scene, narration, purpose: shot.narrativePurpose, startSec: shot.startTime, targetDurationSec: shot.desiredDurationSeconds })) }, scenes, assets, voice: { id: voice.id, uri: voice.uri, mimeType: voice.mimeType, provider: voice.provider, model: voice.model, durationSeconds: voice.durationSeconds, alignment: voice.alignment }, music: null, estimatedCostUsd: costSnapshot.spentUsd, actualCostUsd: allBillingKnown ? costSnapshot.spentUsd : null, containsSyntheticMedia: true };
  await writeJson(join(runRoot, 'timeline', 'MasterTimeline.json'), manifest);
  await writeJson(join(reportRoot, 'GenerationAttempts.json'), shotResults.flatMap((item) => item.attempts));
  await writeJson(join(reportRoot, 'RepairDecisions.json'), shotResults.flatMap((item) => item.repairDecisions));
  await performance.save(performancePath);
  await writeJson(join(reportRoot, 'CostReport.json'), { ...costSnapshot, actualBillingKnown: allBillingKnown, global: await globalBudget.snapshot(), providerRuntime, semanticQcBilling: 'VISION_TOKEN_USAGE_RECORDED_BUT_EXPLICIT_PROVIDER_COST_UNAVAILABLE' });
  await writeJson(join(reportRoot, 'ProductionPlan.json'), plan);
  const renderer = new FfmpegRenderer({ outputRoot: join(runRoot, 'render'), width: manifest.frame.width, height: manifest.frame.height, fps: 30, targetLufs: -16, truePeakDb: -1.5, loudnessRange: 7 });
  const rendered = await renderer.render({ manifestUri: fileUri(join(runRoot, 'timeline', 'MasterTimeline.json')), outputKey: 'generated-v1.mp4' });
  const finalVideo = join(finalRoot, 'video-v1.mp4'); await mkdir(finalRoot, { recursive: true }); const renderedPath = rendered.uri.replace(/^file:\/\//, ''); await writeFile(finalVideo, await readFile(renderedPath));
  const finalProbe = await probeRenderedVideoOnly(finalVideo);
  if (!finalProbe.hasVideo || finalProbe.freezeDetected || finalProbe.loopDetected) throw new Error('FINAL_VIDEO_ONLY_QC_FAILED');
  const creativeQc = evaluateCreativeQC({ storyBeats: buildStoryBeats(narration, brief.storyBeats), shots, technicalPass: Boolean(finalProbe.hasVideo && !finalProbe.freezeDetected && !finalProbe.loopDetected), humanReviewQualityFloor: 75 });
  await writeJson(join(reportRoot, 'CreativeQC.json'), creativeQc);
  if (!creativeQc.creativePass) throw new Error(`CREATIVE_QC_FAILED:${creativeQc.reasons.join(',')}`);
  const pricingBasis = generationProvider.name === 'video-provider-failover' ? 'CONSERVATIVE_FAILOVER_RESERVATION_CEILING' : generationProvider.name === 'gemini-video' ? 'GOOGLE_OFFICIAL_PRICING_DEFAULT_OR_CONFIGURED' : 'PROVIDER_ESTIMATE';
  const report = { version: 1, runId: input.runId, status: 'READY_FOR_HUMAN_REVIEW', mode: plan.mode, output: { video: finalVideo, durationSeconds: finalProbe.durationSeconds }, visualMix: { sourcedSeconds: 0, generatedSeconds: finalProbe.durationSeconds, imageSeconds: 0, graphicSeconds: 0 }, qc: { technical: { videoOnly: true, renderedProbe: finalProbe }, semantic: { provider: visionProvider.name, method: 'temporal-contact-sheet-vision', failClosed: true }, creative: creativeQc, generatedShots: shotResults.length, rejectedAttempts: shotResults.flatMap((item) => item.attempts).filter((item) => item.status !== 'ACCEPTED').length, quality: shotResults.map((item) => ({ shotId: item.shot.shotId, status: item.status, score: item.finalQuality?.score ?? null, method: item.finalQuality?.method ?? null })) }, cost: { ...cost.snapshot(), global: await globalBudget.snapshot(), budgetType: 'HARD', pricingBasis, actualBillingKnown: allBillingKnown, semanticQcBilling: 'VISION_TOKEN_USAGE_RECORDED_BUT_EXPLICIT_PROVIDER_COST_UNAVAILABLE' }, provider: { name: generationProvider.name, model: generationProvider.capability.model ?? null, credentialStatus: generationProvider.capability.credentialStatus, runtime: providerRuntime, selectedProviders: [...new Set(assets.map((asset) => asset.provider))] }, characterId: characterId ?? null, limitations: ['Final human review remains required.', 'Synthetic footage is illustration and never direct documentary evidence.', 'Semantic QC records provider token usage, but explicit vision-review billing is not reported as exact cost.'] };
  await writeJson(join(reportRoot, 'production-run.json'), report);
  return report;
}
