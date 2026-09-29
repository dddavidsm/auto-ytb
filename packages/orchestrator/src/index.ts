import type { BinaryAsset, FinalMediaInspection, ImageProvider, ObjectStore, Publisher, SearchProvider, TextModel, ThumbnailComposer, VideoProvider, VideoRenderer, VoiceProvider } from '@auto-ytb/providers';
import { buildResearchDossier, type ResearchDossier } from '@auto-ytb/editorial';
import { evaluateShotCoverage, generatePackaging, generateScript, planScenes, selectPackagingWithExploration, synchronizeTimelineToVoice, type AssetRecord, type PackagingLearningProfile, type ProductionContentFormat, type ProductionManifest, type ThumbnailAsset, type VideoScript, type PackagingVariant, type Scene, type SourceFootage } from '@auto-ytb/production';
import { reviewAttentionBlueprint, runQa, type AttentionReview, type QaReport } from '@auto-ytb/qa';
import { buildArchetypeExecutionPlan, buildCreativeDossier, reconcileQaForExecutionPlan, type ContentArchetypeRuntimeDecision, type ContentArchetypeRuntimeProfile } from './archetype-execution.js';

export * from './archetype-execution.js';

export type PipelineState = 'RESEARCH' | 'SCRIPT' | 'PACKAGING' | 'PLAN' | 'ASSETS' | 'QA' | 'RENDER' | 'PRIVATE_UPLOAD' | 'READY_FOR_REVIEW' | 'BLOCKED';
export type PipelineEvent = { at: string; state: PipelineState; message: string };

type ArchetypeAwareTextModel=TextModel&{contentArchetypeProfile?:ContentArchetypeRuntimeProfile;contentArchetypeDecision?:ContentArchetypeRuntimeDecision};
type BudgetFit={scenes:Scene[];projectedCostUsd:number;changed:boolean;downgrades:string[]};

function buildSourceLockedDossier(topic:string, footage:SourceFootage[]):ResearchDossier{
  const unique=[...new Map(footage.map((clip)=>[clip.sourceId??clip.sourceUrl??clip.id,clip])).values()];
  const sources=unique.map((clip,index)=>({
    id:`source-footage-${index+1}`,
    title:clip.title??clip.id,
    url:clip.sourceUrl??clip.uri,
    snippet:`Supplied, licensed source footage. The production may claim only what is directly visible in the selected time window. License: ${clip.license}.`,
    sourceType:'primary' as const,
    authority:90,
    freshness:100,
    primaryEvidence:true,
    qualityScore:90,
  }));
  const angle={
    id:'source-locked',
    title:topic,
    thesis:`Explain the visible process in the supplied footage without adding unsupported claims about it.`,
    viewerPromise:topic,
    hook:`Open on the clearest visible result, then reveal the visible steps that produce it.`,
    novelty:82,
    emotionalPull:80,
    retentionPotential:88,
    monetizationFit:78,
    evidenceFit:100,
    productionFit:96,
    risk:4,
    score:88,
  };
  return{
    topic,
    generatedAt:new Date().toISOString(),
    executiveSummary:'Source-locked production: factual wording is constrained to the supplied footage and its provenance metadata. External facts are intentionally not added unless they are visible in the selected clips.',
    sources,
    claims:[],
    contradictions:[],
    timeline:[],
    angles:[angle],
    recommendedAngleId:angle.id,
    researchConfidence:100,
    blockingIssues:[],
  };
}

function constrainSourceLockedPackaging(variants:PackagingVariant[]):PackagingVariant[]{
  // Source-first must preserve the brief's promise. Never substitute a fixture
  // title/claim here: doing that can make a valid render look like an unrelated
  // demo when the source catalogue changes.
  return variants.map((variant)=>({...variant,
    title:String(variant.title||'Source-led explainer').trim(),
    promise:String(variant.promise||variant.title||'Source-led explainer').trim(),
    ...(variant.thumbnailText?{thumbnailText:variant.thumbnailText}:{}),
  }));
}
function constrainSourceLockedScript(script:VideoScript):VideoScript{
  return{...script,beats:script.beats.map((beat,index)=>{
    const narration=String(beat.narration||'').trim()||`Observe the ${beat.purpose} shown in the source footage.`;
    const visualIntent=`${String(beat.visualIntent||'').trim()||`Show the ${beat.purpose} action clearly.`} Use only an authorized moving source clip that matches this beat; do not introduce unrelated subjects or unsupported claims.`;
    return{...beat,narration,visualIntent,sourceIds:[]};
  })};
}

function requiresFactualTopicResearch(topic:string):boolean{
  return /\b(top\s*\d+|top\s+ten|ranking|rankings|most|best|powerful|potent|sold|history|historia|datos|facts|comparativa|versus|vs\.?|price|precio|specs|caballos|horsepower|bhp|más potente|mas potente)\b/i.test(String(topic||''));
}

function sourceLockedFallbackPackaging(topic:string):PackagingVariant[]{
  const title=String(topic||'Source-led documentary').trim().replace(/\s+/g,' ').slice(0,96);
  return[1,2,3].map((index)=>({id:`source-locked-${index}`,title,promise:title,thumbnailConcept:'Authorized moving source footage only',curiosity:86-index,clarity:94,credibility:96,differentiation:82+index,score:90-index}));
}
function sourceLockedFallbackScript(topic:string,language:string,targetDurationSec:number,footage:SourceFootage[]):VideoScript{
  const clips=footage.slice(0,Math.max(5,Math.min(8,footage.length)));
  // Keep a complete Short arc even when the source catalogue is tiny. The
  // renderer may reuse authorised clips, but the editorial contract must still
  // contain hook -> context -> evidence -> escalation -> reveal -> payoff.
  const count=Math.max(6,clips.length);
  const duration=Math.max(30,targetDurationSec);
  const topicText=String(topic||'this story').replace(/\s+/g,' ').trim();
  // UI briefs often append production constraints after the editorial idea
  // ("use only...", "no photos...", etc.). Feeding those instructions into
  // the fallback narrator made the hook sound robotic and inflated TTS time.
  // Keep the first editorial clause and extract the subject after a natural
  // topic marker when one is present.
  const topicClause=topicText.split(/\b(?:use only|using only|utiliza solo|con solo|no photos|no stills|no slides|and end|y termina|finish with)\b/i)[0].trim();
  const topicMatch=topicClause.match(/\b(?:about|on|explaining|showing|sobre|acerca de|por qué|por que|cómo|como)\s+(.+)$/i);
  const topicShort=(topicMatch?.[1]??topicClause)
    .replace(/^(?:a|an|the)\s+/i,'')
    .replace(/\b(?:\d{1,3}-second|\d{1,3}\s+second)\b/gi,'')
    .replace(/\s+/g,' ').trim().replace(/[.!?]+$/,'').slice(0,72) || 'this story';
  const slot=duration/count;
  const purposes:Array<VideoScript['beats'][number]['purpose']>=['hook','setup','evidence','evidence','escalation','reveal','payoff','cta'];
  const english=String(language||'').toLowerCase().startsWith('en');
  const beats=Array.from({length:count},(_,index)=>{
    const clip=clips[index%Math.max(1,clips.length)];
    const visible=String(clip?.title||'the supplied moving footage').replace(/\s+/g,' ').trim().slice(0,56);
    const narration=english
      ? index===0?`The surprising signal is ${topicShort}.`
        : index===1?`The context matters because the change is already visible.`
        : index===count-2?`The reveal is the moving connection between these shots.`
        : index===count-1?`The payoff is clear: ${topicShort}.`
        : index===count-3?`That pressure is building, and the next detail explains why.`
        :`This moving evidence adds the next piece of the story.`
      : index===0?`La señal sorprendente es ${topicShort}.`
        : index===1?`El contexto importa porque el cambio ya se ve.`
        : index===count-2?`La revelación es la conexión visible entre estos planos.`
        : index===count-1?`La conclusión es clara: ${topicShort}.`
        : index===count-3?`La presión aumenta y el siguiente detalle explica por qué.`
        :`Esta evidencia en movimiento añade la siguiente pieza de la historia.`;
    const retentionDevice:VideoScript['beats'][number]['retentionDevice']=index===0?'question':index===count-1?'reveal':index===count-2?'reveal':'pattern_interrupt';
    return{id:`fallback-beat-${index+1}`,startSec:Number((index*slot).toFixed(2)),targetDurationSec:Number(slot.toFixed(2)),purpose:purposes[Math.min(index,purposes.length-1)],narration,visualIntent:`Show only the authorized moving source clip titled "${visible}"; preserve the observable action and do not add unsupported subjects or claims.`,sourceIds:[],retentionDevice};
  });
  return{title:String(topic).slice(0,120),language,targetDurationSec:duration,thesis:String(topic),beats,outro:english?'The footage shows the answer; the visible connection is the story.':'El propio material muestra la respuesta: la conexión visible es la historia.'};
}

async function withEditorialTimeout<T>(promise:Promise<T>,timeoutMs:number,label:string):Promise<T>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([promise,new Promise<T>((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label} timed out after ${timeoutMs}ms`)),timeoutMs);})]);}
  finally{if(timer)clearTimeout(timer);}
}

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
const VIDEO_ONLY_SHOT_DIRECTIONS = [
  'Use a wide establishing moving shot that makes the environment and scale legible.',
  'Use a medium tracking shot that follows the subject through one clear action.',
  'Use a close detail shot of the physical change or evidence that advances the claim.',
  'Use an over-shoulder or side-angle shot that reveals a new relationship or consequence.',
  'Use a low or high motivated angle that makes the escalation feel materially different.',
  'Use a clean payoff shot that shows the resulting state and the subject reaction in motion.',
];
function enforceVideoOnlyMovingShot(scene:Scene,index:number):Scene {
  if(scene.kind==='broll')return scene;
  const marker='Video-only moving shot direction:';
  const instruction=String(scene.instruction??'');
  if(instruction.includes(marker))return {...scene,kind:'ai_video',generated:true};
  const direction=VIDEO_ONLY_SHOT_DIRECTIONS[index%VIDEO_ONLY_SHOT_DIRECTIONS.length];
  return {
    ...scene,
    kind:'ai_video',
    generated:true,
    instruction:`${instruction} ${marker} ${direction} Preserve continuous natural motion and a distinct subject/action/angle from adjacent shots; never freeze on a frame, add a card, diagram, readable overlay or artificial zoom.`,
    selectionReason:`VIDEO_ONLY contract: moving shot with deliberate visual variation ${index+1}.`,
  };
}
function conservativePlanCost(input:{scenes:Scene[];narrationSeconds:number;voiceRequired:boolean;voiceCostUsd?:number;fixedCostUsd:number;isShort:boolean;packagingCount:number}){
  const voiceCost=input.voiceCostUsd??(input.voiceRequired?Math.max(0.015,input.narrationSeconds/60*0.08):0);
  const imageCost=input.scenes.filter((scene)=>scene.kind==='ai_image').length*0.08;
  const videoCost=input.scenes.filter((scene)=>scene.kind==='ai_video').reduce((sum,scene)=>sum+Math.max(0,scene.durationSec)*0.12,0);
  const proceduralCost=input.scenes.filter((scene)=>['chart','motion_graphic','text','source_card'].includes(scene.kind)).length*0.003;
  const thumbnailCost=input.isShort?0:input.packagingCount*0.08;
  // Reserve render/storage plus a small variance buffer so the cap is enforced before expensive calls.
  return roundMoney(Math.max(0,input.fixedCostUsd)+voiceCost+imageCost+videoCost+proceduralCost+thumbnailCost+0.22+0.08);
}
function fitScenePlanToBudget(input:{scenes:Scene[];maxCostUsd:number;narrationSeconds:number;voiceRequired:boolean;voiceCostUsd?:number;fixedCostUsd:number;isShort:boolean;packagingCount:number;imageAvailable:boolean;videoOnly?:boolean}):BudgetFit{
  // VIDEO_ONLY is a hard editorial contract: the budget guard may not replace
  // a moving shot with a still, card or procedural filler.
  const scenes:Scene[]=input.scenes.map((scene)=>input.videoOnly&&scene.kind!=='broll'
    ? {...scene,kind:'ai_video' as const,generated:true,selectionReason:'VIDEO_ONLY contract: moving video required before budget planning.'}
    : {...scene});
  const downgrades:string[]=[];
  const projected=()=>conservativePlanCost({...input,scenes});
  const candidates=[...scenes.keys()].sort((a,b)=>Number(scenes[a].visualValue??0)-Number(scenes[b].visualValue??0));
  for(const index of candidates){
    if(projected()<=input.maxCostUsd)break;
    const scene=scenes[index];
    if(scene.kind!=='ai_video'||input.videoOnly)continue;
    const before=scene.kind;
    if(input.imageAvailable){scene.kind='ai_image';scene.generated=true;scene.costTier='low';}
    else{scene.kind='motion_graphic';scene.generated=false;scene.costTier='free';}
    scene.selectionReason=`Budget guard downgraded ${before} before provider spend; ${scene.selectionReason??''}`.trim();
    downgrades.push(`${scene.id}:${before}->${scene.kind}`);
  }
  for(const index of candidates){
    if(projected()<=input.maxCostUsd)break;
    const scene=scenes[index];
    if(scene.kind!=='ai_image'||input.videoOnly)continue;
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
  sourceFootage?: SourceFootage[];
  /** When enabled, every non-source visual beat must be a real video clip. */
  videoOnly?: boolean;
  /** When enabled, every scene must use an authorized moving source clip. */
  sourcedOnly?: boolean;
  visualMixPolicy?: 'MIXED_MEDIA' | 'SOURCE_FIRST';
  /** Persist a live progress signal without making the editorial pipeline depend on the UI. */
  onProgress?: (event: PipelineEvent) => void | Promise<void>;
}): Promise<{ state: PipelineState; events: PipelineEvent[]; dossier?: ResearchDossier; manifest?: ProductionManifest; qa?: QaReport; attention?: AttentionReview; finalInspection?: FinalMediaInspection; renderUri?: string; externalId?: string }> {
  const events: PipelineEvent[] = [];
  const event = (state: PipelineState, message: string) => {
    const progress = { at: new Date().toISOString(), state, message } satisfies PipelineEvent;
    events.push(progress);
    // Progress persistence is deliberately best-effort. A telemetry/database hiccup
    // must never turn a valid video production into a failed production.
    try { Promise.resolve(input.onProgress?.(progress)).catch((error) => console.warn(`[pipeline] progress persistence failed: ${error instanceof Error ? error.message : String(error)}`)); } catch (error) { console.warn(`[pipeline] progress signal failed: ${error instanceof Error ? error.message : String(error)}`); }
  };
  const contentFormat = input.contentFormat ?? 'LONG_HORIZONTAL';
  const videoOnly = input.videoOnly === true;
  const isVertical = contentFormat === 'SHORT_VERTICAL';
  const isCompact = contentFormat !== 'LONG_HORIZONTAL';
  const aspectRatio = isVertical ? '9:16' as const : '16:9' as const;
  const frame = isVertical ? { width:1080,height:1920 } : { width:1920,height:1080 };
  // Source-first Shorts use the renderer's warm-container speed profile. The
  // editorial contract remains 1080x1920 in the manifest, while final
  // delivery is 720x1280 HD to keep a single Cloudflare container responsive.
  const fastSourceDelivery = Boolean(videoOnly && isVertical && input.sourceFootage?.length && input.visualMixPolicy === 'SOURCE_FIRST');
  const renderFrame = fastSourceDelivery ? { width:720,height:1280 } : frame;
  const archetypeModel=input.model as ArchetypeAwareTextModel;
  const contentArchetype=input.contentArchetype??archetypeModel.contentArchetypeDecision??(archetypeModel.contentArchetypeProfile?{archetype:archetypeModel.contentArchetypeProfile.id,confidence:0,reasons:['Runtime-bound Content Archetype profile'],profile:archetypeModel.contentArchetypeProfile}:undefined);
  const executionPlan=buildArchetypeExecutionPlan(contentArchetype,contentFormat);
  event('PLAN', `Content Archetype ${executionPlan.archetypeId} → research=${executionPlan.researchMode} script=${executionPlan.scriptMode} voice=${executionPlan.voiceMode} visuals=${executionPlan.visualMode}`);

  let dossier:ResearchDossier;
  // AUTO source-first runs already carry a rights-cleared moving-footage
  // catalogue and the same no-stills contract. Treat them as locked too, so
  // they do not spend a second remote editorial pass on packaging/script
  // generation after source discovery has completed.
  const sourceLocked=Boolean(input.sourceFootage?.length)
    && (input.sourcedOnly===true || String(input.scriptGuidance??'').includes('HARD VISUAL SOURCE LOCK'));
  // A source lock governs visuals, not editorial truth. Ranking, history and
  // specification briefs still need web research so the narration cannot be
  // replaced by generic filler just because real footage was found quickly.
  const factualResearchRequired=requiresFactualTopicResearch(input.topic);
  // A hard source lock is already an explicit authorization for the
  // deterministic source-first route. Keep the fast path enabled by default
  // even if an older container snapshot missed the optional feature flag;
  // only an explicit `false` disables it for diagnostics.
  const sourceLockedFastPath=sourceLocked&& !factualResearchRequired && String(process.env.AUTO_YTB_SOURCE_LOCKED_FAST_PATH??'true').toLowerCase()!=='false';
  if((executionPlan.researchRequired||factualResearchRequired)&&(!sourceLocked||factualResearchRequired)){
    if(!input.search){event('BLOCKED','Research is required by the Content Archetype but no search provider is configured');return{state:'BLOCKED',events};}
    event('RESEARCH', `Researching ${input.topic} for ${contentFormat}`);
    dossier = await buildResearchDossier({
      topic: input.topic,
      search: input.search,
      model: input.model,
      searchTimeoutMs: 75_000,
      synthesisTimeoutMs: 120_000,
      onProgress: (message) => event('RESEARCH', message),
    });
    if (dossier.blockingIssues.length || !dossier.recommendedAngleId) {
      event('BLOCKED', `Research blocked: ${dossier.blockingIssues.join('; ')}`);
      return { state: 'BLOCKED', events, dossier };
    }
  }else if(sourceLocked){
    dossier=buildSourceLockedDossier(input.topic,input.sourceFootage!);
    event('RESEARCH', `Research locked to ${input.sourceFootage!.length} supplied source clip(s); unsupported external claims disabled`);
  }else{
    dossier=buildCreativeDossier(input.topic,contentArchetype);
    event('RESEARCH', `Research skipped by ${executionPlan.archetypeId}; creative-original safety contract active`);
  }
  const angle = dossier.angles.find((candidate) => candidate.id === dossier.recommendedAngleId)!;

  const formatScriptGuidance = isVertical
    ? 'This is a native vertical YouTube Short. Deliver the viewer promise immediately, create tension or curiosity in the first spoken/visual beat, use one focused narrative arc, remove all nonessential setup, and end on a concrete payoff. Never open with greetings, housekeeping or a compressed long-form introduction.'
    : contentFormat === 'SHORT_HORIZONTAL'
      ? 'This is a concise horizontal documentary/explainer pilot. Deliver the viewer promise immediately, use a focused six-beat arc with visible progression, remove long-form throat-clearing, and end on a concrete payoff without filler.'
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
  const thumbnailVariantCount=contentFormat==='SHORT_VERTICAL'?0:2;
  let videoFallbackDisabled=false;
  let shotCoverage: ReturnType<typeof evaluateShotCoverage> | undefined;

  const enforceSourceCoverage = () => {
    if (!input.sourcedOnly) return true;
    shotCoverage = evaluateShotCoverage({ script: draftScript, scenes: draftScenes, sourceFootage: input.sourceFootage ?? [], requireCleared: true, minimumBeatCoverage: 1 });
    if (!shotCoverage.passed) {
      event('BLOCKED', `SOURCE_COVERAGE_GATE: ${shotCoverage.blockers.slice(0, 8).join(' | ')}`);
      return false;
    }
    const reviewCount = shotCoverage.rows.filter((row) => row.status === 'REVIEW').length;
    event('QA', `Source shot-contract coverage PASS · beats ${(shotCoverage.beatCoverageRatio * 100).toFixed(0)}% · timeline ${(shotCoverage.timelineCoverageRatio * 100).toFixed(0)}% · semantic review=${reviewCount}`);
    return true;
  };

  for(let attempt=0;attempt<=maxRepairs;attempt+=1){
    if(sourceLockedFastPath){
      event('PACKAGING','Source-locked fast path: using deterministic source-bound packaging while preserving moving-footage-only policy.');
      packaging=sourceLockedFallbackPackaging(input.topic);
      packagingChoice=selectPackagingWithExploration({ variants: packaging, profile: input.packagingLearning, experimentSeed: `${input.projectId}:${contentFormat}:locked-fast` });
      // The deterministic fallback already pays the promise in its first and
      // final sentence. Do not prepend the full packaging title here: on a
      // 30-second Short that duplicate sentence can stretch ElevenLabs audio
      // to 45+ seconds before the timeline is even rendered.
      draftScript=sourceLockedFallbackScript(input.topic,input.language,input.targetDurationSec,input.sourceFootage??[]);
      draftScenes=planScenes(draftScript,{targetSceneDurationSec:adaptiveSceneDuration,sources:dossier.sources,sourceFootage:input.sourceFootage,visualMode:executionPlan.visualMode,generativeSpendBias:executionPlan.generativeSpendBias,realityMode:executionPlan.realityMode,cameraProfile:executionPlan.cameraProfile,visualMixPolicy:input.visualMixPolicy??'SOURCE_FIRST'});
      if(!enforceSourceCoverage())return{state:'BLOCKED',events,dossier,attention};
      attention=reviewAttentionBlueprint({script:draftScript,packaging,scenes:draftScenes,contentFormat,executionPlan,selectedPackagingId:packagingChoice.selected.id,minScore:minAttentionScore,sourceOnly:input.sourcedOnly});
      event('QA',`Source-locked fast-path attention preflight ${attention.score}/100 · ${attention.ready?'READY':'REVIEW'} · no remote editorial call required`);
      break;
    }
    const repairLabel=attempt===0?'initial attention draft':`attention repair ${attempt}/${maxRepairs}`;
    event('SCRIPT', `Writing ${repairLabel} in native ${input.language} for ${angle.title} as ${executionPlan.scriptMode}`);
    if(attempt===0||!packaging?.length||!packagingChoice){
      event('PACKAGING', input.packagingGuidance ? 'Generating packaging hypotheses with bounded owned-channel learning guidance' : 'Generating packaging hypotheses');
      try{
        packaging=await withEditorialTimeout(generatePackaging({ angle, model: input.model, count: 3, guidance:[input.packagingGuidance,'The title/thumbnail promise must be paid into immediately by the opening and fully resolved by the payoff.'].filter(Boolean).join('\n') }),90_000,'Source-locked packaging');
      }catch(error){
        if(!sourceLocked)throw error;
        event('PACKAGING',`Gemini packaging unavailable; using deterministic source-bound packaging fallback (${String(error instanceof Error?error.message:error).slice(0,160)})`);
        packaging=sourceLockedFallbackPackaging(input.topic);
      }
      if(sourceLocked)packaging=constrainSourceLockedPackaging(packaging);
      packagingChoice=selectPackagingWithExploration({ variants: packaging, profile: input.packagingLearning, experimentSeed: `${input.projectId}:${contentFormat}:locked` });
      event('PACKAGING', `Locked packaging ${packagingChoice.selected.id} for autonomous attention repairs so the script does not chase a moving promise.`);
    }else{
      event('PACKAGING', `Keeping locked packaging ${packagingChoice.selected.id} during repair ${attempt}/${maxRepairs}`);
    }

    const lockedPromise=packagingChoice?.selected
      ?`LOCKED PACKAGING CONTRACT — do not change the viewer promise. Title: "${packagingChoice.selected.title}". Promise: "${packagingChoice.selected.promise}". The first beat must immediately pay into this promise and the final payoff must resolve it.`
      :'';
    const guidance=[baseScriptGuidance,lockedPromise,...revisionGuidance].filter(Boolean).join('\n');
    try{
      draftScript=await withEditorialTimeout(generateScript({ dossier, angle, model: input.model, language: input.language, targetDurationSec: input.targetDurationSec, guidance, factClaimMode:executionPlan.factClaimMode,scriptMode:executionPlan.scriptMode }),120_000,'Source-locked script');
    }catch(error){
      if(!sourceLocked)throw error;
      event('SCRIPT',`Gemini script unavailable; using deterministic source-bound script fallback (${String(error instanceof Error?error.message:error).slice(0,160)})`);
      draftScript=sourceLockedFallbackScript(input.topic,input.language,input.targetDurationSec,input.sourceFootage??[]);
    }
    if(sourceLocked)draftScript=constrainSourceLockedScript(draftScript);
    draftScript=ensureOpeningPromise({script:draftScript,packaging,selectedPackagingId:packagingChoice.selected.id,contentFormat,visualAction:executionPlan.scriptMode==='VISUAL_ACTION'});

    event('PLAN', `Planning ${aspectRatio} ${executionPlan.visualMode} timeline for attention pass ${attempt+1}`);
    draftScenes=planScenes(draftScript,{targetSceneDurationSec:adaptiveSceneDuration,sources:dossier.sources,sourceFootage:input.sourceFootage,visualMode:executionPlan.visualMode,generativeSpendBias:executionPlan.generativeSpendBias,realityMode:executionPlan.realityMode,cameraProfile:executionPlan.cameraProfile,visualMixPolicy:input.visualMixPolicy??'MIXED_MEDIA'});
    if(!enforceSourceCoverage())return{state:'BLOCKED',events,dossier,attention};
    if(videoOnly){
      draftScenes=draftScenes.map((scene,index)=>enforceVideoOnlyMovingShot(scene,index));
      event('PLAN','VIDEO_ONLY contract active: stills, charts, cards, text and procedural graphics are disabled inside the video.');
    }
    const spendSoFar=Math.max(0,Number(input.additionalCostUsd?.() ?? input.model.getNonAssetCostUsd?.() ?? 0));
    const budgetFit=fitScenePlanToBudget({scenes:draftScenes,maxCostUsd:input.maxCostUsd,narrationSeconds:executionPlan.voiceRequired?input.targetDurationSec:0,voiceRequired:executionPlan.voiceRequired,fixedCostUsd:spendSoFar,isShort:isVertical,packagingCount:thumbnailVariantCount,imageAvailable:Boolean(input.imageProvider),videoOnly});
    draftScenes=budgetFit.scenes;projectedCostUsd=budgetFit.projectedCostUsd;
    if(budgetFit.changed)event('PLAN',`Pre-spend budget guard downgraded ${budgetFit.downgrades.length} scene(s): ${budgetFit.downgrades.join(', ')} · projected $${projectedCostUsd.toFixed(2)} / cap $${input.maxCostUsd.toFixed(2)}`);
    if(projectedCostUsd>input.maxCostUsd){
      event('BLOCKED',`Hard budget cannot be met before media generation: projected $${projectedCostUsd.toFixed(2)} / cap $${input.maxCostUsd.toFixed(2)} after all safe downgrades`);
      return{state:'BLOCKED',events,dossier};
    }
    attention=reviewAttentionBlueprint({script:draftScript,packaging,scenes:draftScenes,contentFormat,executionPlan,selectedPackagingId:packagingChoice.selected.id,minScore:minAttentionScore,sourceOnly:input.sourcedOnly});
    const criticalCodes=attention.issues.filter((issue)=>issue.severity==='critical').map((issue)=>issue.code);
    event('QA', `Attention preflight ${attention.score}/100 · ${attention.ready?'READY':'REPAIR'} · visual variants=${attention.metrics.visualKindCount} · visual changes=${attention.metrics.visualChangeRatePerMinute.toFixed(1)}/min · critical=${criticalCodes.join(',')||'none'} · issues=${attention.issues.map((issue)=>issue.code).join(',')||'none'}`);
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
      const current=adaptiveSceneDuration??(isCompact?5:10);
      adaptiveSceneDuration=Math.max(isCompact?2.5:4.5,current*0.82);
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
    voice = await withEditorialTimeout(
      input.voiceProvider.synthesize({ text:narrationText, voice: input.voice, language: input.language }),
      180_000,
      'Voice synthesis',
    );
    const sync=synchronizeTimelineToVoice(draftScript,draftScenes,voice.alignment,voice.durationSeconds);
    script=sync.script;
    scenes=sync.scenes;
    timelineDuration=sync.durationSeconds;
    event('PLAN', `Voice timeline synchronized to ${sync.durationSeconds.toFixed(1)}s audio · alignment coverage ${(sync.alignmentCoverage*100).toFixed(0)}%`);
  }else{
    event('ASSETS', `Skipping synthesized voice for ${executionPlan.archetypeId}; visual-first timing preserved at ${timelineDuration.toFixed(1)}s`);
  }

  const editorialCostPreMedia=Math.max(0,Number(input.additionalCostUsd?.() ?? input.model.getNonAssetCostUsd?.() ?? 0));
  const postVoiceBudget=fitScenePlanToBudget({scenes,maxCostUsd:input.maxCostUsd,narrationSeconds:voice?.durationSeconds??0,voiceRequired:executionPlan.voiceRequired,voiceCostUsd:Number(voice?.costUsd??0),fixedCostUsd:editorialCostPreMedia,isShort:isVertical,packagingCount:thumbnailVariantCount,imageAvailable:Boolean(input.imageProvider),videoOnly});
  scenes=postVoiceBudget.scenes;projectedCostUsd=postVoiceBudget.projectedCostUsd;
  if(videoOnly){
    scenes=scenes.map((scene,index)=>enforceVideoOnlyMovingShot(scene,index));
  }
  if(postVoiceBudget.changed){
    event('PLAN',`Post-voice budget guard downgraded ${postVoiceBudget.downgrades.length} scene(s): ${postVoiceBudget.downgrades.join(', ')} · projected $${projectedCostUsd.toFixed(2)} / cap $${input.maxCostUsd.toFixed(2)}`);
    attention=reviewAttentionBlueprint({script,packaging,scenes,contentFormat,executionPlan,selectedPackagingId:packagingChoice.selected.id,minScore:minAttentionScore,sourceOnly:input.sourcedOnly});
    if(!attention.ready){event('BLOCKED',`Budget-safe visual plan would violate attention gate: ${attention.issues.map((issue)=>issue.code).join(', ')}`);return{state:'BLOCKED',events,dossier,attention};}
  }
  if(projectedCostUsd>input.maxCostUsd){event('BLOCKED',`Hard budget exceeded after voice timing: projected $${projectedCostUsd.toFixed(2)} / cap $${input.maxCostUsd.toFixed(2)}`);return{state:'BLOCKED',events,dossier,attention};}

  const needsVideo=scenes.some((scene)=>scene.generated&&scene.kind==='ai_video');
  const needsImage=scenes.some((scene)=>scene.generated&&scene.kind==='ai_image')||!isVertical;
  if(needsVideo&&!input.videoProvider){event('BLOCKED',`${executionPlan.visualMode} scene plan requires a video provider but none is configured`);return{state:'BLOCKED',events,dossier,attention};}
  if(needsImage&&!input.imageProvider){event('BLOCKED',`${executionPlan.visualMode} scene/thumbnail plan requires an image provider but none is configured`);return{state:'BLOCKED',events,dossier,attention};}

  const visualKinds = ['ai_video','ai_image','broll','source_card','chart','motion_graphic','text'];
  const visualMix = Object.fromEntries(visualKinds.map((kind) => [kind, scenes.filter((scene) => scene.kind === kind).length]));
  const estimatedCostUsd=projectedCostUsd;
  event('PLAN', `Archetype visual mix: ${Object.entries(visualMix).map(([kind,count]) => `${kind}=${count}`).join(', ')} · generative bias ${executionPlan.generativeSpendBias.toFixed(2)} · conservative pre-render $${estimatedCostUsd.toFixed(2)}/${input.maxCostUsd.toFixed(2)}`);

  event('ASSETS', `Generating ${aspectRatio} scene visuals${isVertical ? '' : ' plus thumbnail variants'}`);
  const assets: AssetRecord[] = [];
  const beatForScene=(scene:Scene)=>script.beats.find((beat)=>scene.id===beat.id||scene.id.startsWith(`${beat.id}-s`));
  const sourceWindowUse=new Map<string,number>();
  const sourceWindowCount=new Map<string,number>();
  for(const candidate of scenes.filter((scene)=>scene.kind==='broll'&&scene.sourceFootageId)){
    const key=String(candidate.sourceFootageId);
    sourceWindowCount.set(key,(sourceWindowCount.get(key)??0)+1);
  }

  for (const scene of scenes.filter((candidate) => !candidate.generated && ['broll','chart','motion_graphic','text','source_card'].includes(candidate.kind))) {
    if(scene.kind==='broll'){
      const footage=input.sourceFootage?.find((item)=>item.id===scene.sourceFootageId&&item.rightsStatus!=='BLOCKED');
      if(!footage)throw new Error(`Scene ${scene.id} selected source footage but no matching sourceFootage asset was supplied`);
      const baseStart=Math.max(0,Number(footage.startSec??0)),baseEnd=footage.endSec==null?null:Math.max(baseStart,Number(footage.endSec));
      const shotDuration=Math.max(0.2,Number(scene.durationSec??1));
      const usage=sourceWindowUse.get(footage.id)??0;
      const plannedUses=Math.max(1,sourceWindowCount.get(footage.id)??1);
      const available=baseEnd==null?null:Math.max(0,baseEnd-baseStart);
      const slotSize=available==null?0:available/plannedUses;
      // SOURCE_FIRST still uses real motion windows instead of replaying the
      // entire same clip for every beat. This keeps the fast path cheap while
      // avoiding repetitive loops in the finished Short.
      const sourceFirstReuse=available==null||slotSize+0.05<shotDuration;
      const clipStartSec=sourceFirstReuse?baseStart:baseStart+usage*slotSize;
      const clipEndSec=baseEnd==null?null:Math.min(baseEnd,clipStartSec+Math.max(0.2,Math.min(shotDuration,slotSize)));
      sourceWindowUse.set(footage.id,usage+1);
      assets.push({id:`footage-${scene.id}`,uri:footage.uri,mimeType:'video/mp4',provider:'user-source-footage',model:'source-clip-v1',costUsd:0,sceneId:scene.id,generated:false,sourceIds:scene.sourceIds,sourceUrl:footage.sourceUrl,license:footage.rightsStatus==='CLEARED'?footage.license:'verify-before-public',metadata:{kind:'broll',sourceFootageId:footage.id,title:footage.title??null,rightsStatus:footage.rightsStatus,clipStartSec,clipEndSec,cropMode:footage.cropMode??'CENTER',sourceId:footage.sourceId??null,sourceRefs:scene.sourceRefs??[],instruction:scene.instruction,windowStrategy:sourceFirstReuse?'source-first-full-window-reuse-v2':'non-overlapping-source-slots-v3'}});
      continue;
    }
    const direct = scene.kind === 'source_card' ? scene.sourceRefs?.find((ref) => ref.policy === 'DIRECT_ASSET_ALLOWED' && ref.url) : undefined;
    if (direct?.url) {
      assets.push({id:`source-${scene.id}`,uri:direct.url,mimeType:/\.(mp4|webm)(?:\?|#|$)/i.test(direct.url)?'video/mp4':'image/jpeg',provider:'source-backed-direct',model:'source-visual-v1',costUsd:0,sceneId:scene.id,generated:false,sourceIds:scene.sourceIds,sourceUrl:direct.url,license:'verify-before-public',metadata:{kind:scene.kind,instruction:scene.instruction,sourceRefs:scene.sourceRefs??[],visualValue:scene.visualValue??null,selectionReason:scene.selectionReason??null}});
      continue;
    }
    assets.push({id:`procedural-${scene.id}`,uri:`procedural://${scene.kind}/${encodeURIComponent(scene.id)}`,mimeType:'application/x-auto-ytb-visual',provider:'procedural-ffmpeg',model:scene.kind==='source_card'?'source-card-v1':'hybrid-visual-v1',costUsd:0.002,sceneId:scene.id,generated:false,sourceIds:scene.sourceIds,sourceUrl:scene.sourceRefs?.[0]?.url,license:'original-transformed-card',metadata:{kind:scene.kind,instruction:scene.instruction,sourceRefs:scene.sourceRefs??[],visualValue:scene.visualValue??null,selectionReason:scene.selectionReason??null}});
  }

  const generatedScenes=scenes.filter((candidate)=>candidate.generated);
  const generatedAssets:Array<AssetRecord|undefined>=Array.from({length:generatedScenes.length});
  const generationConcurrency=Math.max(1,Math.min(4,Math.floor(Number(process.env.AUTO_YTB_VIDEO_CONCURRENCY||3))));
  const generateScene=async(scene:Scene):Promise<AssetRecord>=>{
    const beat=beatForScene(scene);
    const beatContext=beat?.narration?.replace(/\s+/g,' ').trim().slice(0,520);
    const visualPrompt=[
      scene.instruction,
      beatContext?`Production beat context for subject/cast grounding: ${beatContext}`:'',
      `Compose natively for ${aspectRatio}; keep the focal subject readable on a phone screen. The visual must explain, prove, escalate or refresh the viewer promise rather than act as generic decoration.`,
      scene.kind === 'ai_video' ? 'Depict one concrete observable action from this beat with a clear before→during→after state change; use motivated camera movement, subject movement or transformation. Do not make a still image with a zoom, floating text, fake UI or unrelated montage.' : '',
    ].filter(Boolean).join(' ');
    let generated:BinaryAsset|undefined;
    if(scene.kind==='ai_video'){
      let videoError:unknown;
      if(!videoFallbackDisabled)try{
        generated=await input.videoProvider!.generate({ prompt:visualPrompt, durationSeconds: Math.min(scene.durationSec, 8), aspectRatio });
      }catch(error){videoError=error;videoFallbackDisabled=true;}
      if(videoError||videoFallbackDisabled){
        const reason=String(videoError instanceof Error?videoError.message:videoError??'video provider disabled after an earlier failure').slice(0,240);
        if(videoOnly)throw new Error(`VIDEO_ONLY_PROVIDER_FAILED:${scene.id}:${reason}`);
        if(!input.imageProvider)throw(videoError??new Error('Video fallback requires an image provider'));
        event('ASSETS',`Video unavailable for ${scene.id}; falling back to AI image plus local motion (${reason})`);
        const fallbackPrompt=`${visualPrompt} Produce one strong documentary keyframe for a local slow camera move. Preserve the subject, composition and visual meaning; no text, logos or watermarks.`;
        generated=await input.imageProvider.generate({prompt:fallbackPrompt,aspectRatio});
        generated={...generated,metadata:{...(generated.metadata??{}),fallbackFrom:'ai_video',fallbackReason:reason}};
      }
    }else generated=await input.imageProvider!.generate({ prompt:visualPrompt, aspectRatio });
    if(!generated)throw new Error(`Scene ${scene.id} produced no visual asset`);
    return {...generated,sceneId:scene.id,generated:true,sourceIds:scene.sourceIds,metadata:{...(generated.metadata??{}),sourceRefs:scene.sourceRefs??[],visualValue:scene.visualValue??null,selectionReason:scene.selectionReason??null,beatContext:beatContext??null}};
  };
  let nextGeneratedIndex=0;
  await Promise.all(Array.from({length:Math.min(generationConcurrency,generatedScenes.length)},async()=>{
    while(true){
      const index=nextGeneratedIndex++;
      const scene=generatedScenes[index];
      if(!scene)break;
      event('ASSETS',`Vídeo ${index+1}/${generatedScenes.length}: generando ${scene.id}.`);
      generatedAssets[index]=await generateScene(scene);
      event('ASSETS',`Vídeo ${index+1}/${generatedScenes.length}: clip listo.`);
    }
  }));
  assets.push(...generatedAssets.filter((asset):asset is AssetRecord=>Boolean(asset)));

  const thumbnails: ThumbnailAsset[] = [];
  if (!isVertical) {
    for (const variant of packaging.slice(0,thumbnailVariantCount)) {
      const background = await input.imageProvider!.generate({prompt:`${variant.thumbnailConcept}. YouTube thumbnail background for ${executionPlan.archetypeId}: one dominant focal subject, high visual contrast, uncluttered composition, strong separation between foreground and background, leave intentional negative space for optional typography, no readable fake text, no fake logos, no watermarks. The visual promise must be truthful to the opening and payoff.`,aspectRatio:'16:9'});
      const composed = await input.thumbnailComposer.compose({backgroundUri:background.uri,text:variant.thumbnailText,outputKey:`${input.projectId}/${variant.id}.jpg`});
      thumbnails.push({ ...composed, packagingId: variant.id, text: variant.thumbnailText, costUsd: (background.costUsd ?? 0) + (composed.costUsd ?? 0) });
    }
  }

  const editorialCostUsd=Math.max(0,Number(input.additionalCostUsd?.() ?? input.model.getNonAssetCostUsd?.() ?? 0));
  const mediaCostUsd=(voice?.costUsd ?? 0) + assets.reduce((sum, asset) => sum + (asset.costUsd ?? 0), 0) + thumbnails.reduce((sum, asset) => sum + (asset.costUsd ?? 0), 0);
  const profile={...(contentArchetype?.profile??{})};
  const manifest: ProductionManifest = {
    projectId:input.projectId,createdAt:new Date().toISOString(),contentFormat,aspectRatio,frame:renderFrame,
    contentArchetype:{version:1,id:String(contentArchetype?.archetype??profile.id??executionPlan.archetypeId),label:String(profile.label??contentArchetype?.archetype??executionPlan.archetypeId),confidence:Number(contentArchetype?.confidence??0),reasons:contentArchetype?.reasons??[],voiceMode:executionPlan.voiceMode,realityMode:executionPlan.realityMode,cameraProfile:executionPlan.cameraProfile,syntheticDisclosurePolicy:executionPlan.syntheticDisclosurePolicy,profile},
    executionPlan,script,packaging,thumbnails,selectedPackagingId:packagingChoice.selected.id,packagingSelection:{mode:packagingChoice.mode,explorationRate:packagingChoice.explorationRate,scores:packagingChoice.scores},scenes,assets,sourceFootage:input.sourceFootage,voice,estimatedCostUsd,actualCostUsd:editorialCostUsd+mediaCostUsd,containsSyntheticMedia:scenes.some((scene)=>scene.generated)||assets.some((asset)=>asset.generated),finalMediaPolicy:videoOnly?'VIDEO_ONLY':'MIXED_MEDIA',shotCoverage:shotCoverage ? { beatCoverageRatio: shotCoverage.beatCoverageRatio, timelineCoverageRatio: shotCoverage.timelineCoverageRatio, blockers: shotCoverage.blockers } : undefined
  };
  event('PLAN', `Metered pre-render spend $${manifest.actualCostUsd.toFixed(4)} · conservative plan $${manifest.estimatedCostUsd.toFixed(4)} · editorial $${editorialCostUsd.toFixed(4)} · media $${mediaCostUsd.toFixed(4)} · cap $${input.maxCostUsd.toFixed(2)}`);
  if(Math.max(manifest.actualCostUsd,manifest.estimatedCostUsd)>input.maxCostUsd){event('BLOCKED',`Hard cost guard tripped before render: $${Math.max(manifest.actualCostUsd,manifest.estimatedCostUsd).toFixed(2)} / $${input.maxCostUsd.toFixed(2)}`);return{state:'BLOCKED',events,dossier,manifest,attention};}

  event('QA', `Running factual/provenance/originality/rights/attention/cost gates plus ${executionPlan.archetypeId} execution contract`);
  const baseQa = runQa({ dossier, script, manifest, maxCostUsd: input.maxCostUsd,minAttentionScore });
  const qa=reconcileQaForExecutionPlan(baseQa,manifest,executionPlan);
  if (!qa.passed) {event('BLOCKED', `QA blockers: ${qa.blockers.join(', ')} · ${qa.checks.filter((check)=>check.status==='FAIL').map((check)=>`${check.id}=${check.message}`).join(' | ')}`);return { state:'BLOCKED',events,dossier,manifest,qa,attention:qa.attention };}

  const stored = await input.store.put({ key:`projects/${input.projectId}/manifest.json`,contentType:'application/json',data:JSON.stringify(manifest) });
  event('RENDER', `Rendering ${renderFrame.width}x${renderFrame.height} ${fastSourceDelivery?'fast source-first HD · ':''}${executionPlan.voiceRequired?'synchronized to voice':'visual-first'} from ${stored.uri}`);
  const render = await input.renderer.render({ manifestUri:stored.uri,outputKey:`projects/${input.projectId}/final.mp4`,videoOnly,visualMixPolicy:input.visualMixPolicy,fastSourceDelivery });
  if(render.metadata?.renderExecution)manifest.renderExecution=render.metadata.renderExecution as ProductionManifest['renderExecution'];
  const expectedCaptionBurn=Boolean(manifest.captionPlan?.enabled&&manifest.captionPlan.burnIn);
  if(expectedCaptionBurn&&!manifest.renderExecution?.captionsBurned){
    event('BLOCKED',`Editorial finish rejected: ${manifest.captionPlan?.preset??'caption'} captions were required but no burn-in execution proof was returned`);
    return{state:'BLOCKED',events,dossier,manifest,qa,attention:qa.attention,renderUri:render.uri};
  }
  const requireFinalAudio=executionPlan.voiceRequired||executionPlan.audioMode==='NATURAL_SOUND';
  const finalInspection:FinalMediaInspection=input.renderer.inspect
    ? await input.renderer.inspect({fileUri:render.uri,expectedWidth:renderFrame.width,expectedHeight:renderFrame.height,expectedDurationSeconds:timelineDuration,requireAudio:requireFinalAudio,deepChecks:!fastSourceDelivery})
    : {passed:false,score:0,hasVideo:false,hasAudio:false,issues:['renderer-inspection-unavailable']};
  event('QA', `Final render inspection ${finalInspection.score}/100 · ${finalInspection.passed?'PASS':'FAIL'} · ${finalInspection.width??'?'}x${finalInspection.height??'?'} · ${finalInspection.durationSeconds??'?'}s · audio ${requireFinalAudio?'required':'optional'}`);
  if(!finalInspection.passed){event('BLOCKED',`Final render rejected: ${finalInspection.issues.join(', ')}`);return{state:'BLOCKED',events,dossier,manifest,qa,attention:qa.attention,finalInspection,renderUri:render.uri};}

  if (!input.autoUploadPrivate) {
    event('READY_FOR_REVIEW', isVertical ? `Native vertical Short render ready · ${executionPlan.archetypeId} · attention ${qa.attention.score}/100 · render QA ${finalInspection.score}/100` : `Render and ${thumbnails.length} thumbnail variants ready · ${executionPlan.archetypeId} · render QA ${finalInspection.score}/100`);
    return { state:'READY_FOR_REVIEW',events,dossier,manifest,qa,attention:qa.attention,finalInspection,renderUri:render.uri };
  }

  event('PRIVATE_UPLOAD', `Uploading private ${contentFormat}`);
  const selected = packaging.find((variant) => variant.id === manifest.selectedPackagingId) ?? packaging[0];
  const upload = await input.publisher.uploadPrivate({fileUri:render.uri,title:selected?.title??script.title,description:dossier.executiveSummary,tags:isVertical?['Shorts']:[],language:input.language,containsSyntheticMedia:qa.containsSyntheticMedia});
  if (!isVertical) {const selectedThumbnail=thumbnails.find((thumbnail)=>thumbnail.packagingId===manifest.selectedPackagingId)??thumbnails[0];if(selectedThumbnail)await input.publisher.setThumbnail({externalId:upload.externalId,fileUri:selectedThumbnail.uri});}
  event('READY_FOR_REVIEW', `Private ${contentFormat} upload ${upload.externalId} ready for downstream publication policy · ${executionPlan.archetypeId} · attention ${qa.attention.score}/100 · render QA ${finalInspection.score}/100`);
  return { state:'READY_FOR_REVIEW',events,dossier,manifest,qa,attention:qa.attention,finalInspection,renderUri:render.uri,externalId:upload.externalId };
}
