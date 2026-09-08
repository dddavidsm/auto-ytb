import type { ImageProvider, ObjectStore, Publisher, SearchProvider, TextModel, ThumbnailComposer, VideoProvider, VideoRenderer, VoiceProvider } from '@auto-ytb/providers';
import { buildResearchDossier, type ResearchDossier } from '@auto-ytb/editorial';
import { estimateProductionCost, generatePackaging, generateScript, planScenes, selectPackagingWithExploration, synchronizeTimelineToVoice, type AssetRecord, type PackagingLearningProfile, type ProductionContentFormat, type ProductionManifest, type ThumbnailAsset, type VideoScript, type PackagingVariant, type Scene } from '@auto-ytb/production';
import { reviewAttentionBlueprint, runQa, type AttentionReview, type QaReport } from '@auto-ytb/qa';

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
  additionalCostUsd?: () => number;
  minAttentionScore?: number;
  maxAttentionRevisionPasses?: number;
}): Promise<{ state: PipelineState; events: PipelineEvent[]; dossier?: ResearchDossier; manifest?: ProductionManifest; qa?: QaReport; attention?: AttentionReview; renderUri?: string; externalId?: string }> {
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
    ? 'This is a native vertical YouTube Short. Deliver the viewer promise immediately, create tension or curiosity in the first spoken/visual beat, use one focused narrative arc, remove all nonessential setup, and end on a concrete payoff. Never open with greetings, housekeeping or a compressed long-form introduction.'
    : 'This is a horizontal long-form YouTube video. Open on the strongest contradiction, consequence or unresolved question, make the clicked promise clear immediately, then build sustained curiosity through progressive evidence, escalation, reveals and a satisfying payoff without filler.';
  const baseScriptGuidance = [input.scriptGuidance,formatScriptGuidance,`Write the narration natively in ${input.language}. Do not translate literally from another language.`].filter(Boolean).join('\n');
  const maxRepairs=Math.max(0,Math.min(3,Math.floor(input.maxAttentionRevisionPasses??2)));
  const minAttentionScore=Math.max(75,Math.min(98,Number(input.minAttentionScore??86)));
  let revisionGuidance:string[]=[];
  let adaptiveSceneDuration=input.targetSceneDurationSec;
  let draftScript!:VideoScript;
  let packaging!:PackagingVariant[];
  let draftScenes!:Scene[];
  let attention!:AttentionReview;
  let packagingChoice!:ReturnType<typeof selectPackagingWithExploration>;

  for(let attempt=0;attempt<=maxRepairs;attempt+=1){
    const repairLabel=attempt===0?'initial attention draft':`attention repair ${attempt}/${maxRepairs}`;
    event('SCRIPT', `Writing ${repairLabel} in native ${input.language} for ${angle.title}`);
    const guidance=[baseScriptGuidance,...revisionGuidance].filter(Boolean).join('\n');
    draftScript=await generateScript({ dossier, angle, model: input.model, language: input.language, targetDurationSec: input.targetDurationSec, guidance });

    event('PACKAGING', attempt===0
      ? (input.packagingGuidance ? 'Generating packaging hypotheses with bounded owned-channel learning guidance' : 'Generating packaging hypotheses')
      : `Regenerating packaging to match repaired opening and payoff (${attempt}/${maxRepairs})`);
    const packagingRepair=revisionGuidance.length?`Attention review corrections: ${revisionGuidance.join(' ')}`:undefined;
    packaging=await generatePackaging({ angle, model: input.model, count: 3, guidance:[input.packagingGuidance,packagingRepair,'The title/thumbnail promise must be paid into immediately by the opening and fully resolved by the payoff.'].filter(Boolean).join('\n') });
    packagingChoice=selectPackagingWithExploration({ variants: packaging, profile: input.packagingLearning, experimentSeed: `${input.projectId}:${contentFormat}:${attempt}` });

    event('PLAN', `Planning ${aspectRatio} hybrid visual timeline for attention pass ${attempt+1}`);
    draftScenes=planScenes(draftScript,{targetSceneDurationSec:adaptiveSceneDuration,sources:dossier.sources});
    attention=reviewAttentionBlueprint({script:draftScript,packaging,scenes:draftScenes,contentFormat,selectedPackagingId:packagingChoice.selected.id,minScore:minAttentionScore});
    event('QA', `Attention preflight ${attention.score}/100 · ${attention.ready?'READY':'REPAIR'} · ${attention.issues.length} issue(s)`);
    if(attention.ready)break;
    if(attempt===maxRepairs){
      event('BLOCKED', `Attention preflight could not reach ${minAttentionScore}/100 after ${maxRepairs+1} attempt(s): ${attention.issues.map((issue)=>issue.code).join(', ')}`);
      return {state:'BLOCKED',events,dossier,attention};
    }
    revisionGuidance=[
      `This is an autonomous revision pass. The previous draft scored ${attention.score}/100 and must be materially improved, not paraphrased.`,
      ...attention.revisionGuidance,
      'Preserve factual claims and source IDs. Remove filler before adding length. Every beat must create progress toward the viewer promise.',
    ];
    if(attention.issues.some((issue)=>['monotonous-pacing','weak-visual-storytelling'].includes(issue.code))){
      const current=adaptiveSceneDuration??(isShort?5:10);
      adaptiveSceneDuration=Math.max(isShort?2.5:4.5,current*0.82);
    }
  }

  event('PACKAGING', `${packagingChoice.mode} selected packaging ${packagingChoice.selected.id} at ${(packagingChoice.explorationRate * 100).toFixed(0)}% exploration policy after attention review ${attention.score}/100`);

  event('ASSETS', `Generating ${input.language} narration with timestamp alignment`);
  const narrationText=draftScript.beats.map((beat) => beat.narration).join('\n\n');
  const voice = await input.voiceProvider.synthesize({ text:narrationText, voice: input.voice, language: input.language });
  const sync=synchronizeTimelineToVoice(draftScript,draftScenes,voice.alignment,voice.durationSeconds);
  const script=sync.script;
  const scenes=sync.scenes;
  event('PLAN', `Narration timeline synchronized to ${sync.durationSeconds.toFixed(1)}s audio · alignment coverage ${(sync.alignmentCoverage*100).toFixed(0)}%`);

  const visualKinds = ['ai_video','ai_image','source_card','chart','motion_graphic'];
  const visualMix = Object.fromEntries(visualKinds.map((kind) => [kind, scenes.filter((scene) => scene.kind === kind).length]));
  const estimatedCostUsd = estimateProductionCost({ narrationSeconds: sync.durationSeconds, scenes }) + (isShort ? 0 : packaging.length * 0.12);
  event('PLAN', `Hybrid visual mix: ${Object.entries(visualMix).map(([kind,count]) => `${kind}=${count}`).join(', ')}`);

  event('ASSETS', `Generating ${aspectRatio} scene visuals${isShort ? '' : ' plus thumbnail variants'}`);
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
      ? await input.videoProvider.generate({ prompt: `${scene.instruction} Compose natively for ${aspectRatio}; keep the focal subject readable on a phone screen. The visual must explain, prove, escalate or refresh the narration rather than act as generic decoration.`, durationSeconds: Math.min(scene.durationSec, 8), aspectRatio })
      : await input.imageProvider.generate({ prompt: `${scene.instruction} Compose natively for ${aspectRatio}; keep the focal subject readable on a phone screen. The visual must explain, prove, escalate or refresh the narration rather than act as generic decoration.`, aspectRatio });
    assets.push({ ...generated, sceneId: scene.id, generated: true, sourceIds: scene.sourceIds, metadata:{ sourceRefs:scene.sourceRefs ?? [], visualValue:scene.visualValue ?? null, selectionReason:scene.selectionReason ?? null } });
  }

  const thumbnails: ThumbnailAsset[] = [];
  if (!isShort) {
    for (const variant of packaging) {
      const background = await input.imageProvider.generate({
        prompt: `${variant.thumbnailConcept}. YouTube documentary thumbnail background, one dominant focal subject, high visual contrast, uncluttered composition, strong separation between foreground and background, leave intentional negative space for optional typography, no readable text, no fake logos, no watermarks. The visual promise must be truthful to the opening and payoff.`,
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

  const editorialCostUsd=Math.max(0,Number(input.additionalCostUsd?.() ?? input.model.getNonAssetCostUsd?.() ?? 0));
  const mediaCostUsd=(voice.costUsd ?? 0) + assets.reduce((sum, asset) => sum + (asset.costUsd ?? 0), 0) + thumbnails.reduce((sum, asset) => sum + (asset.costUsd ?? 0), 0);
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
    actualCostUsd: editorialCostUsd + mediaCostUsd,
    containsSyntheticMedia: scenes.some((scene) => scene.generated),
  };
  event('PLAN', `Metered pre-render spend $${manifest.actualCostUsd.toFixed(4)} · editorial $${editorialCostUsd.toFixed(4)} · media $${mediaCostUsd.toFixed(4)}`);

  event('QA', 'Running factual, provenance, originality, language, audio-sync, attention, visual coverage, source-rights, hybrid-media, format, packaging and cost gates');
  const qa = runQa({ dossier, script, manifest, maxCostUsd: input.maxCostUsd,minAttentionScore });
  if (!qa.passed) {
    event('BLOCKED', `QA blockers: ${qa.blockers.join(', ')}`);
    return { state: 'BLOCKED', events, dossier, manifest, qa, attention:qa.attention };
  }

  const stored = await input.store.put({ key: `projects/${input.projectId}/manifest.json`, contentType: 'application/json', data: JSON.stringify(manifest) });
  event('RENDER', `Rendering ${frame.width}x${frame.height} synchronized to narration from ${stored.uri}`);
  const render = await input.renderer.render({ manifestUri: stored.uri, outputKey: `projects/${input.projectId}/final.mp4` });

  if (!input.autoUploadPrivate) {
    event('READY_FOR_REVIEW', isShort ? `Native vertical Short render ready · attention ${qa.attention.score}/100` : `Render and ${thumbnails.length} thumbnail variants ready · attention ${qa.attention.score}/100`);
    return { state: 'READY_FOR_REVIEW', events, dossier, manifest, qa, attention:qa.attention, renderUri: render.uri };
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
  event('READY_FOR_REVIEW', `Private ${contentFormat} upload ${upload.externalId} ready for downstream publication policy · attention ${qa.attention.score}/100`);
  return { state: 'READY_FOR_REVIEW', events, dossier, manifest, qa, attention:qa.attention, renderUri: render.uri, externalId: upload.externalId };
}
