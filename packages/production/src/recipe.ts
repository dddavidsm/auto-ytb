import type { CaptionPlan, ContentExecutionPlan, EditPlan, ProductionContentFormat } from './types.js';

const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));

export function buildCaptionPlan(execution:ContentExecutionPlan,contentFormat:ProductionContentFormat):CaptionPlan{
  const short=contentFormat==='SHORT_VERTICAL';
  const id=execution.archetypeId;
  if(execution.captionMode==='CONTEXT_ONLY'){
    return{version:1,mode:'CONTEXT_ONLY',enabled:true,burnIn:true,preset:'SOCIAL_CONTEXT',source:'ON_SCREEN_CONTEXT',maxChars:short?40:54,maxDurationSeconds:short?2.8:4.2,maxLines:2,position:short?'LOWER_MIDDLE':'BOTTOM',safeBottomPercent:short?20:8,fontScale:short?1.08:0.92,speakerAware:false,highlightKeywords:false,uppercase:false};
  }
  if(execution.captionMode==='SPEAKER_AWARE'){
    return{version:1,mode:'SPEAKER_AWARE',enabled:true,burnIn:true,preset:'DIALOGUE_SPEAKER',source:'SCRIPT_DIALOGUE',maxChars:short?34:46,maxDurationSeconds:short?2.3:3.5,maxLines:2,position:'BOTTOM',safeBottomPercent:short?18:8,fontScale:short?1.04:0.9,speakerAware:true,highlightKeywords:false,uppercase:false};
  }
  const bold=short&&['TOP_LIST','ANIMAL_TOPS','ORIGINAL_COMEDY'].includes(id);
  return{version:1,mode:'FULL_SPEECH',enabled:true,burnIn:true,preset:bold?'BOLD_SHORTS':'EDITORIAL_CLEAN',source:'VOICE_ALIGNMENT',maxChars:short?32:48,maxDurationSeconds:short?2.3:4,maxLines:2,position:short?'LOWER_MIDDLE':'BOTTOM',safeBottomPercent:short?20:7,fontScale:short?1.06:0.86,speakerAware:false,highlightKeywords:bold,uppercase:false};
}

export function buildEditPlan(execution:ContentExecutionPlan,contentFormat:ProductionContentFormat):EditPlan{
  const short=contentFormat==='SHORT_VERTICAL';
  const id=execution.archetypeId;
  let preset:EditPlan['preset']='DOCUMENTARY';
  if(id==='ANIMAL_REALISM')preset='MOBILE_NATURAL';
  else if(id==='KIDS_DIALOGUE_SERIES')preset='KIDS_STORY';
  else if(id==='ORIGINAL_COMEDY')preset='COMEDY_TIMING';
  else if(['TOP_LIST','ANIMAL_TOPS'].includes(id))preset='SOCIAL_FAST';
  else if(['VERIFIED_REAL_STORY','MYTH_MYSTERY','GENERAL_STORY'].includes(id))preset='CINEMATIC_STORY';
  const natural=preset==='MOBILE_NATURAL';
  const kids=preset==='KIDS_STORY';
  const comedy=preset==='COMEDY_TIMING';
  const social=preset==='SOCIAL_FAST';
  const cinematic=preset==='CINEMATIC_STORY';
  const transitionMode:EditPlan['transitionMode']=natural||comedy?'HARD_CUT':kids?'SOFT_FADE':social?'HARD_CUT':'MOTIVATED';
  return{
    version:1,preset,transitionMode,
    transitionDurationSeconds:transitionMode==='HARD_CUT'?0:kids?0.18:0.12,
    filmLook:!natural&&!kids&&(cinematic||execution.cameraProfile==='POLISHED_DOCUMENTARY'),
    filmGrain:natural?0:cinematic?3:1.4,
    punchInAnchors:!natural&&!kids,
    punchInScale:social||comedy?1.045:1.025,
    mobileImperfections:natural||execution.cameraProfile==='CONSUMER_MOBILE',
    reactionTiming:kids||comedy||natural,
    maxCutsPerMinute:short?(natural?24:kids?20:comedy?32:36):(kids?12:comedy?18:14),
    minSceneSeconds:short?(natural?1.8:kids?2.3:1.4):(kids?4.2:3.2),
    preserveAudioTiming:true,
  };
}

export function buildCreativeRecipe(execution:ContentExecutionPlan,contentFormat:ProductionContentFormat){
  const captionPlan=buildCaptionPlan(execution,contentFormat);
  const editPlan=buildEditPlan(execution,contentFormat);
  return{captionPlan,editPlan,score:Math.round(clamp(92+(captionPlan.burnIn?3:0)+(editPlan.preserveAudioTiming?3:0),0,100))};
}
