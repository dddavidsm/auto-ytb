import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CostOptimizer,
  GenerationPerformanceMemory,
  GenerationPromptCompiler,
  ProductionDirector,
  RepairOrchestrator,
  CharacterRegistry,
  WorldRegistry,
  assertFinalTimelineIsVideoOnly,
  assertFinalTimelineVideoOnly,
} from '../packages/production/dist/index.js';
import { HiggsfieldVideoProvider } from '../packages/providers/dist/index.js';

const root = await mkdtemp(join(tmpdir(), 'auto-ytb-generative-cutover-'));
try {
  const director = new ProductionDirector();
  const full = director.createPlan({ requestedMode: 'FULL_GENERATIVE', prompt: 'an original short story', targetDurationSeconds: 30 });
  assert.equal(full.sourcePolicy, 'GENERATIVE_ONLY');
  assert.equal(full.allowExternalSourcing, false);
  assert.equal(full.finalMediaPolicy, 'VIDEO_ONLY');
  const series = director.createPlan({ requestedMode: 'CHARACTER_SERIES', prompt: 'a recurring fictional character episode', targetDurationSeconds: 30, characterSeries: true });
  assert.equal(series.requireCharacterContinuity, true);
  const sourced = director.createPlan({ requestedMode: 'FOOTAGE_PRO', prompt: 'a researched documentary', targetDurationSeconds: 80 });
  assert.equal(sourced.sourcePolicy, 'RETRIEVAL_FIRST');

  assert.equal(assertFinalTimelineVideoOnly([{ id: 'real', kind: 'REAL_VIDEO', start: 0, end: 1, uri: 'file:///real.mp4' }]).status, 'PASS');
  assert.throws(() => assertFinalTimelineIsVideoOnly([{ id: 'still', kind: 'IMAGE', start: 0, end: 1 }]), /VIDEO_ONLY_GATE_FAILED/);
  assert.throws(() => assertFinalTimelineIsVideoOnly([{ id: 'synthetic', kind: 'SYNTHETIC_VIDEO', start: 0, end: 1, metadata: { videoOnly: true, evidenceRole: 'DIRECT_EVIDENCE' } }]), /DIRECT_EVIDENCE/);

  const character = { characterId: 'test-character-v1', version: 'v1', name: 'Test Character', visualDescription: 'a fictional blue fox with a white tail tip', immutableTraits: ['blue fur'], mutableTraits: [], proportions: 'small and upright', materials: 'soft fur', eyes: 'large brown eyes', clothing: [], accessories: [], characteristicDetails: ['white tail tip'], personality: ['curious'], movementStyle: 'light realistic motion', expressionRules: ['keep the same face'], visualStyle: 'photoreal storybook', referenceAssets: [], continuityConstraints: ['same identity'], forbiddenChanges: ['different fur color'], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const characters = new CharacterRegistry(join(root, 'characters.json'));
  await characters.register(character);
  assert.equal((await characters.get(character.characterId))?.visualDescription, character.visualDescription);
  await assert.rejects(() => characters.register({ ...character, visualDescription: 'a different character' }), /CHARACTER_IDENTITY_DRIFT/);
  const worlds = new WorldRegistry(join(root, 'worlds.json'));
  const world = { worldId: 'test-home-v1', version: 'v1', name: 'Test Home', visualIdentity: 'warm home', architecture: 'one room', layout: 'stable', colors: ['warm'], lighting: 'soft', weatherDefaults: ['clear'], props: [], recurringObjects: [], referenceAssets: [], spatialRelationships: [], continuityMetadata: {}, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  await worlds.register(world);
  assert.equal((await worlds.get(world.worldId))?.layout, 'stable');

  const prompt = new GenerationPromptCompiler().compile({ shotId: 's1', scene: 'scene-1', narrativePurpose: 'hook', startTime: 0, desiredDurationSeconds: 4, visualDescription: 'the character enters the room', primarySubject: 'Test Character', characterIds: [character.characterId], action: 'walks into the room', framing: 'medium', camera: 'tripod documentary', motion: 'gentle track', realismTarget: 'PHOTOREAL', styleTarget: 'natural', continuityDependencies: [], importance: 'HERO', generationEligible: true, sourcePolicy: 'GENERATIVE_ONLY', maxCostUsd: 1, qualityFloor: 75, referenceRequirements: [] }, [character], world, { characterAssets: [], worldAssets: [], previousAcceptedShots: [], nextPlannedShots: [], styleAssets: [], strategy: 'NONE' });
  assert.match(prompt, /blue fox/);
  assert.match(prompt, /Test Home/);
  assert.match(prompt, /no frozen frame/);

  const performance = new GenerationPerformanceMemory();
  for (let index = 0; index < 10; index += 1) performance.record({ provider: 'cheap', model: 'a', shotType: 'hook', accepted: index < 3, usableSeconds: index < 3 ? 3 : 0, costUsd: 0.1, latencyMs: 100, quality: index < 3 ? 80 : 50 });
  for (let index = 0; index < 10; index += 1) performance.record({ provider: 'reliable', model: 'b', shotType: 'hook', accepted: index < 9, usableSeconds: index < 9 ? 3 : 0, costUsd: 0.2, latencyMs: 120, quality: index < 9 ? 88 : 50 });
  assert.equal(performance.rank([{ provider: 'cheap', model: 'a', estimatedCostUsd: 0.1 }, { provider: 'reliable', model: 'b', estimatedCostUsd: 0.2 }], 'hook')[0].provider, 'reliable');

  const ledger = new CostOptimizer({ targetUsd: 1, hardUsd: 1, spentUsd: 0, reservedUsd: 0, generatedSeconds: 0, acceptedSeconds: 0, rejectedCostUsd: 0, providerBreakdown: {}, modelBreakdown: {} });
  ledger.reserve(0.2, 'hero');
  ledger.settle({ provider: 'reliable', model: 'b', costUsd: 0.2, generatedSeconds: 4, acceptedSeconds: 4, accepted: true });
  assert.equal(ledger.snapshot().costPerAcceptedUsableSecond, 0.05);
  assert.throws(() => ledger.reserve(0.9, 'over-budget'), /BUDGET_BLOCK/);

  const repair = new RepairOrchestrator().decide({ mode: 'FULL_GENERATIVE', quality: { technicalValidity: true, subjectCorrectness: 'STRONG', actionCorrectness: 'WEAK', characterIdentity: 'NOT_APPLICABLE', worldIdentity: 'NOT_APPLICABLE', temporalCoherence: 'STRONG', physics: 'WEAK', styleMatch: 'STRONG', motion: 'STRONG', artifactIssues: ['PHYSICS'], method: 'fixture', score: 60, accepted: false, rejectionReasons: ['PHYSICS'] }, attemptNumber: 1, maxAttempts: 3, estimatedCostUsd: 0.2, hasReferences: false, retrievalAllowed: false });
  assert.equal(repair.strategy, 'SIMPLIFY_ACTION');
  const temporalRepair = new RepairOrchestrator().decide({ mode: 'CHARACTER_SERIES', quality: { technicalValidity: true, subjectCorrectness: 'STRONG', actionCorrectness: 'STRONG', characterIdentity: 'STRONG', worldIdentity: 'STRONG', temporalCoherence: 'WEAK', physics: 'STRONG', styleMatch: 'STRONG', motion: 'WEAK', artifactIssues: ['FREEZE_DETECTED'], method: 'fixture', score: 70, accepted: false, rejectionReasons: ['FREEZE_DETECTED'] }, attemptNumber: 1, maxAttempts: 3, estimatedCostUsd: 0.4, hasReferences: true, retrievalAllowed: false });
  assert.equal(temporalRepair.strategy, 'SIMPLIFY_ACTION');
  assert.equal(new RepairOrchestrator().decide({ mode: 'FULL_GENERATIVE', quality: { technicalValidity: false, subjectCorrectness: 'WEAK', actionCorrectness: 'WEAK', characterIdentity: 'NOT_APPLICABLE', worldIdentity: 'NOT_APPLICABLE', temporalCoherence: 'WEAK', physics: 'NOT_APPLICABLE', styleMatch: 'WEAK', motion: 'WEAK', artifactIssues: ['PROVIDER'], method: 'fixture', score: 0, accepted: false, rejectionReasons: ['PROVIDER'] }, attemptNumber: 3, maxAttempts: 3, estimatedCostUsd: 0.2, hasReferences: false, retrievalAllowed: false }).strategy, 'ABORT');

  const stored = [];
  const requests = [];
  const provider = new HiggsfieldVideoProvider({ credentials: 'test-id:test-secret', store: { name: 'fixture', put: async (input) => { stored.push(input); return { uri: `file:///tmp/${stored.length}.mp4`, bytes: input.data.length }; } }, fetchFn: async (url, options = {}) => { requests.push({ url: String(url), options }); if (String(url).endsWith('/status')) return new Response(JSON.stringify({ status: 'completed', video: 'https://cdn.example/video.mp4' }), { status: 200 }); if (String(url).includes('cdn.example')) return new Response(new Uint8Array([0, 1, 2]), { status: 200 }); return new Response(JSON.stringify({ request_id: 'request-1' }), { status: 200 }); }, pollMs: 0, timeoutMs: 1000 });
  const generated = await provider.generateShot({ prompt: 'a simple moving test shot', durationSeconds: 3, aspectRatio: '16:9' });
  assert.equal(generated.provider, 'higgsfield');
  assert.equal(stored.length, 1);
  assert.equal(requests[0].url, 'https://api.higgsfield.ai/wan/v2.7/text-to-video');
  assert.match(requests[0].options.headers.authorization, /^Key test-id:test-secret$/);
  assert.equal(provider.capability.referenceImageSupport, false);
  console.log('generative cutover tests passed');
} finally {
  await rm(root, { recursive: true, force: true });
}
