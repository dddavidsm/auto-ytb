import { getContentArchetypeProfile, inferContentArchetype } from '@auto-ytb/os';
import { buildArchetypeExecutionPlan } from '@auto-ytb/orchestrator';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,Number(value)));

function seriesAutomationArchetype(seriesContext){
  const id=String(seriesContext?.automationProfile?.content?.archetype??'').trim();
  if(!id)return undefined;
  try{return getContentArchetypeProfile(id);}catch(error){throw new Error(`Series Automation Profile contains unsupported Content Archetype ${id}: ${error instanceof Error?error.message:String(error)}`);}
}

export function decideScheduledArchetype({topic,contentFormat,channelNiche,seriesContext,explicitProfile}){
  const effectiveProfile=explicitProfile??seriesAutomationArchetype(seriesContext);
  const decision=effectiveProfile
    ?{archetype:String(effectiveProfile.id??'GENERAL_STORY'),confidence:100,reasons:[explicitProfile?'Explicit scheduled Content Archetype profile':'Series Automation Profile Content Archetype'],profile:effectiveProfile}
    :inferContentArchetype({topic:String(topic??''),contentFormat:String(contentFormat??''),channelNiche:String(channelNiche??''),seriesContext:seriesContext??undefined});
  const executionPlan=buildArchetypeExecutionPlan(decision,contentFormat==='SHORT_VERTICAL'?'SHORT_VERTICAL':'LONG_HORIZONTAL');
  return{decision,executionPlan};
}

export function reserveCostForArchetype({decision,executionPlan,contentFormat,channelMaxCostUsd,defaultLongReserveUsd=18,defaultShortReserveUsd=6}){
  const profile=decision?.profile??{};
  const isShort=contentFormat==='SHORT_VERTICAL';
  const base=Math.max(0,isShort?Number(defaultShortReserveUsd):Number(defaultLongReserveUsd));
  const maxCost=Math.max(0,Number(channelMaxCostUsd??base));
  const spendBias=clamp(profile.generativeSpendBias??executionPlan?.generativeSpendBias??0.65,0,1);
  // Provider envelope: factual search and TTS add predictable spend; generative-first media adds the largest variance.
  const researchFactor=executionPlan?.researchRequired?0.10:-0.08;
  const voiceFactor=executionPlan?.voiceRequired?0.08:-0.08;
  const mediaFactor=executionPlan?.visualMode==='GENERATIVE_FIRST'?0.16+spendBias*0.18
    :executionPlan?.visualMode==='CHARACTER_CONTINUITY'?0.18+spendBias*0.14
      :executionPlan?.visualMode==='EVIDENCE_FIRST'?-0.12+spendBias*0.08
        :-0.02+spendBias*0.10;
  const factor=clamp(0.78+researchFactor+voiceFactor+mediaFactor,0.48,1.20);
  const floor=isShort?1.5:4;
  return Math.round(Math.min(maxCost,Math.max(floor,base*factor))*100)/100;
}

export function scheduledArchetypeSummary(decision,executionPlan){
  return{
    id:String(decision?.archetype??executionPlan?.archetypeId??'GENERAL_STORY'),
    confidence:Number(decision?.confidence??0),
    researchMode:executionPlan?.researchMode,
    scriptMode:executionPlan?.scriptMode,
    voiceMode:executionPlan?.voiceMode,
    visualMode:executionPlan?.visualMode,
    audioMode:executionPlan?.audioMode,
    captionMode:executionPlan?.captionMode,
    generativeSpendBias:Number(executionPlan?.generativeSpendBias??0),
  };
}
