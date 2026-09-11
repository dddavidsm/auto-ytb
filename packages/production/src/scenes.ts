import type { ContentExecutionPlan, VideoScript, Scene, ScriptBeat } from './types.js';
import { buildVisualSourceRefs, type SourceLike } from './source-visuals.js';

const clamp=(value:number,min=0,max=100)=>Math.max(min,Math.min(max,value));
const clamp01=(value:number)=>Math.max(0,Math.min(1,value));

type ScenePlanningOptions = {
  targetSceneDurationSec?: number;
  sources?: SourceLike[];
  visualMode?: ContentExecutionPlan['visualMode'];
  generativeSpendBias?: number;
  realityMode?: string;
  cameraProfile?: string;
};

function scoreVisualValue(beat: ScriptBeat, index: number): number {
  const purposeBoost: Record<ScriptBeat['purpose'], number> = { hook:28, setup:8, evidence:14, escalation:20, reveal:30, payoff:24, cta:4 };
  const retentionBoost = beat.retentionDevice && beat.retentionDevice !== 'none' ? 12 : 0;
  const intentBoost = /collapse|race|battle|transformation|future|reconstruction|explosion|breakthrough|impossible|visualize|reaction|chase|jump|discover|caught|surprise/i.test(beat.visualIntent) ? 18 : 0;
  return clamp(35 + purposeBoost[beat.purpose] + retentionBoost + intentBoost - index * 5);
}

function hasQuantitativeIntent(beat: ScriptBeat): boolean {
  return /\b(percent|percentage|billion|million|growth|decline|revenue|cost|market|share|rate|timeline|year|years|data|chart|graph|compare|comparison)\b/i.test(`${beat.narration} ${beat.visualIntent}`) || /\d/.test(beat.narration);
}

function sourceAttribution(sourceRefs: Scene['sourceRefs']): string {
  const ref=sourceRefs?.[0];
  if(!ref) return 'Source: research dossier';
  let domain='';
  try { domain=ref.url?new URL(ref.url).hostname.replace(/^www\./,''):''; } catch { domain=''; }
  return `Source: ${ref.title || domain || ref.sourceType || ref.sourceId}${domain && ref.title ? ` · ${domain}` : ''}`;
}

function chooseGenerativeFirst(beat:ScriptBeat,index:number,visualValue:number,bias:number,visualMode:ContentExecutionPlan['visualMode']):Pick<Scene,'kind'|'generated'|'costTier'|'selectionReason'>{
  const anchor=['hook','escalation','reveal','payoff'].includes(beat.purpose);
  const videoThreshold=visualMode==='GENERATIVE_FIRST'?58:72;
  const videoBias=visualMode==='GENERATIVE_FIRST'?0.72:0.84;
  if(index===0&&anchor&&visualValue>=videoThreshold&&bias>=videoBias){
    return{kind:'ai_video',generated:true,costTier:'premium',selectionReason:`${visualMode} anchor beat justifies motion; generative spend bias ${bias.toFixed(2)}.`};
  }
  const imageThreshold=clamp(64-bias*20,42,64);
  if(visualValue>=imageThreshold){
    return{kind:'ai_image',generated:true,costTier:'low',selectionReason:`${visualMode} supporting beat requires a specific visual while reserving premium video for anchor moments.`};
  }
  return{kind:'motion_graphic',generated:false,costTier:'free',selectionReason:'Low-value supporting beat stays procedural to control marginal cost.'};
}

function chooseSceneKind(beat: ScriptBeat, index: number, visualValue: number, hasSourceRefs: boolean, options:ScenePlanningOptions): Pick<Scene,'kind'|'generated'|'costTier'|'selectionReason'> {
  const visualMode=options.visualMode??'EVIDENCE_FIRST';
  const bias=clamp01(Number(options.generativeSpendBias??0.65));
  // Shorts need a visual refresh before the viewer has time to swipe. Once a beat
  // is split into multiple shots, the supporting shots are still part of the same
  // narrative promise and should not collapse into identical placeholder cards.
  // Keep long-form conservative, but let vertical anchor beats earn a second/third
  // specific visual when their visual value is still high.
  const shortSupportingVisual=Number(options.targetSceneDurationSec??10)<=8
    && index>0
    && index<=2
    && ['hook','escalation','reveal','payoff'].includes(beat.purpose);
  if(visualMode==='GENERATIVE_FIRST'||visualMode==='CHARACTER_CONTINUITY')return chooseGenerativeFirst(beat,index,visualValue,bias,visualMode);
  // A vertical explainer needs real motion at the narrative anchors. Procedural
  // cards remain useful for evidence, but the hook/escalation/payoff should
  // change state on screen instead of becoming a slideshow with a pan effect.
  const nativeShortVideoAnchor=Number(options.targetSceneDurationSec??10)<=8
    && index===0
    && ['hook','escalation','reveal','payoff'].includes(beat.purpose)
    && bias>=0.45;
  if(nativeShortVideoAnchor){
    return {kind:'ai_video',generated:true,costTier:'premium',selectionReason:`Native Short anchor requires an observable action/state change for ${beat.purpose}; video spend bias ${bias.toFixed(2)}.`};
  }
  if (hasQuantitativeIntent(beat) && (beat.purpose === 'evidence' || beat.purpose === 'setup')) {
    return { kind:'chart', generated:false, costTier:'free', selectionReason:'Quantitative/evidence beat is clearer and cheaper as a procedural chart.' };
  }
  if (hasSourceRefs && (beat.purpose === 'evidence' || beat.purpose === 'setup') && index === 0) {
    return { kind:'source_card', generated:false, costTier:'free', selectionReason:'Evidence beat has traceable research sources; render an attributed transformed source card instead of generic AI media.' };
  }
  if (index > 0 && !shortSupportingVisual || beat.purpose === 'cta' || beat.purpose === 'setup') {
    return { kind:'motion_graphic', generated:false, costTier:'free', selectionReason:'Supporting beat does not justify generative-media spend; use deterministic motion graphics.' };
  }
  const videoThreshold=clamp(92-bias*10,80,92);
  const imageThreshold=clamp(72-bias*12,58,72);
  if (visualValue >= videoThreshold) {
    return { kind:'ai_video', generated:true, costTier:'premium', selectionReason:`High-value hook/reveal/payoff moment clears the ${visualMode} premium threshold at generative bias ${bias.toFixed(2)}.` };
  }
  if (visualValue >= imageThreshold) {
    return { kind:'ai_image', generated:true, costTier:'low', selectionReason:'Narratively important moment benefits from a specific image without premium video cost.' };
  }
  return { kind:'motion_graphic', generated:false, costTier:'free', selectionReason:'Procedural visual provides sufficient clarity at near-zero marginal media cost.' };
}

function diversifyLongRuns(input:Scene[]):Scene[]{
  const out:Scene[]=[];
  let previous:Scene['kind']|null=null;
  let run=0;
  for(const original of input){
    let scene={...original};
    if(scene.kind===previous)run+=1;else{previous=scene.kind;run=1;}
    if(run>3&&['motion_graphic','source_card','chart','text'].includes(scene.kind)){
      const before=scene.kind;
      const usableSource=scene.sourceRefs?.some((ref)=>ref.policy!=='BLOCKED');
      if(before==='motion_graphic')scene.kind=usableSource?'source_card':'text';
      else if(before==='source_card')scene.kind='motion_graphic';
      else if(before==='chart')scene.kind='motion_graphic';
      else scene.kind='motion_graphic';
      scene.generated=false;
      scene.costTier='free';
      scene.selectionReason=`Procedural variation inserted after ${run} consecutive ${before} scenes to preserve visual rhythm without extra generative spend.`;
      scene.instruction=scene.kind==='source_card'
        ? `${scene.instruction} Attributed transformed evidence card; ${sourceAttribution(scene.sourceRefs)}.`
        : scene.kind==='text'
          ? `${scene.instruction} Minimal high-contrast editorial text/shape beat used as a deliberate pattern interrupt.`
          : `${scene.instruction} Purposeful motion-graphic pattern interrupt with a visibly different hierarchy/layout from the preceding scene.`;
      previous=scene.kind;
      run=1;
    }
    out.push(scene);
  }
  return out;
}

export function planScenes(script: VideoScript, options: ScenePlanningOptions = {}): Scene[] {
  const targetSceneDurationSec = Math.max(2.5, Math.min(16, options.targetSceneDurationSec ?? 10));
  const scenes: Scene[] = [];
  for (const beat of script.beats) {
    const sceneCount = Math.max(1, Math.ceil(beat.targetDurationSec / targetSceneDurationSec));
    const duration = beat.targetDurationSec / sceneCount;
    const sourceRefs = buildVisualSourceRefs(beat.sourceIds, options.sources ?? []);
    for (let index = 0; index < sceneCount; index += 1) {
      const visualValue = scoreVisualValue(beat,index);
      const choice = chooseSceneKind(beat,index,visualValue,sourceRefs.length>0,options);
      const procedural = choice.kind === 'chart' || choice.kind === 'motion_graphic' || choice.kind === 'source_card';
      const realismInstruction=options.realityMode==='REALISTIC_SYNTHETIC'
        ? `Naturalistic ${options.cameraProfile??'consumer-camera'} capture with physically coherent anatomy, contact, motion, focus and lighting; no fake source UI or watermarks.`
        : options.visualMode==='CHARACTER_CONTINUITY'
          ? 'Preserve canonical character identity, wardrobe/style invariants, props and spatial continuity exactly.'
          : 'Visually specific editorial composition with coherent motion and no fabricated readable interface text.';
      scenes.push({
        id: `${beat.id}-s${index + 1}`,
        startSec: Math.round((beat.startSec + index * duration) * 10) / 10,
        durationSec: Math.round(duration * 10) / 10,
        ...choice,
        visualValue,
        instruction: procedural
          ? `${beat.onScreenText ?? beat.visualIntent}. ${choice.kind === 'chart' ? 'Evidence-led editorial chart/card with restrained labels and clear hierarchy.' : choice.kind === 'source_card' ? `Attributed evidence card. Transform and summarize the source; do not reproduce a webpage verbatim. ${sourceAttribution(sourceRefs)}` : 'Purposeful motion-graphic card with strong hierarchy, simple geometry and no decorative clutter.'}`
          : `${beat.visualIntent}. ${realismInstruction}`,
        sourceIds: beat.sourceIds,
        sourceRefs: sourceRefs.length ? sourceRefs : undefined,
      });
    }
  }
  return diversifyLongRuns(scenes);
}
