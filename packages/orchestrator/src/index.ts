import type { ImageProvider, ObjectStore, Publisher, SearchProvider, TextModel, VideoProvider, VideoRenderer, VoiceProvider } from '@auto-ytb/providers';
import { buildResearchDossier } from '@auto-ytb/editorial';
import { estimateProductionCost, generatePackaging, generateScript, planScenes, type AssetRecord, type ProductionManifest } from '@auto-ytb/production';
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
  store: ObjectStore;
  renderer: VideoRenderer;
  publisher: Publisher;
  autoUploadPrivate?: boolean;
}): Promise<{ state: PipelineState; events: PipelineEvent[]; manifest?: ProductionManifest; qa?: QaReport; externalId?: string }> {
  const events: PipelineEvent[] = [];
  const event = (state: PipelineState, message: string) => events.push({ at: new Date().toISOString(), state, message });

  event('RESEARCH', `Researching ${input.topic}`);
  const dossier = await buildResearchDossier({ topic: input.topic, search: input.search, model: input.model });
  if (dossier.blockingIssues.length || !dossier.recommendedAngleId) {
    event('BLOCKED', `Research blocked: ${dossier.blockingIssues.join('; ')}`);
    return { state: 'BLOCKED', events };
  }
  const angle = dossier.angles.find((candidate) => candidate.id === dossier.recommendedAngleId)!;

  event('SCRIPT', `Writing script for angle ${angle.title}`);
  const script = await generateScript({ dossier, angle, model: input.model, language: input.language, targetDurationSec: input.targetDurationSec });
  event('PACKAGING', 'Generating title/thumbnail hypotheses');
  const packaging = await generatePackaging({ angle, model: input.model, count: 3 });
  event('PLAN', 'Planning scenes and production cost');
  const scenes = planScenes(script);
  const estimatedCostUsd = estimateProductionCost({ narrationSeconds: input.targetDurationSec, scenes });

  event('ASSETS', 'Generating voice and synthetic assets where required');
  const voice = await input.voiceProvider.synthesize({ text: script.beats.map((beat) => beat.narration).join('\n\n'), voice: input.voice, language: input.language });
  const assets: AssetRecord[] = [];
  for (const scene of scenes.filter((candidate) => candidate.generated)) {
    const generated = scene.kind === 'ai_video'
      ? await input.videoProvider.generate({ prompt: scene.instruction, durationSeconds: Math.min(scene.durationSec, 8), aspectRatio: '16:9' })
      : await input.imageProvider.generate({ prompt: scene.instruction, aspectRatio: '16:9' });
    assets.push({ ...generated, sceneId: scene.id, generated: true, sourceIds: scene.sourceIds });
  }

  const manifest: ProductionManifest = {
    projectId: input.projectId,
    createdAt: new Date().toISOString(),
    script,
    packaging,
    selectedPackagingId: packaging[0]?.id ?? '',
    scenes,
    assets,
    voice,
    estimatedCostUsd,
    actualCostUsd: (voice.costUsd ?? 0) + assets.reduce((sum, asset) => sum + (asset.costUsd ?? 0), 0),
    containsSyntheticMedia: scenes.some((scene) => scene.generated),
  };

  event('QA', 'Running factual, provenance, originality, policy and cost gates');
  const qa = runQa({ dossier, script, manifest, maxCostUsd: input.maxCostUsd });
  if (!qa.passed) {
    event('BLOCKED', `QA blockers: ${qa.blockers.join(', ')}`);
    return { state: 'BLOCKED', events, manifest, qa };
  }

  const stored = await input.store.put({ key: `projects/${input.projectId}/manifest.json`, contentType: 'application/json', data: JSON.stringify(manifest) });
  event('RENDER', `Rendering from ${stored.uri}`);
  const render = await input.renderer.render({ manifestUri: stored.uri, outputKey: `projects/${input.projectId}/final.mp4` });

  if (!input.autoUploadPrivate) {
    event('READY_FOR_REVIEW', `Render ready at ${render.uri}`);
    return { state: 'READY_FOR_REVIEW', events, manifest, qa };
  }

  event('PRIVATE_UPLOAD', 'Uploading private video');
  const selected = packaging.find((variant) => variant.id === manifest.selectedPackagingId) ?? packaging[0];
  const upload = await input.publisher.uploadPrivate({
    fileUri: render.uri,
    title: selected?.title ?? script.title,
    description: dossier.executiveSummary,
    tags: [],
    language: input.language,
    containsSyntheticMedia: qa.containsSyntheticMedia,
  });
  event('READY_FOR_REVIEW', `Private upload ${upload.externalId} ready for human review`);
  return { state: 'READY_FOR_REVIEW', events, manifest, qa, externalId: upload.externalId };
}
