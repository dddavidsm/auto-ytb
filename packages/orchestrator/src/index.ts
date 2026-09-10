import type { FinalMediaInspection, ImageProvider, ObjectStore, Publisher, SearchProvider, TextModel, ThumbnailComposer, VideoProvider, VideoRenderer, VoiceProvider } from '@auto-ytb/providers';
import { buildResearchDossier, type ResearchDossier } from '@auto-ytb/editorial';
import { generatePackaging, generateScript, planScenes, selectPackagingWithExploration, synchronizeTimelineToVoice, type AssetRecord, type PackagingLearningProfile, type ProductionContentFormat, type ProductionManifest, type ThumbnailAsset, type VideoScript, type PackagingVariant, type Scene } from '@auto-ytb/production';
import { reviewAttentionBlueprint, runQa, type AttentionReview, type QaReport } from '@auto-ytb/qa';
import { buildArchetypeExecutionPlan, buildCreativeDossier, reconcileQaForExecutionPlan, type ContentArchetypeRuntimeDecision, type ContentArchetypeRuntimeProfile } from './archetype-execution.js';

export * from './archetype-execution.js';

export type PipelineState = 'RESEARCH' | 'SCRIPT' | 'PACKAGING' | 'PLAN' | 'ASSETS' | 'QA' | 'RENDER' | 'PRIVATE_UPLOAD' | 'READY_FOR_REVIEW' | 'BLOCKED';
export type PipelineEvent = { at: string; state: PipelineState; message: string };

type ArchetypeAwareTextModel=TextModel&{contentArchetypeProfile?:ContentArchetypeRuntimeProfile;contentArchetypeDecision?:ContentArchetypeRuntimeDecision};
type BudgetFit={scenes:Scene[];projectedCostUsd:number;changed:boolean;downgrades:string[]};

function promiseWords(value:string){return String(value??'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(Boolean);}
export function ensureOpeningPromise(input:{script:VideoScript;packaging:PackagingVariant[];selectedPackagingId:string;contentFormat:ProductionContentFormat;visualAction?:boolean}):VideoScript{
  const selected=input.packaging.find((variant)=>variant.id===input.selectedPackagingId)??input.packaging[0];
  const first=input.script.beats[0];
  if(!selected||!first)return input.script;
  const promiseText=[selected.title,selected.promise,selected.thumbnailText].filter(Boolean).join(' ');
  const source=new Set(promiseWords(promiseText));
  const opening=input.script.beats.slice(0,input.contentFormat==='SHORT_VERTICAL'?1:2).map((beat)=>input.visualAction?[beat.onScreenText,beat.visualIntent].filter(Boolean).join(' '):beat.narration).join(' ');
  const target=new Set(promiseWords(`${input.script.thesis} ${opening}`));
  const coverage=source.size?[...source].filter((word)=>target.has(word)).length/source.size:1;
  if(coverage>=0.45||!selected.promise?.trim())return input.script;
  const promise=selected.promise.trim();
  const sentence=/[.!?]$/.test(promise)?promise:`${promise}.`;
  const beats=input.script.beats.map((beat,index)=>index===0
    ?{...beat,
      narration:input.visualAction?beat.narration:`${sentence} ${beat.narration}`.trim(),
      visualIntent:`${sentence} ${beat.visualIntent}`.trim(),
      ...(input.visualAction&&!beat.onScreenText&&selected.thumbnailText?{onScreenText:selected.thumbnailText}:{}),
    }
    :beat);
  return{...input.script,beats};
}

const roundMoney=(value:number)=>Math.round(value*10000)/10000;
function conservativePlanCost(input:{scenes:Scene[];narrationSeconds:number;voiceRequired:boolean;voiceCostUsd?:number;fixedCostUsd:number;isShort:boolean;packagingCount:number}){
  const voiceCost=input.voiceCostUsd??(input.voiceRequired?Math.max(0.015,input.narrationSeconds/60*0.08):0);
  const imageCost=input.scenes.filter((scene)=>scene.kind==='ai_image').length*0.08;
  const videoCost=input.scenes.filter((scene)=>scene.kind==='ai_video').reduce((sum,scene)=>sum+Math.max(0,scene.durationSec)*0.12,0);
  const proceduralCost=input.scenes.filter((scene)=>['chart','motion_graphic','text','source_card'].includes(scene.kind)).length*0.003;
  const thumbnailCost=input.isShort?0:input.packagingCount*0.08;
  // Reserve render/storage plus a small variance buffer so the cap is enforced before expensive calls.
  return roundMoney(Math.max(0,input.fixedCostUsd)+voiceCost+imageCost+videoCost+proceduralCost+thumbnailCost+0.22+0.08);
}
function fitScenePlanToBudget(input:{scenes:Scene[];maxCostUsd:number;narrationSeconds:number;voiceRequired:boolean;voiceCostUsd?:number;fixedCostUsd:number;isShort:boolean;packagingCount:number;imageAvailable:boolean}):BudgetFit{
  const scenes=input.scenes.map((scene)=>({...scene}));
  const downgrades:string[]=[];
  const projected=()=>conservativePlanCost({...input,scenes});
  const candidates=[...scenes.keys()].sort((a,b)=>Number(scenes[a].visualValue??0)-Number(scenes[b].visualValue??0));
  for(const index of candidates){
    if(projected()<=input.maxCostUsd)break;
    const scene=scenes[index];
    if(scene.kind!=='ai_video')continue;
    const before=scene.kind;
    if(input.imageAvailable){scene.kind='ai_image';scene.generated=true;scene.costTier='low';}
    else{scene.kind='motion_graphic';scene.generated=false;scene.costTier='free';}
    scene.selectionReason=`Budget guard downgraded ${before} before provider spend; ${scene.selectionReason??''}`.trim();
    downgrades.push(`${scene.id}:${before}->${scene.kind}`);
  }
  for(const index of candidates){
    if(projected()<=input.maxCostUsd)break;
    const scene=scenes[index];
    if(scene.kind!=='ai_image')continue;
    scene.kind='motion_graphic';scene.generated=false;scene.costTier='free';
    scene.selectionReason=`Budget guard downgraded ai_image to deterministic motion graphics before provider spend; ${scene.selectionReason??''}`.trim();
    downgrades.push(`${scene.id}:ai_image->motion_graphic`);
  }
  return{scenes,projectedCostUsd:projected(),changed:downgrades.length>0,downgrades};
}

export async function runContentPipeline(input: {
  projectId: string;
  topic: string;
  language: string;
  contentFormat?: ProductionContentFormat;
  targetDurationSec: number;
  targetSceneDurationSec?: number;
  voice?: string;
  maxCostUsd: number;
  search?: SearchProvider;
  model: TextModel;
  voiceProvider?: VoiceProvider;
  imageProvider?: ImageProvider;
  videoProvider?: VideoProvider;
  thumbnailComposer: ThumbnailComposer;
  store: ObjectStore;
  renderer: VideoRenderer;
  publisher: Publisher;
  contentArchetype?: ContentArchetypeRuntimeDecision;
  autoUploadPrivate?: boolean;
  packagingGuidance?: string;
  scriptGuidance?: string;
  packagingLearning?: PackagingLearningProfile;
  additionalCostUsd?: () => number;
  minAttentionScore?: number;
  maxAttentionRevisionPasses?: number;
}): Promise<{ state: PipelineState; events: PipelineEvent[]; dossier?: ResearchDossier; manifest?: ProductionManifest; qa?: QaReport; attention?: AttentionReview; finalInspection?: FinalMediaInspection; renderUri?: string; externalId?: string }> {
  const events: PipelineEvent[] = [];
  const event = (state: PipelineState, message: string) => events.push({ at: new Date().toISOString(), state, message });
  const contentFormat = input.contentFormat ?? 'LONG_HORIZONTAL';
  const isShort = contentFormat === 'SHORT_VERTICAL';
  const aspectRatio = isShort ? '9:16' as const : '16:9' as const;
  const frame = isShort ? { width:1080,height:1920 } : { width:1920,height:1080 };
  const archetypeModel=input.model as ArchetypeAwareTextModel;
  const contentArchetype=input.contentArchetype??archetypeModel.contentArchetypeDecision??(archetypeModel.contentArchetypeProfile?{archetype:archetypeModel.contentArchetypeProfile.id,confidence:0,reasons:['Runtime-bound Content Archetype profile'],profile:archetypeModel.contentArchetypeProfile}:undefined);
  const executionPlan=buildArchetypeExecutionPlan(contentArchetype,contentFormat);
  event('PLAN', `Content Archetype ${executionPlan.archetypeId} → research=${executionPlan.researchMode} script=${executionPlan.scriptMode} voice=${executionPlan.voiceMode} visuals=${executionPlan.visualMode}`);

  let dossier:ResearchDossier;
  if(executionPlan.researchRequired){
    if(!input.search){event('BLOCKED','Research is required by the Content Archetype but no search provider is configured');return{state:'BLOCKED',events};}
    event('RESEARCH', `Researching ${input.topic} for ${contentFormat}`);
    dossier = await buildResearchDossier({ topic: input.topic, search: input.search, model: input.model });
    if (dossier.blockingIssues.length || !dossier.recommendedAngleId) {
      event('BLOCKED', `Research blocked: ${dossier.blockingIssues.join('; ')}`);
      return { state: 'BLOCKED', events, dossier };
    }
  }else{
    dossier=buildCreativeDossier(input.topic,contentArchetype);
    event('RESEARCH', `Research skipped by ${executionPlan.archetypeId}; creative-original safety contract active`);
  }
  const angle = dossier.angles.find((candidate) => candidate.id === dossier.recommendedAngleId)!;

  const formatScriptGuidance = isShort
    ? 'This is a native vertical YouTube Short. Deliver the viewer promise immediately, create tension or curiosity in the first spoken/visual beat, use one focused narrative arc, remove all nonessential setup, and end on a concrete payoff. Never open with greetings, housekeeping or a compressed long-form introduction.'
    : 'This is a horizontal long-form YouTube video. Open on the strongest contradiction, consequence, action or unresolved question, make the clicked promise clear immediately, then build sustained curiosity through progressive evidence/actions, escalation, reveals and a satisfying payoff without filler.';
  const languageGuidance=executionPlan.voiceRequired
    ?`Write spoken material natively in ${input.language}. Do not translate literally from another language.`
    :`Use ${input.language} only for minimal on-screen/context text. This is visual-first and must not invent a voice-over.`;
  const baseScriptGuidance = [input.scriptGuidance,formatScriptGuidance,languageGuidance].filter(Boolean).join('\n');
  const maxRepairs=Math.max(0,Math.min(4,Math.floor(input.maxAttentionRevisionPasses??2)));
  const minAttentionScore=Math.max(75,Math.min(98,Number(input.minAttentionScore??86)));
  let revisionGuidance:string[]=[];
  let adaptiveSceneDuration=input.targetSceneDurationSec??executionPlan.targetSceneDurationSec;
  let draftScript!:VideoScript;
  let packaging!:PackagingVariant[];
  let draftScenes!:Scene[];
  let attention!:AttentionReview;
  let packagingChoice!:ReturnType<typeof selectPackagingWithExploration>;
  let projectedCostUsd=0;

  for(let attempt=0;attempt<=maxRepairs;attempt+=1){
    const repairLabel=attempt===0?'initial attention draft':`attention repair ${attempt}/${maxRepairs}`;
    event('SCRIPT', `Writing ${repairLabel} in native ${input.language} for ${angle.title} as ${executionPlan.scriptMode}`);
    if(attempt===0||!packaging?.length||!packagingChoice){
      event('PACKAGING', input.packagingGuidance ? 'Generating packaging hypotheses with bounded owned-channel learning guidance' : 'Generating packaging hypotheses');
      packaging=await generatePackaging({ angle, model: input.model, count: 3, guidance:[input.packagingGuidance,'The title/thumbnail promise must be paid into immediately by the opening and fully resolved by the payoff.'].filter(Boolean).join('\n') });
      packagingChoice=selectPackagingWithExploration({ variants: packaging, profile: input.packagingLearning, experimentSeed: `${input.projectId}:${contentFormat}:locked` });
      event('PACKAGING', `Locked packaging ${packagingChoice.selected.id} for autonomous attention repairs so the script does not chase a moving promise.`);
    }else{
      event('PACKAGING', `Keeping locked packaging ${packagingChoice.selected.id} during repair ${attempt}/${maxRepairs}`);
    }

    const lockedPromise=packagingChoice?.selected
      ?`LOCKED PACKAGING CONTRACT — do not change the viewer promise. Title: "${packagingChoice.selected.title}". Promise: "${packagingChoice.selected.promise}". The first beat must immediately pay into this promise and the final payoff must resolve it.`
      :'';
    const guidance=[baseScriptGuidance,lockedPromise,...revisionGuidance].filter(Boolean).join('\n');
    draftScript=await generateScript({ dossier, angle, model: input.model, language: input.language, targetDurationSec: input.targetDurationSec, guidance, factClaimMode:executionPlan.factClaimMode,scriptMode:executionPlan.scriptMode });
    draftScript=ensureOpeningPromise({script:draftScript,packaging,selectedPackagingId:packagingChoice.selected.id,contentFormat,visualAction:executionPlan.scriptMode==='VISUAL_ACTION'});

    event('PLAN', `Planning ${aspectRatio} ${executionPlan.visualMode} timeline for attention pass ${attempt+1}`);
    draftScenes=planScenes(draftScript,{targetSceneDurationSec:adaptiveSceneDuration,sources:dossier.sources,visualMode:executionPlan.visualMode,generativeSpendBias:executionPlan.generativeSpendBias,realityMode:executionPlan.realityMode,cameraProfile:executionPlan.cameraProfile});
    const spendSoFar=Math.max(0,Number(input.additionalCostUsd?.() ?? input.model.getNonAssetCostUsd?.() ?? 0));
    const budgetFit=fitScenePlanToBudget({scenes:draftScenes,maxCostUsd:input.maxCostUsd,narrationSeconds:executionPlan.voiceRequired?input.targetDurationSec:0,voiceRequired:executionPlan.voiceRequired,fixedCostUsd:spendSoFar,isShort,packagingCount:packaging.length,imageAvailable:Boolean(input.imageProvider)});
    draftScenes=budgetFit.scenes;projectedCostUsd=budgetFit.projectedCostUsd;
    if(budgetFit.changed)event('PLAN',`Pre-spend budget guard downgraded ${budgetFit.downgrades.length} scene(s): ${budgetFit.downgrades.join(', ')} · projected $${projectedCostUsd.toFixed(2)} / cap $${input.maxCostUsd.toFixed(2)}`);
    if(projectedCostUsd>input.maxCostUsd){
      event('BLOCKED',`Hard budget cannot be met before media generation: projected $${projectedCostUsd.toFixed(2)} / cap $${input.maxCostUsd.toFixed(2)} after all safe downgrades`);
      return{state:'BLOCKED',events,dossier};
    }
    attention=reviewAttentionBlueprint({script:draftScript,packaging,scenes:draftScenes,contentFormat,executionPlan,selectedPackagingId:packagingChoice.selected.id,minScore:minAttentionScore});
    const criticalCodes=attention.issues.filter((issue)=>issue.severity==='critical').map((issue)=>issue.code);
    event('QA', `Attention preflight ${attention.score}/100 · ${attention.ready?'READY':'REPAIR'} · critical=${criticalCodes.join(',')||'none'} · issues=${attention.issues.map((issue)=>issue.code).join(',')||'none'}`);
    if(attention.ready)break;
    if(attempt===maxRepairs){
      const dimensions=attention.dimensions.map((item)=>`${item.id}:${item.score}`).join(', ');
      event('BLOCKED', `Attention preflight failed after ${maxRepairs+1} attempt(s): score ${attention.score}/${minAttentionScore}; critical ${criticalCodes.join(', ')||'none'}; dimensions ${dimensions}`);
      return {state:'BLOCKED',events,dossier,attention};
    }
    const weakDimensions=attention.dimensions.filter((item)=>item.score<75).map((item)=>`${item.id} ${item.score}/100: ${item.message}`);
    revisionGuidance=[
      `This is an autonomous revision pass. The previous draft scored ${attention.score}/100 and must be materially improved, not paraphrased.`,
      ...attention.revisionGuidance,
      ...(weakDimensions.length?[`Explicit weak dimensions to repair: ${weakDimensions.join(' | ')}`]:[]),
      executionPlan.researchRequired
        ?'Preserve factual claims and source IDs. Remove filler before adding length. Every beat must create progress toward the locked viewer promise.'
        :'Preserve the original premise and any canonical character/world constraints. Do not turn fictional/generated events into claimed real-world evidence. Every beat must create visible progress toward the locked payoff.',
    ];
    if(attention.issues.some((issue)=>['monotonous-pacing','weak-visual-storytelling'].includes(issue.code))){
      const current=adaptiveSceneDuration??(isShort?5:10);
      adaptiveSceneDuration=Math.max(isShort?2.5:4.5,current*0.82);
    }
  }

  event('PACKAGING', `${packagingChoice.mode} selected locked packaging ${packagingChoice.selected.id} at ${(packagingChoice.explorationRate * 100).toFixed(0)}% exploration policy after attention review ${attention.score}/100`);
  event('PLAN',`Pre-media hard-budget preflight PASS · projected $${projectedCostUsd.toFixed(2)} / cap $${input.maxCostUsd.toFixed(2)}`);

  let voice:ProductionManifest['voice'];
  let script=draftScript;
  let scenes=draftScenes;
  let timelineDuration=Math.max(0,...scenes.map((scene)=>scene.startSec+scene.durationSec),draftScript.targetDurationSec);
  if(executionPlan.voiceRequired){
    if(!input.voiceProvider||!input.voice){event('BLOCKED',`${executionPlan.voiceMode} requires a configured voice provider and voice id`);return{state:'BLOCKED',events,dossier,attention};}
    event('ASSETS', `Generating ${input.language} ${executionPlan.voiceMode} audio with timestamp alignment`);
    const narrationText=draftScript.beats.map((beat) => beat.narration).join('\n\n');
    voice = await input.voiceProvider.synthesize({ text:narrationText, voice: input.voice, language: input.language });
    const sync=synchronizeTimelineToVoice(draftScript,draftScenes,voice.alignment,voice.durationSeconds);
    script=sync.script;
    scenes=sync.scenes;
    timelineDuration=sync.durationSeconds;
    event('PLAN', `Voice timeline synchronized to ${sync.durationSeconds.toFixed(1)}s audio · alignment coverage ${(sync.alignmentCoverage*100).toFixed(0)}%`);
  }else{
    event('ASSETS', `Skipping synthesized voice for ${executionPlan.archetypeId}; visual-first timing preserved at ${timelineDuration.toFixed(1)}s`);
  }

  const editorialCostPreMedia=Math.max(0,Number(input.additionalCostUsd?.() ?? input.model.getNonAssetCostUsd?.() ?? 0));
  const postVoiceBudget=fitScenePlanToBudget({scenes,maxCostUsd:input.maxCostUsd,narrationSeconds:voice?.durationSeconds??0,voiceRequired:executionPlan.voiceRequired,voiceCostUsd:Number(voice?.costUsd??0),fixedCostUsd:editorialCostPreMedia,isShort,packagingCount:packaging.length,imageAvailable:Boolean(input.imageProvider)});
  scenes=postVoiceBudget.scenes;projectedCostUsd=postVoiceBudget.projectedCostUsd;
  if(postVoiceBudget.changed){
    event('PLAN',`Post-voice budget guard downgraded ${postVoiceBudget.downgrades.length} scene(s): ${postVoiceBudget.downgrades.join(', ')} · projected $${projectedCostUsd.toFixed(2)} / cap $${input.maxCostUsd.toFixed(2)}`);
    attention=reviewAttentionBlueprint({script,packaging,scenes,contentFormat,executionPlan,selectedPackagingId:packagingChoice.selected.id,minScore:minAttentionScore});
    if(!attention.ready){event('BLOCKED',`Budget-safe visual plan would violate attention gate: ${attention.issues.map((issue)=>issue.code).join(', ')}`);return{state:'BLOCKED',events,dossier,attention};}
  }
  if(projectedCostUsd>input.maxCostUsd){event('BLOCKED',`Hard budget exceeded after voice timing: projected $${projectedCostUsd.toFixed(2)} / cap $${input.maxCostUsd.toFixed(2)}`);return{state:'BLOCKED',events,dossier,attention};}

  const needsVideo=scenes.some((scene)=>scene.generated&&scene.kind==='ai_video');
  const needsImage=scenes.some((scene)=>scene.generated&&scene.kind==='ai_image')||!isShort;
  if(needsVideo&&!input.videoProvider){event('BLOCKED',`${executionPlan.visualMode} scene plan requires a video provider but none is configured`);return{state:'BLOCKED',events,dossier,attention};}
  if(needsImage&&!input.imageProvider){event('BLOCKED',`${executionPlan.visualMode} scene/thumbnail plan requires an image provider but none is configured`);return{state:'BLOCKED',events,dossier,attention};}

  const visualKinds = ['ai_video','ai_image','source_card','chart','motion_graphic','text'];
  const visualMix = Object.fromEntries(visualKinds.map((kind) => [kind, scenes.filter((scene) => scene.kind === kind).length]));
  const estimatedCostUsd=projectedCostUsd;
  event('PLAN', `Archetype visual mix: ${Object.entries(visualMix).map(([kind,count]) => `${kind}=${count}`).join(', ')} · generative bias ${executionPlan.generativeSpendBias.toFixed(2)} · conservative pre-render $${estimatedCostUsd.toFixed(2)}/${input.maxCostUsd.toFixed(2)}`);

  event('ASSETS', `Generating ${aspectRatio} scene visuals${isShort ? '' : ' plus thumbnail variants'}`);
  const assets: AssetRecord[] = [];
  const beatForScene=(scene:Scene)=>script.beats.find((beat)=>scene.id===beat.id||scene.id.startsWith(`${beat.id}-s`));

  for (const scene of scenes.filter((candidate) => !candidate.generated && ['chart','motion_graphic','text','source_card'].includes(candidate.kind))) {
    const direct = scene.kind === 'source_card' ? scene.sourceRefs?.find((ref) => ref.policy === 'DIRECT_ASSET_ALLOWED' && ref.url) : undefined;
    if (direct?.url) {
      assets.push({id:`source-${scene.id}`,uri:direct.url,mimeType:/\.(mp4|webm)(?:\?|#|$)/i.test(direct.url)?'video/mp4':'image/jpeg',provider:'source-backed-direct',model:'source-visual-v1',costUsd:0,sceneId:scene.id,generated:false,sourceIds:scene.sourceIds,sourceUrl:direct.url,license:'verify-before-public',metadata:{kind:scene.kind,instruction:scene.instruction,sourceRefs:scene.sourceRefs??[],visualValue:scene.visualValue??null,selectionReason:scene.selectionReason??null}});
      continue;
    }
    assets.push({id:`procedural-${scene.id}`,uri:`procedural://${scene.kind}/${encodeURIComponent(scene.id)}`,mimeType:'application/x-auto-ytb-visual',provider:'procedural-ffmpeg',model:scene.kind==='source_card'?'source-card-v1':'hybrid-visual-v1',costUsd:0.002,sceneId:scene.id,generated:false,sourceIds:scene.sourceIds,sourceUrl:scene.sourceRefs?.[0]?.url,license:'original-transformed-card',metadata:{kind:scene.kind,instruction:scene.instruction,sourceRefs:scene.sourceRefs??[],visualValue:scene.visualValue??null,selectionReason:scene.selectionReason??null}});
  }

  for (const scene of scenes.filter((candidate) => candidate.generated)) {
    const beat=beatForScene(scene);
    const beatContext=beat?.narration?.replace(/\s+/g,' ').trim().slice(0,520);
    const visualPrompt=[
      scene.instruction,
      beatContext?`Production beat context for subject/cast grounding: ${beatContext}`:'',
      `Compose natively for ${aspectRatio}; keep the focal subject readable on a phone screen. The visual must explain, prove, escalate or refresh the viewer promise rather than act as generic decoration.`,
    ].filter(Boolean).join(' ');
    const generated = scene.kind === 'ai_video'
      ? await input.videoProvider!.generate({ prompt:visualPrompt, durationSeconds: Math.min(scene.durationSec, 8), aspectRatio })
      : await input.imageProvider!.generate({ prompt:visualPrompt, aspectRatio });
    assets.push({...generated,sceneId:scene.id,generated:true,sourceIds:scene.sourceIds,metadata:{...(generated.metadata??{}),sourceRefs:scene.sourceRefs??[],visualValue:scene.visualValue??null,selectionReason:scene.selectionReason??null,beatContext:beatContext??null}});
  }

  const thumbnails: ThumbnailAsset[] = [];
  if (!isShort) {
    for (const variant of packaging) {
      const background = await input.imageProvider!.generate({prompt:`${variant.thumbnailConcept}. YouTube thumbnail background for ${executionPlan.archetypeId}: one dominant focal subject, high visual contrast, uncluttered composition, strong separation between foreground and background, leave intentional negative space for optional typography, no readable fake text, no fake logos, no watermarks. The visual promise must be truthful to the opening and payoff.`,aspectRatio:'16:9'});
      const composed = await input.thumbnailComposer.compose({backgroundUri:background.uri,text:variant.thumbnailText,outputKey:`${input.projectId}/${variant.id}.jpg`});
      thumbnails.push({ ...composed, packagingId: variant.id, text: variant.thumbnailText, costUsd: (background.costUsd ?? 0) + (composed.costUsd ?? 0) });
    }
  }

  const editorialCostUsd=Math.max(0,Number(input.additionalCostUsd?.() ?? input.model.getNonAssetCostUsd?.() ?? 0));
  const mediaCostUsd=(voice?.costUsd ?? 0) + assets.reduce((sum, asset) => sum + (asset.costUsd ?? 0), 0) + thumbnails.reduce((sum, asset) => sum + (asset.costUsd ?? 0), 0);
  const profile={...(contentArchetype?.profile??{})};
  const manifest: ProductionManifest = {
    projectId:input.projectId,createdAt:new Date().toISOString(),contentFormat,aspectRatio,frame,
    contentArchetype:{version:1,id:String(contentArchetype?.archetype??profile.id??executionPlan.archetypeId),label:String(profile.label??contentArchetype?.archetype??executionPlan.archetypeId),confidence:Number(contentArchetype?.confidence??0),reasons:contentArchetype?.reasons??[],voiceMode:executionPlan.voiceMode,realityMode:executionPlan.realityMode,cameraProfile:executionPlan.cameraProfile,syntheticDisclosurePolicy:executionPlan.syntheticDisclosurePolicy,profile},
    executionPlan,script,packaging,thumbnails,selectedPackagingId:packagingChoice.selected.id,packagingSelection:{mode:packagingChoice.mode,explorationRate:packagingChoice.explorationRate,scores:packagingChoice.scores},scenes,assets,voice,estimatedCostUsd,actualCostUsd:editorialCostUsd+mediaCostUsd,containsSyntheticMedia:scenes.some((scene)=>scene.generated)||assets.some((asset)=>asset.generated)
  };
  event('PLAN', `Metered pre-render spend $${manifest.actualCostUsd.toFixed(4)} · conservative plan $${manifest.estimatedCostUsd.toFixed(4)} · editorial $${editorialCostUsd.toFixed(4)} · media $${mediaCostUsd.toFixed(4)} · cap $${input.maxCostUsd.toFixed(2)}`);
  if(Math.max(manifest.actualCostUsd,manifest.estimatedCostUsd)>input.maxCostUsd){event('BLOCKED',`Hard cost guard tripped before render: $${Math.max(manifest.actualCostUsd,manifest.estimatedCostUsd).toFixed(2)} / $${input.maxCostUsd.toFixed(2)}`);return{state:'BLOCKED',events,dossier,manifest,attention};}

  event('QA', `Running factual/provenance/originality/rights/attention/cost gates plus ${executionPlan.archetypeId} execution contract`);
  const baseQa = runQa({ dossier, script, manifest, maxCostUsd: input.maxCostUsd,minAttentionScore });
  const qa=reconcileQaForExecutionPlan(baseQa,manifest,executionPlan);
  if (!qa.passed) {event('BLOCKED', `QA blockers: ${qa.blockers.join(', ')} · ${qa.checks.filter((check)=>check.status==='FAIL').map((check)=>`${check.id}=${check.message}`).join(' | ')}`);return { state:'BLOCKED',events,dossier,manifest,qa,attention:qa.attention };}

  const stored = await input.store.put({ key:`projects/${input.projectId}/manifest.json`,contentType:'application/json',data:JSON.stringify(manifest) });
  event('RENDER', `Rendering ${frame.width}x${frame.height} ${executionPlan.voiceRequired?'synchronized to voice':'visual-first'} from ${stored.uri}`);
  const render = await input.renderer.render({ manifestUri:stored.uri,outputKey:`projects/${input.projectId}/final.mp4` });
  if(render.metadata?.renderExecution)manifest.renderExecution=render.metadata.renderExecution as ProductionManifest['renderExecution'];
  const expectedCaptionBurn=Boolean(manifest.captionPlan?.enabled&&manifest.captionPlan.burnIn);
  if(expectedCaptionBurn&&!manifest.renderExecution?.captionsBurned){
    event('BLOCKED',`Editorial finish rejected: ${manifest.captionPlan?.preset??'caption'} captions were required but no burn-in execution proof was returned`);
    return{state:'BLOCKED',events,dossier,manifest,qa,attention:qa.attention,renderUri:render.uri};
  }
  const requireFinalAudio=executionPlan.voiceRequired||executionPlan.audioMode==='NATURAL_SOUND';
  const finalInspection:FinalMediaInspection=input.renderer.inspect
    ? await input.renderer.inspect({fileUri:render.uri,expectedWidth:frame.width,expectedHeight:frame.height,expectedDurationSeconds:timelineDuration,requireAudio:requireFinalAudio})
    : {passed:false,score:0,hasVideo:false,hasAudio:false,issues:['renderer-inspection-unavailable']};
  event('QA', `Final render inspection ${finalInspection.score}/100 · ${finalInspection.passed?'PASS':'FAIL'} · ${finalInspection.width??'?'}x${finalInspection.height??'?'} · ${finalInspection.durationSeconds??'?'}s · audio ${requireFinalAudio?'required':'optional'}`);
  if(!finalInspection.passed){event('BLOCKED',`Final render rejected: ${finalInspection.issues.join(', ')}`);return{state:'BLOCKED',events,dossier,manifest,qa,attention:qa.attention,finalInspection,renderUri:render.uri};}

  if (!input.autoUploadPrivate) {
    event('READY_FOR_REVIEW', isShort ? `Native vertical Short render ready · ${executionPlan.archetypeId} · attention ${qa.attention.score}/100 · render QA ${finalInspection.score}/100` : `Render and ${thumbnails.length} thumbnail variants ready · ${executionPlan.archetypeId} · attention ${qa.attention.score}/100 · render QA ${finalInspection.score}/100`);
    return { state:'READY_FOR_REVIEW',events,dossier,manifest,qa,attention:qa.attention,finalInspection,renderUri:render.uri };
  }

  event('PRIVATE_UPLOAD', `Uploading private ${contentFormat}`);
  const selected = packaging.find((variant) => variant.id === manifest.selectedPackagingId) ?? packaging[0];
  const upload = await input.publisher.uploadPrivate({fileUri:render.uri,title:selected?.title??script.title,description:dossier.executiveSummary,tags:isShort?['Shorts']:[],language:input.language,containsSyntheticMedia:qa.containsSyntheticMedia});
  if (!isShort) {const selectedThumbnail=thumbnails.find((thumbnail)=>thumbnail.packagingId===manifest.selectedPackagingId)??thumbnails[0];if(selectedThumbnail)await input.publisher.setThumbnail({externalId:upload.externalId,fileUri:selectedThumbnail.uri});}
  event('READY_FOR_REVIEW', `Private ${contentFormat} upload ${upload.externalId} ready for downstream publication policy · ${executionPlan.archetypeId} · attention ${qa.attention.score}/100 · render QA ${finalInspection.score}/100`);
  return { state:'READY_FOR_REVIEW',events,dossier,manifest,qa,attention:qa.attention,finalInspection,renderUri:render.uri,externalId:upload.externalId };
}
