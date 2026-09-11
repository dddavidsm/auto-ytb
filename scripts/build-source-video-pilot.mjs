import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectId = '708059c9-f9fb-4d11-b3f1-43c97996ca81';
const root = resolve('.');
const storage = resolve(root, '.data', 'storage', 'projects', projectId);
const sourceUri = resolve(root, 'assets', 'source-footage', 'robohand-ccby25-480p.webm');
const sourceUrl = 'https://commons.wikimedia.org/wiki/File:Robohand_--_3D_Printing_Mechanical_Hands.webm';
const base = JSON.parse(await readFile(resolve(storage, 'manifest-v4.json'), 'utf8'));
const manifest = structuredClone(base);

// The supplied master contains many interviews, title cards and logos. These
// are hand-curated action windows: printer, parts, assembly and real use.
// Each scene remains a video asset; no still, chart or procedural fallback is
// allowed in this pilot.
const clipStarts = [
  100.0, 102.5, 129.0, 141.0, 271.0, 274.0, 284.5, 287.5,
  298.0, 299.3, 405.0, 407.0, 429.0, 590.0, 592.5, 594.0,
  595.5, 595.5,
];
const sourceTitle = 'Robohand — 3D Printing Mechanical Hands (curated action footage)';

manifest.version = `${base.version ?? '1'}-source-video-v1`;
manifest.containsSyntheticMedia = false;
manifest.visualTreatment = {
  mode: 'SOURCE_VIDEO_ONLY_DOCUMENTARY',
  sourceCadence: 'curated-original-source-action-windows',
  generatedVisualPolicy: 'DISABLED',
  allowedTreatments: ['licensed-source-video', 'meaningful-hard-cuts', 'stable-center-crop'],
  bannedTreatments: ['ai-image', 'ai-video', 'procedural-visualizer', 'generic-chart', 'logo-intro', 'frozen-frame'],
  disclosure: 'All visual scenes in this candidate are transformed excerpts from the rights-cleared original source video.',
};
manifest.sourceFootage = [{
  id: 'robohand-original-master',
  uri: sourceUri,
  title: sourceTitle,
  sourceUrl,
  sourceId: 'robohand-ccby25',
  license: 'CC BY 2.5',
  rightsStatus: 'CLEARED',
  cropMode: 'CENTER',
}];

manifest.scenes = manifest.scenes.map((scene, index) => ({
  ...scene,
  kind: 'broll',
  generated: false,
  costTier: 'free',
  sourceFootageId: 'robohand-original-master',
  sourceIds: ['robohand-ccby25'],
  sourceRefs: [{
    sourceType: 'licensed_video',
    sourceId: 'robohand-ccby25',
    title: sourceTitle,
    url: sourceUrl,
    policy: 'CLEARED',
  }],
  selectionReason: `Original source action window ${index + 1}/18: use the observable object, assembly or real-world test to illustrate this sentence.`,
  instruction: `${scene.visualIntent}. Use only the curated original source footage for this shot; preserve real motion and cut on visible action, not on a decorative transition.`,
}));

manifest.assets = manifest.scenes.map((scene, index) => {
  const clipStartSec = clipStarts[index];
  const clipEndSec = clipStartSec + Number(scene.durationSec) + 0.35;
  return {
    id: `source-video-${scene.id}`,
    uri: sourceUri,
    mimeType: 'video/webm',
    provider: 'user-source-footage',
    model: 'source-video-curation-v1',
    costUsd: 0,
    sceneId: scene.id,
    generated: false,
    sourceIds: ['robohand-ccby25'],
    sourceUrl,
    license: 'CC BY 2.5',
    metadata: {
      kind: 'broll',
      sourceFootageId: 'robohand-original-master',
      title: sourceTitle,
      rightsStatus: 'CLEARED',
      clipStartSec,
      clipEndSec,
      cropMode: 'CENTER',
      sourceId: 'robohand-ccby25',
      sourceRefs: scene.sourceRefs,
      instruction: scene.instruction,
      windowStrategy: 'curated-action-only-source-windows-v1',
    },
  };
});

manifest.editPlan = {
  ...manifest.editPlan,
  preset: 'SOURCE_DOCUMENTARY',
  transitionMode: 'HARD_CUT_ON_ACTION',
  transitionDurationSeconds: 0,
  filmLook: false,
  punchInAnchors: false,
  preserveAudioTiming: true,
};
manifest.renderExecution = {
  ...(manifest.renderExecution ?? {}),
  captionsBurned: true,
  captionPreset: manifest.captionPlan?.preset ?? 'EDITORIAL_CLEAN',
  editPreset: 'SOURCE_DOCUMENTARY',
  transitionsApplied: 0,
  transitionsSkipped: 0,
  transitionFallback: 'NONE',
  punchInsApplied: 0,
  filmLookApplied: false,
};

await writeFile(resolve(storage, 'manifest-source-v2.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({
  manifest: resolve(storage, 'manifest-source-v2.json'),
  sceneCount: manifest.scenes.length,
  videoOnly: manifest.scenes.every((scene) => scene.kind === 'broll' && !scene.generated),
  sourceUri,
  clipWindows: clipStarts.length,
}, null, 2));
