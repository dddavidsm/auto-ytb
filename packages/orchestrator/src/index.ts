import type { ImageProvider, ObjectStore, Publisher, SearchProvider, TextModel, ThumbnailComposer, VideoProvider, VideoRenderer, VoiceProvider } from '@auto-ytb/providers';
import { buildResearchDossier, type ResearchDossier } from '@auto-ytb/editorial';
import { estimateProductionCost, generatePackaging, generateScript, planScenes, type AssetRecord, type ProductionManifest, type ThumbnailAsset } from '@auto-ytb/production';
import { runQa, type QaReport } from '@auto-ytb/qa';

export type PipelineState = 'RESEARCH' | 'SCRIPT' | 'PACKAGING' | 'PLAN' | 'ASSETS' | 'QA' | 'RENDER' | 'PRIVATE_UPLOAD' | 'READY_FOR_REVIEW' | 'BLOCKED';
export type PipelineEvent = { at: string; state: PipelineState; message: string };

export async function runContentPipeline(input: {
  projectId: string;
  topic: string;
  language: string;
  targetDurationSec: number;
  voice: string;
  maxCostUsd: number;
  search: SearchProvider;
  model: TextModel;
  voiceProvider: VoiceProvider;
  imageProvider: ImageProvider;
  videoProvider: VideoProvider;
  thumbnailComposer: ThumbnailComposer;
  store: ObjectStore;
  renderer: VideoRenderer;
  publisher: Publisher;
  autoUploadPrivate?: boolean;
}): Promise<{ state: PipelineState; events: PipelineEvent[]; dossier?: ResearchDossier; manifest?: ProductionManifest; qa?: QaReport; renderUri?: string; externalId?: string }> {
  const events: PipelineEvent[] = [];
  const event = (state: PipelineState, message: string) => events.push({ at: new Date().toISOString(), state, message });

  event('RESEARCH', `Researching ${input.topic}`);
  const dossier = await buildResearchDossier({ topic: input.topic, search: input.search, model: input.model });
  if (dossier.blockingIssues.length || !dossier.recommendedAngleId) {
    event('BLOCKED', `Research blocked: ${dossier.blockingIssues.join('; ')}`);
    return { state: 'BLOCKED', events, dossier };
  }
  const angle = dossier.angles.find((candidate) => candidate.id === dossier.recommendedAngleId)!;

  event('SCRIPT', `Writing script for angle ${angle.title}`);
  const script = await generateScript({ dossier, angle, model: input.model, language: input.language, targetDurationSec: input.targetDurationSec });
  event('PACKAGING', 'Generating title/thumbnail hypotheses');
  const packaging = await generatePackaging({ angle, model: input.model, count: 3 });
  event('PLAN', 'Planning scenes and production cost');
  const scenes = planScenes(script);
  const estimatedCostUsd = estimateProductionCost({ narrationSeconds: input.targetDurationSec, scenes }) + packaging.length * 0.12;

  event('ASSETS', 'Generating narration, scene visuals and thumbnail variants');
  const voice = await input.voiceProvider.synthesize({ text: script.beats.map((beat) => beat.narration).join('\n\n'), voice: input.voice, language: input.language });
  const assets: AssetRecord[] = [];
  for (const scene of scenes.filter((candidate) => candidate.generated)) {
    const generated = scene.kind === 'ai_video'
      ? await input.videoProvider.generate({ prompt: scene.instruction, durationSeconds: Math.min(scene.durationSec, 8), aspectRatio: '16:9' })
      : await input.imageProvider.generate({ prompt: scene.instruction, aspectRatio: '16:9' });
    assets.push({ ...generated, sceneId: scene.id, generated: true, sourceIds: scene.sourceIds });
  }

  const thumbnails: ThumbnailAsset[] = [];
  for (const variant of packaging) {
    const background = await input.imageProvider.generate({
      prompt: `${variant.thumbnailConcept}. YouTube documentary thumbnail background, one dominant focal subject, high visual contrast, uncluttered composition, strong separation between foreground and background, leave intentional negative space for optional typography, no readable text, no fake logos, no watermarks.`,
      aspectRatio: '16:9',
    });
    const composed = await input.thumbnailComposer.compose({
      backgroundUri: background.uri,
      text: variant.thumbnailText,
      outputKey: `${input.projectId}/${variant.id}.jpg`,
    });
    thumbnails.push({ ...composed, packagingId: variant.id, text: variant.thumbnailText, costUsd: (background.costUsd ?? 0) + (composed.costUsd ?? 0) });
  }

  const manifest: ProductionManifest = {
    projectId: input.projectId,
    createdAt: new Date().toISOString(),
    script,
    packaging,
    thumbnails,
    selectedPackagingId: packaging[0]?.id ?? '',
    scenes,
    assets,
    voice,
    estimatedCostUsd,
    actualCostUsd: (voice.costUsd ?? 0) + assets.reduce((sum, asset) => sum + (asset.costUsd ?? 0), 0) + thumbnails.reduce((sum, asset) => sum + (asset.costUsd ?? 0), 0),
    containsSyntheticMedia: scenes.some((scene) => scene.generated),
  };

  event('QA', 'Running factual, provenance, originality, visual coverage, packaging and cost gates');
  const qa = runQa({ dossier, script, manifest, maxCostUsd: input.maxCostUsd });
  if (!qa.passed) {
    event('BLOCKED', `QA blockers: ${qa.blockers.join(', ')}`);
    return { state: 'BLOCKED', events, dossier, manifest, qa };
  }

  const stored = await input.store.put({ key: `projects/${input.projectId}/manifest.json`, contentType: 'application/json', data: JSON.stringify(manifest) });
  event('RENDER', `Rendering from ${stored.uri}`);
  const render = await input.renderer.render({ manifestUri: stored.uri, outputKey: `projects/${input.projectId}/final.mp4` });

  if (!input.autoUploadPrivate) {
    event('READY_FOR_REVIEW', `Render and ${thumbnails.length} thumbnail variants ready for review`);
    return { state: 'READY_FOR_REVIEW', events, dossier, manifest, qa, renderUri: render.uri };
  }

  event('PRIVATE_UPLOAD', 'Uploading private video and selected custom thumbnail');
  const selected = packaging.find((variant) => variant.id === manifest.selectedPackagingId) ?? packaging[0];
  const upload = await input.publisher.uploadPrivate({
    fileUri: render.uri,
    title: selected?.title ?? script.title,
    description: dossier.executiveSummary,
    tags: [],
    language: input.language,
    containsSyntheticMedia: qa.containsSyntheticMedia,
  });
  const selectedThumbnail = thumbnails.find((thumbnail) => thumbnail.packagingId === manifest.selectedPackagingId) ?? thumbnails[0];
  if (selectedThumbnail) await input.publisher.setThumbnail({ externalId: upload.externalId, fileUri: selectedThumbnail.uri });
  event('READY_FOR_REVIEW', `Private upload ${upload.externalId} with custom thumbnail ready for human review`);
  return { state: 'READY_FOR_REVIEW', events, dossier, manifest, qa, renderUri: render.uri, externalId: upload.externalId };
}
