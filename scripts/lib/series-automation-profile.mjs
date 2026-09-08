import { getContentArchetypeProfile } from '@auto-ytb/os';

const FORMATS=new Set(['LONG_HORIZONTAL','SHORT_VERTICAL']);
const PLATFORMS=new Set(['youtube','tiktok','instagram','facebook']);
const text=(value,fallback='')=>String(value??fallback).trim();
const obj=(value)=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
const arr=(value)=>Array.isArray(value)?value:[];
const num=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
const bool=(value,fallback)=>typeof value==='boolean'?value:fallback;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,num(value,min)));
const uniq=(items)=>[...new Set(items.map(String).map((item)=>item.trim()).filter(Boolean))];

function configuredPlatforms(channelConfig){
  const distribution=obj(obj(channelConfig).publishing?.distribution);
  const configured=distribution.platforms;
  if(Array.isArray(configured))return uniq(configured.map((item)=>String(item).toLowerCase())).filter((item)=>PLATFORMS.has(item));
  if(configured&&typeof configured==='object'){
    const enabled=Object.entries(configured).filter(([platform,value])=>PLATFORMS.has(platform)&&obj(value).enabled===true).map(([platform])=>platform);
    if(enabled.length)return enabled;
  }
  return ['youtube'];
}

function inferArchetype(series,bible){
  const identity=obj(series.identity),themes=uniq([...(arr(identity.themes)),...(arr(bible.themes))]).join(' ').toLowerCase();
  const cast=arr(bible.characters);
  if(series.audience_mode==='MADE_FOR_KIDS'&&cast.length)return 'KIDS_DIALOGUE_SERIES';
  if(cast.length)return 'CHARACTER_HOST';
  if(/\b(dog|cat|animal|pet|puppy|kitten|perro|gato|mascota)\b/.test(themes))return 'ANIMAL_REALISM';
  if(/\b(myth|legend|mystery|folklore|mito|leyenda|misterio)\b/.test(themes))return 'MYTH_MYSTERY';
  return 'GENERAL_STORY';
}

function normalizeFormats(existing,series,archetype){
  const fromExisting=uniq(arr(existing).map((item)=>String(item).toUpperCase())).filter((item)=>FORMATS.has(item));
  if(fromExisting.length)return fromExisting;
  const strategy=obj(series.format_strategy),fromSeries=uniq(arr(strategy.formats).map((item)=>String(item).toUpperCase())).filter((item)=>FORMATS.has(item));
  if(fromSeries.length)return fromSeries;
  return [...archetype.preferredFormats];
}

export function buildSeriesAutomationProfile({series,bible,characters=[],channelConfig={},existing={}}){
  series=obj(series);bible=obj(bible);existing=obj(existing);channelConfig=obj(channelConfig);
  const publishing=obj(channelConfig.publishing),existingContent=obj(existing.content),existingVoice=obj(existing.voice),existingEdit=obj(existing.edit),existingDistribution=obj(existing.distribution),existingCadence=obj(existingDistribution.cadence),existingEconomics=obj(existing.economics),existingQuality=obj(existing.quality);
  const archetypeId=text(existingContent.archetype)||inferArchetype(series,bible);
  const archetype=getContentArchetypeProfile(archetypeId);
  const formats=normalizeFormats(existingContent.formats,series,archetype);
  const primaryCandidate=text(existingContent.primaryFormat).toUpperCase();
  const primaryFormat=formats.includes(primaryCandidate)?primaryCandidate:(formats.includes('SHORT_VERTICAL')&&series.audience_mode==='MADE_FOR_KIDS'?'SHORT_VERTICAL':formats[0]);
  const isKids=series.audience_mode==='MADE_FOR_KIDS';
  const longDurationCandidate=Number(obj(existingContent.targetDurationSec).LONG_HORIZONTAL),shortDurationCandidate=Number(obj(existingContent.targetDurationSec).SHORT_VERTICAL);
  const targetDuration={
    LONG_HORIZONTAL:Math.round(Number.isFinite(longDurationCandidate)?clamp(longDurationCandidate,180,1800):clamp(channelConfig.targetDurationSec??(isKids?360:600),180,1800)),
    SHORT_VERTICAL:Math.round(Number.isFinite(shortDurationCandidate)?clamp(shortDurationCandidate,8,180):clamp(channelConfig.shortTargetDurationSec??45,8,180)),
  };
  const longSceneCandidate=Number(obj(existingContent.targetSceneDurationSec).LONG_HORIZONTAL),shortSceneCandidate=Number(obj(existingContent.targetSceneDurationSec).SHORT_VERTICAL);
  const targetSceneDuration={
    LONG_HORIZONTAL:Number.isFinite(longSceneCandidate)?clamp(longSceneCandidate,2,30):clamp(archetype.targetSceneDurationSec.long,2,30),
    SHORT_VERTICAL:Number.isFinite(shortSceneCandidate)?clamp(shortSceneCandidate,1,12):clamp(archetype.targetSceneDurationSec.short,1,12),
  };
  const cast=arr(characters),lead=[...cast].sort((a,b)=>/lead|host|narrator|main|hero|protagonist/i.test(text(b.role))?1:-1)[0]??null;
  const channelVoice=obj(channelConfig.voiceProfile),voiceProfile=obj(lead?.voice_profile??lead?.voiceProfile),voiceId=text(existingVoice.voiceId)||text(voiceProfile.voiceId)||text(channelVoice.voiceId)||null;
  const platforms=uniq(arr(existingDistribution.platforms).length?arr(existingDistribution.platforms):configuredPlatforms(channelConfig)).map((item)=>String(item).toLowerCase()).filter((item)=>PLATFORMS.has(item));
  if(!platforms.includes('youtube'))platforms.unshift('youtube');
  const reviewMode=['FULL_AUTONOMOUS','REVIEW_REQUIRED'].includes(text(existingDistribution.reviewMode).toUpperCase())?text(existingDistribution.reviewMode).toUpperCase():(publishing.autonomyMode==='FULL_AUTONOMOUS'?'FULL_AUTONOMOUS':'REVIEW_REQUIRED');
  const autoPost=bool(existingDistribution.autoPost,reviewMode==='FULL_AUTONOMOUS'&&publishing.allowAutomaticPublicScheduling===true);
  const maxEpisodesCandidate=Number(existingCadence.maxEpisodesPerWeek);
  const maxEpisodesPerWeek=Number.isFinite(maxEpisodesCandidate)?Math.round(clamp(maxEpisodesCandidate,1,21)):(isKids?3:2);
  const minHoursCandidate=Number(existingCadence.minHoursBetweenEpisodes);
  const minHoursBetweenEpisodes=Number.isFinite(minHoursCandidate)?clamp(minHoursCandidate,4,168):Math.max(8,Math.round(168/maxEpisodesPerWeek));
  const brief=text(existing.brief)||text(bible.premise)||text(series.positioning)||text(series.title);
  const captionMode=text(existingEdit.captionMode)||(archetype.voiceMode==='NONE'?'CONTEXT_ONLY':archetype.voiceMode.includes('DIALOGUE')?'SPEAKER_AWARE':'FULL_SPEECH');
  const editPreset=text(existingEdit.preset)||(archetype.id==='ANIMAL_REALISM'?'MOBILE_NATURAL':archetype.id==='KIDS_DIALOGUE_SERIES'?'KIDS_STORY':archetype.id==='ORIGINAL_COMEDY'?'COMEDY_TIMING':['TOP_LIST','ANIMAL_TOPS'].includes(archetype.id)?'SOCIAL_FAST':['VERIFIED_REAL_STORY','MYTH_MYSTERY','GENERAL_STORY'].includes(archetype.id)?'CINEMATIC_STORY':'DOCUMENTARY');
  const audioMode=text(existingEdit.audioMode)||(archetype.voiceMode==='NONE'?'NATURAL_SOUND':archetype.voiceMode==='MULTI_CHARACTER_DIALOGUE'?'DIALOGUE_LED':archetype.voiceMode==='HYBRID_DIALOGUE_NARRATION'?'HYBRID':'NARRATION_LED');
  return {
    version:1,brief,
    content:{archetype:archetype.id,formats,primaryFormat,targetDurationSec:targetDuration,targetSceneDurationSec:targetSceneDuration,adaptiveLearning:bool(existingContent.adaptiveLearning,true),generativeSpendBias:clamp(existingContent.generativeSpendBias??archetype.generativeSpendBias,0,1)},
    voice:{mode:text(existingVoice.mode)||archetype.voiceMode,primaryVoiceKey:text(existingVoice.primaryVoiceKey)||text(lead?.character_key??lead?.key)||null,provider:text(existingVoice.provider)||text(channelVoice.provider)||'elevenlabs',voiceId,model:text(existingVoice.model)||text(channelVoice.model)||null,language:text(existingVoice.language)||text(series.language)||text(channelConfig.language)||'en',allowIntegratedNarrator:bool(existingVoice.allowIntegratedNarrator,archetype.allowIntegratedNarrator)},
    edit:{preset:editPreset,captionMode,captionsBurnIn:bool(existingEdit.captionsBurnIn,true),audioMode,cameraProfile:text(existingEdit.cameraProfile)||archetype.cameraProfile,syntheticDisclosurePolicy:text(existingEdit.syntheticDisclosurePolicy)||archetype.syntheticDisclosurePolicy},
    distribution:{autoPost,reviewMode,platforms,cadence:{mode:text(existingCadence.mode)||'EVIDENCE_ADAPTIVE',maxEpisodesPerWeek,minHoursBetweenEpisodes}},
    economics:{maxCostUsd:clamp(existingEconomics.maxCostUsd??channelConfig.maxProductionCostUsd??18,1,250),optimizeFor:text(existingEconomics.optimizeFor)||text(channelConfig.economics?.optimizeFor)||'PROFIT_AND_WATCH_TIME_PER_DOLLAR'},
    quality:{minimumQaScore:clamp(existingQuality.minimumQaScore??publishing.minimumQaScoreForAutoPublish??channelConfig.quality?.minimumQaScore??88,0,100),minimumAttentionScore:clamp(existingQuality.minimumAttentionScore??publishing.minimumAttentionScoreForAutoPublish??86,0,100),minimumFinalMediaScore:clamp(existingQuality.minimumFinalMediaScore??publishing.minimumFinalMediaScoreForAutoPublish??90,0,100)},
  };
}

export function validateSeriesAutomationProfile(profile){
  const issues=[],p=obj(profile),content=obj(p.content),voice=obj(p.voice),edit=obj(p.edit),distribution=obj(p.distribution),cadence=obj(distribution.cadence),economics=obj(p.economics),quality=obj(p.quality);
  if(!text(p.brief))issues.push('brief-required');
  let archetype=null;try{archetype=getContentArchetypeProfile(text(content.archetype));}catch{issues.push('content-archetype-invalid');}
  const formats=arr(content.formats);if(!formats.length||formats.some((item)=>!FORMATS.has(String(item))))issues.push('formats-invalid');
  if(!formats.includes(content.primaryFormat))issues.push('primary-format-not-enabled');
  if(!['NONE','SINGLE_NARRATOR','MULTI_CHARACTER_DIALOGUE','HYBRID_DIALOGUE_NARRATION'].includes(text(voice.mode)))issues.push('voice-mode-invalid');
  if(archetype&&text(voice.mode)!==archetype.voiceMode)issues.push('voice-mode-archetype-drift');
  if(!['CONTEXT_ONLY','SPEAKER_AWARE','FULL_SPEECH'].includes(text(edit.captionMode)))issues.push('caption-mode-invalid');
  if(!['NATURAL_SOUND','DIALOGUE_LED','HYBRID','NARRATION_LED'].includes(text(edit.audioMode)))issues.push('audio-mode-invalid');
  if(!['FULL_AUTONOMOUS','REVIEW_REQUIRED'].includes(text(distribution.reviewMode)))issues.push('review-mode-invalid');
  const platforms=arr(distribution.platforms);if(!platforms.length||platforms.some((item)=>!PLATFORMS.has(String(item))))issues.push('distribution-platforms-invalid');
  if(num(cadence.maxEpisodesPerWeek,0)<1||num(cadence.minHoursBetweenEpisodes,0)<1)issues.push('cadence-invalid');
  if(num(economics.maxCostUsd,0)<=0)issues.push('economics-max-cost-invalid');
  if([quality.minimumQaScore,quality.minimumAttentionScore,quality.minimumFinalMediaScore].some((value)=>num(value,-1)<0||num(value,101)>100))issues.push('quality-threshold-invalid');
  return{valid:issues.length===0,issues};
}

export function cadenceAllows({profile,episodesLast7Days=0,hoursSinceLastEpisode=Infinity}){
  const cadence=obj(obj(profile).distribution?.cadence),max=Math.max(1,Math.floor(num(cadence.maxEpisodesPerWeek,1))),minHours=Math.max(1,num(cadence.minHoursBetweenEpisodes,24));
  if(Number(episodesLast7Days)>=max)return{allowed:false,reason:'weekly-cadence-cap',maxEpisodesPerWeek:max,minHoursBetweenEpisodes:minHours};
  if(Number(hoursSinceLastEpisode)<minHours)return{allowed:false,reason:'minimum-spacing',maxEpisodesPerWeek:max,minHoursBetweenEpisodes:minHours};
  return{allowed:true,reason:'cadence-ready',maxEpisodesPerWeek:max,minHoursBetweenEpisodes:minHours};
}
