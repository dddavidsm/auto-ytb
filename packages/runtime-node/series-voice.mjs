import { createHash } from 'node:crypto';

const text=(value)=>String(value??'').trim();
const obj=(value)=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
const roleScore=(role)=>/narrator|host|lead|protagonist|main|hero/i.test(text(role))?3:text(role)?1:0;
const numberOrNull=(value)=>Number.isFinite(Number(value))?Number(value):null;

export function normalizeSeriesVoiceCast(value){
  return (Array.isArray(value)?value:[]).map((item,index)=>{
    if(!item||typeof item!=='object')return null;
    const profile=obj(item.voiceProfile??item.profile);
    const voiceId=text(profile.voiceId??profile.voice_id??profile.id??item.voiceId);
    const settings=obj(profile.settings??profile.voiceSettings);
    return{
      key:text(item.key)||`character-${index+1}`,
      name:text(item.name),
      role:text(item.role),
      continuityKey:text(item.continuityKey),
      provider:text(profile.provider||'elevenlabs').toLowerCase(),
      voiceId:voiceId||null,
      model:text(profile.model??profile.modelId)||null,
      settings:{
        stability:numberOrNull(settings.stability??profile.stability),
        similarityBoost:numberOrNull(settings.similarityBoost??settings.similarity_boost??profile.similarityBoost??profile.similarity_boost),
        style:numberOrNull(settings.style??profile.style),
        speed:numberOrNull(settings.speed??profile.speed),
        useSpeakerBoost:typeof (settings.useSpeakerBoost??settings.use_speaker_boost??profile.useSpeakerBoost??profile.use_speaker_boost)==='boolean'?(settings.useSpeakerBoost??settings.use_speaker_boost??profile.useSpeakerBoost??profile.use_speaker_boost):null,
      },
      description:text(profile.description??profile.direction??profile.voiceDescription),
    };
  }).filter(Boolean);
}

export function selectPrimarySeriesVoice(contextValue){
  const context=contextValue&&typeof contextValue==='object'?contextValue:{};
  const cast=normalizeSeriesVoiceCast(context.voiceCast);
  if(!cast.length)return null;
  const requested=text(context.primaryVoiceKey);
  if(requested){const exact=cast.find((item)=>item.key===requested||item.name===requested);if(exact)return exact;}
  return [...cast].sort((a,b)=>roleScore(b.role)-roleScore(a.role))[0]??null;
}

function stableSeed(seriesKey,voice){
  const digest=createHash('sha256').update(`${text(seriesKey)}:${voice.continuityKey||voice.key}:${voice.voiceId||'fallback'}`).digest();
  return digest.readUInt32BE(0);
}

export function bindVoiceProviderToSeries(provider,contextValue){
  const context=contextValue&&typeof contextValue==='object'?contextValue:{};
  const primary=selectPrimarySeriesVoice(context);
  if(!context.required||!primary)return provider;
  return{
    name:provider.name,
    seriesVoiceContext:{seriesKey:text(context.seriesKey),primary},
    async synthesize(input){
      const resolvedVoiceId=primary.voiceId||input.voice;
      if(!resolvedVoiceId)throw new Error(`Series ${text(context.seriesKey)||'unknown'} has no resolvable voice for ${primary.name||primary.key}`);
      const seed=stableSeed(context.seriesKey,primary);
      const result=await provider.synthesize({...input,voice:resolvedVoiceId,voiceSettings:primary.settings,seed,seriesVoice:{characterKey:primary.key,characterName:primary.name,continuityKey:primary.continuityKey}});
      const proof={required:true,seriesKey:text(context.seriesKey),characterKey:primary.key,characterName:primary.name,continuityKey:primary.continuityKey,resolvedVoiceId,canonicalVoiceId:primary.voiceId,usedFallbackVoice:!primary.voiceId,provider:primary.provider,seed};
      return{...result,voiceId:resolvedVoiceId,metadata:{...(result.metadata??{}),voiceContinuity:proof}};
    },
  };
}

export function auditSeriesVoiceContinuity(voiceAsset,contextValue){
  const context=contextValue&&typeof contextValue==='object'?contextValue:{};
  const cast=normalizeSeriesVoiceCast(context.voiceCast),primary=selectPrimarySeriesVoice(context);
  if(!context.required||!primary)return{required:false,passed:true,score:100,issues:[]};
  const proof=voiceAsset?.metadata?.voiceContinuity;
  const issues=[];
  if(!proof)issues.push('missing-voice-continuity-proof');
  else if(proof.multiSpeaker===true){
    const speakerProofs=Array.isArray(proof.speakerProofs)?proof.speakerProofs:[];
    if(!speakerProofs.length)issues.push('missing-multi-speaker-proof');
    for(const item of speakerProofs){
      const key=text(item.characterKey),name=text(item.characterName),canonical=cast.find((voice)=>voice.key===key||(name&&voice.name===name));
      if(item.unknownSpeaker===true)issues.push(`unknown-dialogue-speaker:${text(item.speakerLabel)||name||key||'unknown'}`);
      if(!canonical){issues.push(`noncanonical-dialogue-speaker:${name||key||'unknown'}`);continue;}
      if(canonical.continuityKey&&text(item.continuityKey)!==canonical.continuityKey)issues.push(`voice-continuity-key-mismatch:${canonical.key}`);
      if(canonical.voiceId&&text(item.resolvedVoiceId)!==canonical.voiceId)issues.push(`canonical-voice-id-mismatch:${canonical.key}`);
    }
  }else{
    if(primary.continuityKey&&text(proof.continuityKey)!==primary.continuityKey)issues.push('voice-continuity-key-mismatch');
    if(primary.voiceId&&text(proof.resolvedVoiceId)!==primary.voiceId)issues.push('canonical-voice-id-mismatch');
    if(primary.name&&text(proof.characterName)!==primary.name)issues.push('voice-character-mismatch');
  }
  const score=Math.max(0,100-issues.length*30);
  return{required:true,passed:issues.length===0,score,issues,characterKey:primary.key,characterName:primary.name,canonicalVoiceId:primary.voiceId??null,resolvedVoiceId:text(voiceAsset?.voiceId)||null,multiSpeaker:proof?.multiSpeaker===true,speakerCount:Array.isArray(proof?.speakerProofs)?new Set(proof.speakerProofs.map((item)=>item.characterKey)).size:1};
}
