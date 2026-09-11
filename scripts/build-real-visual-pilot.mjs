import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectId = '708059c9-f9fb-4d11-b3f1-43c97996ca81';
const root = resolve('.');
const storage = resolve(root, '.data', 'storage', 'projects', projectId);
const sourceManifest = JSON.parse(await readFile(resolve(storage, 'manifest-v4.json'), 'utf8'));
const visualRoot = resolve(root, 'assets', 'generated-visuals', 'robohand-real-v1');
const visualSequence = [3, 7, 1, 2, 8, 4, 6, 5, 3, 7, 1, 8, 2, 6, 4, 5, 3, 1];

const manifest = structuredClone(sourceManifest);
manifest.version = `${sourceManifest.version ?? '1'}-real-visual-v1`;
manifest.containsSyntheticMedia = true;
manifest.visualTreatment = {
  mode: 'PHOTOREALISTIC_SOURCE_AND_AI_STILLS',
  generatedVisualPolicy: 'REAL_OBJECT_FOOTAGE_ONLY',
  bannedTreatments: ['procedural-object-diagram', 'generic-chart', 'third-party-logo-intro'],
  disclosure: 'AI-generated photographic inserts are used as illustrative reconstructions; source footage retains its original attribution.',
};

for (const [sceneIndex, scene] of manifest.scenes.entries()) {
  const shot = visualSequence[sceneIndex];
  if (!shot) continue;
  const uri = resolve(visualRoot, `shot-${String(shot).padStart(2, '0')}.png`);
  scene.kind = 'ai_image';
  scene.generated = true;
  scene.costTier = 'low';
  scene.selectionReason = 'Photorealistic object/action insert replaces third-party logos, repeated source or schematic cards.';
  scene.sourceIds = [];
  scene.sourceRefs = [];
  const oldAsset = manifest.assets.find((asset) => asset.sceneId === scene.id);
  const asset = {
    id: `ai-real-${scene.id}`,
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
  const position = manifest.assets.findIndex((candidate) => candidate.sceneId === scene.id);
  if (position >= 0) manifest.assets[position] = asset;
  else manifest.assets.push(asset);
}

manifest.selectedPackagingId = manifest.selectedPackagingId ?? manifest.packaging?.[0]?.id;
await writeFile(resolve(storage, 'manifest-v5.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ manifest: resolve(storage, 'manifest-v5.json'), aiImageScenes: manifest.scenes.length, sourceScenes: 0 }, null, 2));
