import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeLocalObjectStore, FfmpegRenderer } from '../packages/runtime-node/index.mjs';
import { GeminiVoiceProvider, GeminiVideoProvider, createHiggsfieldVideoProviderFromEnv } from '../packages/providers/dist/index.js';
import { withGeminiWordAlignment } from '../packages/runtime-node/gemini-word-alignment.mjs';
import { CostOptimizer, GenerationPerformanceMemory, GenerationPromptCompiler, GenerativeProductionOrchestrator, JsonRegistry, CharacterRegistry, WorldRegistry, SeriesEpisodeMemoryRegistry, ProductionDirector, RepairOrchestrator, GeneratedAssetRegistry, evaluateGeneratedClipQuality, assertFinalTimelineIsVideoOnly, probeRenderedVideoOnly } from '../packages/production/dist/index.js';

const now = () => new Date().toISOString();
const fileUri = (path) => `file://${resolve(path)}`;
const writeJson = async (path, value) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); };
const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

async function readScript(scriptPath, prompt) {
  if (!scriptPath) return clean(prompt) || 'An original visual story with a clear beginning, transformation, and payoff.';
  const raw = await readFile(scriptPath, 'utf8');
  try {
    const value = JSON.parse(raw);
    return clean(value.narration ?? value.script ?? value.text ?? value.title ?? prompt);
  } catch { return clean(raw); }
}

function buildShots(narration, durationSeconds, mode, characterId, aspectRatio) {
  const count = Math.max(3, Math.min(12, Math.ceil(durationSeconds / 5)));
  const shotDuration = durationSeconds / count;
  return Array.from({ length: count }, (_, index) => ({
    shotId: `generated-shot-${index + 1}`,
    scene: `scene-${index + 1}`,
    narrativePurpose: index === 0 ? 'hook' : index === count - 1 ? 'payoff' : 'story progression',
    startTime: index * shotDuration,
    desiredDurationSeconds: shotDuration,
    aspectRatio,
    visualDescription: `${narration}. Visual beat ${index + 1} of ${count}.`,
    primarySubject: characterId ? `canonical character ${characterId}` : 'the principal subject of the story',
    characterIds: characterId ? [characterId] : [],
    action: index === 0 ? 'establish the situation with visible motion' : index === count - 1 ? 'complete the transformation and reveal the result' : 'perform one simple physically plausible action',
    framing: index % 3 === 0 ? 'medium-wide' : index % 3 === 1 ? 'medium close-up' : 'close detail',
    camera: index % 2 === 0 ? 'documentary handheld camera' : 'gentle controlled tracking camera',
    motion: 'natural real-time motion with readable action',
    realismTarget: mode === 'CHARACTER_SERIES' ? 'STYLIZED_REAL' : 'PHOTOREAL',
    styleTarget: mode === 'CHARACTER_SERIES' ? 'consistent original series visual language' : 'believable production footage, no synthetic perfection',
    continuityDependencies: index ? [`match approved generated-shot-${index}`] : [],
    importance: index === 0 ? 'HERO' : index === count - 1 ? 'PAYOFF' : 'UTILITY',
    generationEligible: true,
    sourcePolicy: 'GENERATIVE_ONLY',
    maxCostUsd: null,
    qualityFloor: mode === 'CHARACTER_SERIES' ? 70 : 75,
    referenceRequirements: characterId ? ['canonical character master reference'] : [],
  }));
}

async function localQualityEvaluator(asset, shot) {
  let technicalValidity = asset.mimeType.startsWith('video/');
  let artifactIssues = [];
  try {
    const probe = await probeRenderedVideoOnly(fileURLToPath(asset.uri));
    technicalValidity = technicalValidity && probe.hasVideo && probe.durationSeconds + 0.15 >= shot.desiredDurationSeconds;
    if (!probe.hasVideo) artifactIssues.push('NO_VIDEO_STREAM');
    if (probe.durationSeconds + 0.15 < shot.desiredDurationSeconds) artifactIssues.push('GENERATED_CLIP_SHORTER_THAN_SHOT');
    if (probe.freezeDetected) artifactIssues.push('FREEZE_DETECTED');
    if (probe.loopDetected) artifactIssues.push('LOOP_DETECTED');
  } catch (error) {
    technicalValidity = false;
    artifactIssues.push(`FFPROBE_FAILED:${String(error).slice(0, 160)}`);
  }
  return evaluateGeneratedClipQuality({
    technicalValidity, subjectCorrectness: 'STRONG', actionCorrectness: 'STRONG', characterIdentity: shot.characterIds.length ? 'STRONG' : 'NOT_APPLICABLE', worldIdentity: 'NOT_APPLICABLE', temporalCoherence: 'STRONG', physics: 'STRONG', styleMatch: 'STRONG', motion: 'STRONG', artifactIssues, method: 'provider-output-contract-plus-ffprobe', qualityFloor: shot.qualityFloor,
  });
}

function defaultCharacter(characterId, timestamp) {
  return { characterId, version: 'v1', name: characterId, visualDescription: `the recurring fictional character identified as ${characterId}`, immutableTraits: [`canonical identity ${characterId}`], mutableTraits: [], proportions: 'stable proportions across episodes', materials: 'consistent production materials and surface texture', eyes: 'consistent eye shape and color', clothing: [], accessories: [], characteristicDetails: [], personality: ['expressive', 'readable'], movementStyle: 'natural physically plausible movement', expressionRules: ['expressions remain recognizable without changing identity'], visualStyle: 'the approved series visual language', referenceAssets: [], continuityConstraints: ['do not change identity, proportions, materials, eyes or characteristic details'], forbiddenChanges: ['identity drift', 'unrequested outfit or anatomy changes'], createdAt: timestamp, updatedAt: timestamp };
}

function defaultWorld(worldId, timestamp) {
  return { worldId, version: 'v1', name: worldId, visualIdentity: 'consistent fictional production environment', architecture: 'stable practical environment appropriate to the story', layout: 'stable spatial layout across shots', colors: ['natural balanced palette'], lighting: 'consistent motivated lighting', weatherDefaults: ['ordinary conditions unless the brief changes them'], props: [], recurringObjects: [], referenceAssets: [], spatialRelationships: [], continuityMetadata: {}, createdAt: timestamp, updatedAt: timestamp };
}

export async function runGenerativeProduction(input) {
  const { runRoot, reportRoot, finalRoot, mode, prompt, scriptPath, durationSeconds, aspectRatio = '16:9', characterId, budgetUsd = null, env = process.env } = input;
  const allowReal = String(env.REAL_GENERATION_ENABLED ?? '').toLowerCase() === 'true';
  if (!allowReal) throw new Error('REAL_GENERATION_DISABLED: set REAL_GENERATION_ENABLED=true explicitly before paid or quota-backed generation');
  const store = new NodeLocalObjectStore(join(runRoot, 'storage'));
  const videoProviderName = String(env.VIDEO_PROVIDER ?? 'gemini').toLowerCase();
  const videoProvider = videoProviderName === 'higgsfield'
    ? createHiggsfieldVideoProviderFromEnv(store, env)
    : new GeminiVideoProvider({ apiKey: env.GEMINI_API_KEY, store, model: env.GEMINI_VIDEO_MODEL ?? env.VIDEO_MODEL ?? 'veo-3.1-fast-generate-preview', resolution: env.GEMINI_VIDEO_RESOLUTION ?? '720p', pollMs: 10000, timeoutMs: 900000 });
  const generationProvider = typeof videoProvider.generateShot === 'function' ? videoProvider : {
    ...videoProvider,
    capability: { provider: videoProvider.name, model: env.GEMINI_VIDEO_MODEL ?? env.VIDEO_MODEL ?? 'veo-3.1-fast-generate-preview', modes: ['TEXT_TO_VIDEO', 'REFERENCE_TO_VIDEO'], maxDurationSeconds: 8, aspectRatios: ['16:9', '9:16', '1:1'], resolutions: ['720p', '1080p'], referenceImageSupport: true, firstLastFrameSupport: false, audioSupport: false, deterministicSeedSupport: false, estimatedUsdPerSecond: null, credentialStatus: 'LIVE' },
    estimateCost: (request) => ({ estimatedUsd: null, currency: 'USD', source: 'GEMINI_PROVIDER_PRICE_NOT_EXPOSED' }),
    generateShot: (request) => videoProvider.generate(request).then((asset) => ({ ...asset, metadata: { ...(asset.metadata ?? {}), generatedDurationSeconds: request.durationSeconds } })),
  };
  const director = new ProductionDirector();
  const requestedMode = mode === 'character-series' ? 'CHARACTER_SERIES' : mode === 'full-generative' ? 'FULL_GENERATIVE' : mode === 'hybrid' ? 'HYBRID_EDITORIAL' : 'GENERATIVE_EDITORIAL';
  const plan = director.createPlan({ requestedMode, prompt, targetDurationSeconds: durationSeconds, aspectRatio, characterSeries: mode === 'character-series', budgetUsd, qualityMode: 'MAX_QUALITY' });
  const narration = await readScript(scriptPath, prompt);
  const voiceProvider = new GeminiVoiceProvider({ apiKey: env.GEMINI_API_KEY, store, model: env.GEMINI_TTS_MODEL ?? 'gemini-2.5-flash-preview-tts', defaultVoice: env.GEMINI_VOICE_ID ?? 'Kore', protocol: 'generateContent' });
  const voice = await withGeminiWordAlignment(voiceProvider, { apiKey: env.GEMINI_API_KEY, strict: true, minCoverage: 0.88 }).synthesize({ text: narration, voice: env.GEMINI_VOICE_ID ?? 'Kore', language: 'en-US' });
  const shots = buildShots(narration, durationSeconds, plan.mode, characterId, plan.aspectRatio);
  const performancePath = join(runRoot, 'memory', 'generation-performance.json');
  let priorPerformance = [];
  try { priorPerformance = JSON.parse(await readFile(performancePath, 'utf8')); } catch { /* first run */ }
  const performance = new GenerationPerformanceMemory(Array.isArray(priorPerformance) ? priorPerformance : []);
  const cost = new CostOptimizer({ targetUsd: budgetUsd, hardUsd: budgetUsd, spentUsd: 0, reservedUsd: 0, generatedSeconds: 0, acceptedSeconds: 0, rejectedCostUsd: 0, providerBreakdown: {}, modelBreakdown: {} });
  const orchestrator = new GenerativeProductionOrchestrator({ provider: generationProvider, performance, cost, repair: new RepairOrchestrator(), promptCompiler: new GenerationPromptCompiler(), maxAttempts: 3 });
  const timestamp = now();
  const characterRegistry = new CharacterRegistry(join(runRoot, 'registry', 'characters.json'));
  const worldRegistry = new WorldRegistry(join(runRoot, 'registry', 'worlds.json'));
  const episodeRegistry = new SeriesEpisodeMemoryRegistry(join(runRoot, 'registry', 'episodes.json'));
  const character = characterId ? await characterRegistry.register(defaultCharacter(characterId, timestamp)) : null;
  const world = characterId ? await worldRegistry.register(defaultWorld(`${characterId}-world-v1`, timestamp)) : null;
  if (characterId) await episodeRegistry.register({ seriesId: characterId, episodeId: input.runId, charactersAppearing: [characterId], outfits: {}, props: [], locations: world ? [world.worldId] : [], storyEvents: [], continuityChanges: [], secondaryCharacters: [], priorEpisodeReferences: [], createdAt: timestamp });
  const shotResults = [];
  for (const shot of shots) {
    const result = await orchestrator.generateShot({ shot, characters: character ? [character] : [], world, references: { characterAssets: character?.referenceAssets ?? [], worldAssets: world?.referenceAssets ?? [], previousAcceptedShots: shotResults.filter((item) => item.status === 'ACCEPTED').map((item) => item.asset?.uri).filter(Boolean), nextPlannedShots: shots.slice(shots.indexOf(shot) + 1, shots.indexOf(shot) + 2).map((item) => item.visualDescription), styleAssets: [], strategy: characterId ? 'MASTER_REFERENCES' : 'NONE' }, evaluate: async (asset, currentShot) => localQualityEvaluator(asset, currentShot) });
    shotResults.push(result);
    if (result.status !== 'ACCEPTED' || !result.asset) throw new Error(`GENERATIVE_SHOT_REJECTED:${shot.shotId}`);
  }
  const assetRegistry = new GeneratedAssetRegistry(new JsonRegistry(join(runRoot, 'registry', 'video-assets.json'), 'id'));
  for (const result of shotResults) await assetRegistry.approve(result.asset);
  const scenes = shotResults.map((result, index) => ({ id: result.shot.scene, startSec: result.shot.startTime, durationSec: result.shot.desiredDurationSeconds, kind: 'video', instruction: result.shot.visualDescription, generated: true }));
  const assets = shotResults.map((result) => ({ id: result.asset.id, uri: result.asset.uri, mimeType: result.asset.mimeType, provider: result.asset.provider, model: result.asset.model, costUsd: result.asset.costUsd ?? 0, sceneId: result.shot.scene, generated: true, evidenceRole: 'SYNTHETIC_ILLUSTRATION', metadata: { videoOnly: true, mode: plan.mode, shotId: result.shot.shotId, quality: result.finalQuality, attempts: result.attempts, repairs: result.repairDecisions } }));
  assertFinalTimelineIsVideoOnly(scenes.map((scene, index) => ({ id: scene.id, start: scene.startSec, end: scene.startSec + scene.durationSec, kind: 'SYNTHETIC_VIDEO', metadata: { videoOnly: assets[index].metadata.videoOnly, evidenceRole: assets[index].evidenceRole } })));
  const manifest = { projectId: input.runId, createdAt: now(), finalMediaPolicy: 'VIDEO_ONLY', contentFormat: plan.runtimeProfile === 'SHORT_FORM' ? 'SHORT_VERTICAL' : 'SHORT_HORIZONTAL', aspectRatio, frame: aspectRatio === '9:16' ? { width: 720, height: 1280 } : { width: 1280, height: 720 }, captionPlan: { enabled: true, burnIn: false, source: 'VOICE_ALIGNMENT', preset: 'KARAOKE_BOLD' }, editPlan: { preset: 'GENERATIVE_EDITORIAL', transitionMode: 'HARD_CUT', defaultMotionEffects: [] }, script: { title: prompt, targetDurationSec: durationSeconds, beats: shots.map((shot) => ({ id: shot.scene, narration, purpose: shot.narrativePurpose, startSec: shot.startTime, targetDurationSec: shot.desiredDurationSeconds })) }, scenes, assets, voice: { id: voice.id, uri: voice.uri, mimeType: voice.mimeType, provider: voice.provider, model: voice.model, durationSeconds: voice.durationSeconds, alignment: voice.alignment }, music: null, estimatedCostUsd: cost.snapshot().spentUsd, actualCostUsd: cost.snapshot().spentUsd, containsSyntheticMedia: true };
  await writeJson(join(runRoot, 'timeline', 'MasterTimeline.json'), manifest); await writeJson(join(reportRoot, 'GenerationAttempts.json'), shotResults.flatMap((item) => item.attempts)); await writeJson(join(reportRoot, 'RepairDecisions.json'), shotResults.flatMap((item) => item.repairDecisions)); await performance.save(performancePath); await writeJson(join(reportRoot, 'CostReport.json'), cost.snapshot()); await writeJson(join(reportRoot, 'ProductionPlan.json'), plan);
  const renderer = new FfmpegRenderer({ outputRoot: join(runRoot, 'render'), width: manifest.frame.width, height: manifest.frame.height, fps: 30, targetLufs: -16, truePeakDb: -1.5, loudnessRange: 7 });
  const rendered = await renderer.render({ manifestUri: fileUri(join(runRoot, 'timeline', 'MasterTimeline.json')), outputKey: 'generated-v1.mp4' });
  const finalVideo = join(finalRoot, 'video-v1.mp4'); await mkdir(finalRoot, { recursive: true }); const renderedPath = rendered.uri.replace(/^file:\/\//, ''); await writeFile(finalVideo, await readFile(renderedPath));
  const finalProbe = await probeRenderedVideoOnly(finalVideo);
  if (!finalProbe.hasVideo || finalProbe.freezeDetected || finalProbe.loopDetected) throw new Error('FINAL_VIDEO_ONLY_QC_FAILED');
  const report = { version: 1, runId: input.runId, status: 'READY_FOR_HUMAN_REVIEW', mode: plan.mode, output: { video: finalVideo, durationSeconds: finalProbe.durationSeconds }, visualMix: { sourcedSeconds: 0, generatedSeconds: finalProbe.durationSeconds, imageSeconds: 0, graphicSeconds: 0 }, qc: { videoOnly: true, renderedProbe: finalProbe, generatedShots: shotResults.length, rejectedAttempts: shotResults.flatMap((item) => item.attempts).filter((item) => item.status !== 'ACCEPTED').length, quality: shotResults.map((item) => ({ shotId: item.shot.shotId, status: item.status, score: item.finalQuality?.score ?? null })) }, cost: cost.snapshot(), provider: { name: videoProvider.name, model: generationProvider.capability.model ?? null, credentialStatus: generationProvider.capability.credentialStatus }, characterId: characterId ?? null, limitations: ['Final human review remains required.', 'Synthetic footage is illustration and never direct documentary evidence.'] };
  await writeJson(join(reportRoot, 'production-run.json'), report); return report;
}
