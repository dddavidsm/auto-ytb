import type { ImageProvider, ObjectStore, Publisher, SearchProvider, TextModel, ThumbnailComposer, VideoProvider, VideoRenderer, VoiceProvider } from '@auto-ytb/providers';
import { buildResearchDossier, type ResearchDossier } from '@auto-ytb/editorial';
import { estimateProductionCost, generatePackaging, generateScript, planScenes, selectPackagingWithExploration, type AssetRecord, type PackagingLearningProfile, type ProductionContentFormat, type ProductionManifest, type ThumbnailAsset } from '@auto-ytb/production';
import { runQa, type QaReport } from '@auto-ytb/qa';

export type PipelineState = 'RESEARCH' | 'SCRIPT' | 'PACKAGING' | 'PLAN' | 'ASSETS' | 'QA' | 'RENDER' | 'PRIVATE_UPLOAD' | 'READY_FOR_REVIEW' | 'BLOCKED';
export type PipelineEvent = { at: string; state: PipelineState; message: string };

export async function runContentPipeline(input: {
  projectId: string;
  topic: string;
  language: string;
  contentFormat?: ProductionContentFormat;
  targetDurationSec: number;
  targetSceneDurationSec?: number;
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
  packagingGuidance?: string;
  scriptGuidance?: string;
  packagingLearning?: PackagingLearningProfile;
}): Promise<{ state: PipelineState; events: PipelineEvent[]; dossier?: ResearchDossier; manifest?: ProductionManifest; qa?: QaReport; renderUri?: string; externalId?: string }> {
  const events: PipelineEvent[] = [];
  const event = (state: PipelineState, message: string) => events.push({ at: new Date().toISOString(), state, message });
  const contentFormat = input.contentFormat ?? 'LONG_HORIZONTAL';
  const isShort = contentFormat === 'SHORT_VERTICAL';
  const aspectRatio = isShort ? '9:16' as const : '16:9' as const;
  const frame = isShort ? { width:1080,height:1920 } : { width:1920,height:1080 };

  event('RESEARCH', `Researching ${input.topic} for ${contentFormat}`);
  const dossier = await buildResearchDossier({ topic: input.topic, search: input.search, model: input.model });
  if (dossier.blockingIssues.length || !dossier.recommendedAngleId) {
    event('BLOCKED', `Research blocked: ${dossier.blockingIssues.join('; ')}`);
    return { state: 'BLOCKED', events, dossier };
  }
  const angle = dossier.angles.find((candidate) => candidate.id === dossier.recommendedAngleId)!;

  const formatScriptGuidance = isShort
    ? 'This is a native vertical YouTube Short. Deliver the promise immediately, use one focused narrative arc, remove nonessential context, and finish with a concrete payoff. Do not write a compressed long-form intro.'
    : 'This is a horizontal long-form YouTube video. Build sustained curiosity, evidence and payoff without filler.';
  const scriptGuidance = [input.scriptGuidance,formatScriptGuidance].filter(Boolean).join('\n');
  event('SCRIPT', `Writing ${contentFormat} script for angle ${angle.title}`);
  const script = await generateScript({ dossier, angle, model: input.model, language: input.language, targetDurationSec: input.targetDurationSec, guidance: scriptGuidance });
  event('PACKAGING', input.packagingGuidance ? 'Generating packaging hypotheses with bounded owned-channel learning guidance' : 'Generating packaging hypotheses');
  const packaging = await generatePackaging({ angle, model: input.model, count: 3, guidance: input.packagingGuidance });
  const packagingChoice = selectPackagingWithExploration({ variants: packaging, profile: input.packagingLearning, experimentSeed: `${input.projectId}:${contentFormat}` });
  event('PACKAGING', `${packagingChoice.mode} selected packaging ${packagingChoice.selected.id} at ${(packagingChoice.explorationRate * 100).toFixed(0)}% exploration policy`);
  event('PLAN', `Planning ${aspectRatio} scenes and production cost`);
  const scenes = planScenes(script, { targetSceneDurationSec: input.targetSceneDurationSec, sources:dossier.sources });
  const visualKinds = ['ai_video','ai_image','source_card','chart','motion_graphic'];
  const visualMix = Object.fromEntries(visualKinds.map((kind) => [kind, scenes.filter((scene) => scene.kind === kind).length]));
  const estimatedCostUsd = estimateProductionCost({ narrationSeconds: input.targetDurationSec, scenes }) + (isShort ? 0 : packaging.length * 0.12);
  event('PLAN', `Hybrid visual mix: ${Object.entries(visualMix).map(([kind,count]) => `${kind}=${count}`).join(', ')}`);

  event('ASSETS', `Generating narration and ${aspectRatio} scene visuals${isShort ? '' : ' plus thumbnail variants'}`);
  const voice = await input.voiceProvider.synthesize({ text: script.beats.map((beat) => beat.narration).join('\n\n'), voice: input.voice, language: input.language });
  const assets: AssetRecord[] = [];

  for (const scene of scenes.filter((candidate) => !candidate.generated && ['chart','motion_graphic','text','source_card'].includes(candidate.kind))) {
    const direct = scene.kind === 'source_card' ? scene.sourceRefs?.find((ref) => ref.policy === 'DIRECT_ASSET_ALLOWED' && ref.url) : undefined;
    if (direct?.url) {
      assets.push({
        id:`source-${scene.id}`,
        uri:direct.url,
        mimeType:/\.(mp4|webm)(?:\?|#|$)/i.test(direct.url)?'video/mp4':'image/jpeg',
        provider:'source-backed-direct',
        model:'source-visual-v1',
        costUsd:0,
        sceneId:scene.id,
        generated:false,
        sourceIds:scene.sourceIds,
        sourceUrl:direct.url,
        license:'verify-before-public',
        metadata:{ kind:scene.kind, instruction:scene.instruction, sourceRefs:scene.sourceRefs ?? [], visualValue:scene.visualValue ?? null, selectionReason:scene.selectionReason ?? null },
      });
      continue;
    }
    assets.push({
      id:`procedural-${scene.id}`,
      uri:`procedural://${scene.kind}/${encodeURIComponent(scene.id)}`,
      mimeType:'application/x-auto-ytb-visual',
      provider:'procedural-ffmpeg',
      model:scene.kind === 'source_card' ? 'source-card-v1' : 'hybrid-visual-v1',
      costUsd:0.002,
      sceneId:scene.id,
      generated:false,
      sourceIds:scene.sourceIds,
      sourceUrl:scene.sourceRefs?.[0]?.url,
      license:'original-transformed-card',
      metadata:{ kind:scene.kind, instruction:scene.instruction, sourceRefs:scene.sourceRefs ?? [], visualValue:scene.visualValue ?? null, selectionReason:scene.selectionReason ?? null },
    });
  }

  for (const scene of scenes.filter((candidate) => candidate.generated)) {
    const generated = scene.kind === 'ai_video'
      ? await input.videoProvider.generate({ prompt: `${scene.instruction} Compose natively for ${aspectRatio}; keep the focal subject readable on a phone screen.`, durationSeconds: Math.min(scene.durationSec, 8), aspectRatio })
      : await input.imageProvider.generate({ prompt: `${scene.instruction} Compose natively for ${aspectRatio}; keep the focal subject readable on a phone screen.`, aspectRatio });
    assets.push({ ...generated, sceneId: scene.id, generated: true, sourceIds: scene.sourceIds, metadata:{ sourceRefs:scene.sourceRefs ?? [], visualValue:scene.visualValue ?? null, selectionReason:scene.selectionReason ?? null } });
  }

  const thumbnails: ThumbnailAsset[] = [];
  if (!isShort) {
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
  }

  const manifest: ProductionManifest = {
    projectId: input.projectId,
    createdAt: new Date().toISOString(),
    contentFormat,
    aspectRatio,
    frame,
    script,
    packaging,
    thumbnails,
    selectedPackagingId: packagingChoice.selected.id,
    packagingSelection: {
      mode: packagingChoice.mode,
      explorationRate: packagingChoice.explorationRate,
      scores: packagingChoice.scores,
    },
    scenes,
    assets,
    voice,
    estimatedCostUsd,
    actualCostUsd: (voice.costUsd ?? 0) + assets.reduce((sum, asset) => sum + (asset.costUsd ?? 0), 0) + thumbnails.reduce((sum, asset) => sum + (asset.costUsd ?? 0), 0),
    containsSyntheticMedia: scenes.some((scene) => scene.generated),
  };

  event('QA', 'Running factual, provenance, originality, visual coverage, source-rights, hybrid-media, format, packaging and cost gates');
  const qa = runQa({ dossier, script, manifest, maxCostUsd: input.maxCostUsd });
  if (!qa.passed) {
    event('BLOCKED', `QA blockers: ${qa.blockers.join(', ')}`);
    return { state: 'BLOCKED', events, dossier, manifest, qa };
  }

  const stored = await input.store.put({ key: `projects/${input.projectId}/manifest.json`, contentType: 'application/json', data: JSON.stringify(manifest) });
  event('RENDER', `Rendering ${frame.width}x${frame.height} from ${stored.uri}`);
  const render = await input.renderer.render({ manifestUri: stored.uri, outputKey: `projects/${input.projectId}/final.mp4` });

  if (!input.autoUploadPrivate) {
    event('READY_FOR_REVIEW', isShort ? 'Native vertical Short render ready for review' : `Render and ${thumbnails.length} thumbnail variants ready for review`);
    return { state: 'READY_FOR_REVIEW', events, dossier, manifest, qa, renderUri: render.uri };
  }

  event('PRIVATE_UPLOAD', `Uploading private ${contentFormat}`);
  const selected = packaging.find((variant) => variant.id === manifest.selectedPackagingId) ?? packaging[0];
  const upload = await input.publisher.uploadPrivate({
    fileUri: render.uri,
    title: selected?.title ?? script.title,
    description: dossier.executiveSummary,
    tags: isShort ? ['Shorts'] : [],
    language: input.language,
    containsSyntheticMedia: qa.containsSyntheticMedia,
  });
  if (!isShort) {
    const selectedThumbnail = thumbnails.find((thumbnail) => thumbnail.packagingId === manifest.selectedPackagingId) ?? thumbnails[0];
    if (selectedThumbnail) await input.publisher.setThumbnail({ externalId: upload.externalId, fileUri: selectedThumbnail.uri });
  }
  event('READY_FOR_REVIEW', `Private ${contentFormat} upload ${upload.externalId} ready for human review`);
  return { state: 'READY_FOR_REVIEW', events, dossier, manifest, qa, renderUri: render.uri, externalId: upload.externalId };
}
