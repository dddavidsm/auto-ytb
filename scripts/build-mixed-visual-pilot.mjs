import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectId = '708059c9-f9fb-4d11-b3f1-43c97996ca81';
const root = resolve('.');
const storage = resolve(root, '.data', 'storage', 'projects', projectId);
const base = JSON.parse(await readFile(resolve(storage, 'manifest-v4.json'), 'utf8'));
const visualRoot = resolve(root, 'assets', 'generated-visuals', 'robohand-real-v1');
const retainedSourceScenes = new Set(['beat_2-s1', 'beat_2-s2', 'beat_3-s1']);
const visualSequence = [3, 7, 1, 2, 8, 4, 6, 5, 3, 7, 1, 8, 2, 6, 4, 5, 8, 1];
const manifest = structuredClone(base);
manifest.version = `${base.version ?? '1'}-mixed-real-v1`;
manifest.containsSyntheticMedia = true;
manifest.visualTreatment = {
  mode: 'MIXED_MEDIA_DOCUMENTARY',
  sourceCadence: 'licensed-action-footage-interleaved-with-photorealistic-inserts',
  generatedVisualPolicy: 'REAL_OBJECT_FOOTAGE_ONLY',
  bannedTreatments: ['procedural-object-diagram', 'generic-chart', 'third-party-logo-intro'],
  disclosure: 'AI-generated photographic inserts are illustrative reconstructions; retained source footage remains attributed and rights-cleared for review.',
};

for (const [sceneIndex, scene] of manifest.scenes.entries()) {
  if (retainedSourceScenes.has(scene.id)) continue;
  const shot = visualSequence[sceneIndex];
  const uri = resolve(visualRoot, `shot-${String(shot).padStart(2, '0')}.png`);
  const oldAsset = manifest.assets.find((asset) => asset.sceneId === scene.id);
  scene.kind = 'ai_image';
  scene.generated = true;
  scene.costTier = 'low';
  scene.selectionReason = 'Mixed-media policy selects a photorealistic object/action insert between rights-cleared source-action shots.';
  scene.sourceIds = [];
  scene.sourceRefs = [];
  const asset = {
    id: `ai-mixed-${scene.id}`,
    uri,
    mimeType: 'image/png',
    provider: 'openai-image',
    model: 'gpt-image-2',
    costUsd: 0,
    sceneId: scene.id,
    generated: true,
    sourceIds: [],
    license: 'original-generated',
    metadata: {
      kind: 'ai_image',
      syntheticSource: true,
      syntheticDisclosure: 'AI-generated photorealistic illustrative insert',
      rightsStatus: 'ORIGINAL_GENERATED',
      shotNumber: shot,
      replacesAssetId: oldAsset?.id ?? null,
      motionTreatment: 'restrained-documentary-shot',
    },
  };
  const position = manifest.assets.findIndex((assetCandidate) => assetCandidate.sceneId === scene.id);
  if (position >= 0) manifest.assets[position] = asset;
  else manifest.assets.push(asset);
}

await writeFile(resolve(storage, 'manifest-v6.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ manifest: resolve(storage, 'manifest-v6.json'), aiImageScenes: manifest.scenes.length - retainedSourceScenes.size, sourceScenes: retainedSourceScenes.size }, null, 2));
