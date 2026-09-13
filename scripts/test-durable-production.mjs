import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  FileArtifactStore,
  FileDurableProductionStore,
  buildAudioQualityReport,
  buildProductionCostReport,
  buildVisualQualityReport,
  durableInputHash,
  makeDurableRun,
  makeDurableTask,
  resumeProductionRun,
} from '../packages/persistence/dist/index.js';
import { createDefaultProviderRegistry, ProviderHealthCheck, ProviderRouter } from '../packages/providers/dist/index.js';

const root = await mkdtemp(join(tmpdir(), 'auto-ytb-durable-'));
try {
  const runs = new FileDurableProductionStore(join(root, 'runs'));
  const artifacts = new FileArtifactStore(join(root, 'artifacts'));
  const runId = 'durable-fixture-run';
  await runs.createRun(makeDurableRun({ id: runId, videoId: 'video-1', channelId: 'channel-1', format: 'DOCUMENTARY_EXPLAINER', mode: 'DRAFT', budget: 3, estimatedCost: 0.5, configSnapshot: { fixture: true } }));
  const tasks = [
    makeDurableTask({ runId, taskKey: 'script', kind: 'SCRIPT', dependencies: [], inputHash: durableInputHash({ script: 1 }), configHash: durableInputHash({ mode: 'DRAFT' }), estimatedCost: 0 }),
    makeDurableTask({ runId, taskKey: 'scene-1', kind: 'IMAGE', dependencies: ['script'], inputHash: durableInputHash({ scene: 1 }), configHash: durableInputHash({ provider: 'local' }), estimatedCost: 0 }),
    makeDurableTask({ runId, taskKey: 'scene-2', kind: 'IMAGE', dependencies: ['scene-1'], inputHash: durableInputHash({ scene: 2 }), configHash: durableInputHash({ provider: 'local' }), estimatedCost: 0 }),
  ];
  await runs.saveSubtasks(runId, tasks);
  let failOnce = true;
  const execute = async (task) => {
    if (task.taskKey === 'scene-2' && failOnce) { failOnce = false; throw new Error('fixture timeout'); }
    const sourcePath = join(root, 'source', `${task.taskKey}.txt`);
    await mkdir(join(root, 'source'), { recursive: true });
    await writeFile(sourcePath, `${task.taskKey}:${task.inputHash}`, 'utf8');
    const artifact = await artifacts.putFile({ runId, type: task.kind === 'SCRIPT' ? 'SCRIPT' : 'IMAGE', mimeType: 'text/plain', provider: 'fixture-local', model: 'fixture', sourcePath, cost: 0, isDraft: true, isFinal: false });
    return { artifact, providerCall: { provider: 'fixture-local', model: 'fixture', capability: 'IMAGE', status: 'AVAILABLE', requestHash: task.inputHash, cost: 0 }, costEntry: { category: 'IMAGE', provider: 'fixture-local', operation: task.taskKey, estimated: 0, actual: 0, currency: 'USD' } };
  };

  const first = await resumeProductionRun(runId, runs, artifacts, execute);
  assert.equal(first.run.status, 'PARTIAL');
  assert.equal(first.run.resumeFrom, 'scene-2');
  assert.equal(first.subtasks.find((task) => task.taskKey === 'scene-1')?.status, 'COMPLETE');
  assert.equal(first.subtasks.find((task) => task.taskKey === 'scene-2')?.status, 'FAILED');

  const resumed = await resumeProductionRun(runId, runs, artifacts, execute);
  assert.equal(resumed.run.status, 'COMPLETED');
  assert.equal(resumed.subtasks.find((task) => task.taskKey === 'scene-1')?.metadata?.cacheHit, true);
  assert.equal(resumed.subtasks.find((task) => task.taskKey === 'scene-2')?.attempt, 2);
  assert.equal(resumed.subtasks.find((task) => task.taskKey === 'script')?.metadata?.cacheHit, true);

  const sceneOne = resumed.subtasks.find((task) => task.taskKey === 'scene-1');
  const sceneOneArtifact = await artifacts.get(sceneOne.artifactId);
  assert.ok(sceneOneArtifact && await artifacts.isValid(sceneOneArtifact));
  await writeFile(sceneOneArtifact.path, 'corrupted', 'utf8');
  const afterCorruption = await resumeProductionRun(runId, runs, artifacts, execute);
  assert.equal(afterCorruption.run.status, 'COMPLETED');
  assert.equal(afterCorruption.subtasks.find((task) => task.taskKey === 'scene-1')?.metadata?.cacheInvalidated, true);
  assert.equal(afterCorruption.subtasks.find((task) => task.taskKey === 'scene-1')?.attempt, 2);

  const registry = createDefaultProviderRegistry({});
  const health = await new ProviderHealthCheck(registry).check();
  assert.equal(health.find((item) => item.provider === 'gemini')?.capabilities.find((item) => item.capability === 'VIDEO')?.state, 'NO_CREDENTIALS');
  assert.equal(new ProviderRouter(registry).route({ capability: 'VIDEO', qualityTarget: 90 })?.credentialStatus, 'FIXTURE');
  assert.equal(new ProviderRouter(registry).route({ capability: 'TTS' })?.provider, 'windows-sapi-local');

  const audio = buildAudioQualityReport({ voice: { present: true, durationSeconds: 4, normalized: true }, music: { present: true, ducking: true }, sfx: { count: 1, present: true }, clippingProxy: 0, silenceSeconds: 0, issues: [] });
  const visual = buildVisualQualityReport({ checkedScenes: 2, missingArtifacts: [], wrongResolution: [], wrongAspectRatio: [], blackFrameSeconds: 0, corruptArtifacts: [], excessiveStillScenes: [], tooShortScenes: [], timelineGaps: 0, duplicateAssets: [], invalidDurations: [], semanticEvaluation: 'NOT_EVALUATED', issues: [] });
  const cost = buildProductionCostReport({ entries: [{ category: 'IMAGE', estimated: 0.2, actual: 0 }, { category: 'RENDER', estimated: 0.1, actual: 0 }], durationSeconds: 4, sceneCount: 2 });
  assert.equal(audio.status, 'PASS');
  assert.equal(visual.status, 'WARN');
  assert.ok(Math.abs(cost.estimatedTotal - 0.3) < 0.000001);
  assert.equal(JSON.parse(await readFile(join(root, 'runs', runId, 'subtasks.json'), 'utf8')).length, 3);
  console.log('durable production tests: PASS');
} finally {
  await rm(root, { recursive: true, force: true });
}
