const text=(value)=>String(value??'').trim();
const arr=(value)=>Array.isArray(value)?value.map(String).filter(Boolean):[];
const obj=(value)=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};

export function normalizeContentArchetypeProfile(value){
  if(!value)return null;
  if(typeof value==='string'){try{return normalizeContentArchetypeProfile(JSON.parse(value));}catch{return null;}}
  if(typeof value!=='object')return null;
  return{
    id:text(value.id)||'GENERAL_STORY',
    label:text(value.label)||text(value.id)||'General story',
    voiceMode:text(value.voiceMode)||'SINGLE_NARRATOR',
    realityMode:text(value.realityMode)||'ORIGINAL_FICTION',
    cameraProfile:text(value.cameraProfile)||'CINEMATIC_STORY',
    syntheticDisclosurePolicy:text(value.syntheticDisclosurePolicy)||'REQUIRED_WHEN_PLATFORM_POLICY_APPLIES',
    scriptGuidance:arr(value.scriptGuidance),voiceGuidance:arr(value.voiceGuidance),visualGuidance:arr(value.visualGuidance),editingGuidance:arr(value.editingGuidance),captionGuidance:arr(value.captionGuidance),packagingGuidance:arr(value.packagingGuidance),qaGuidance:arr(value.qaGuidance),hookPatterns:arr(value.hookPatterns),
    captureAesthetic:obj(value.captureAesthetic),
    targetSceneDurationSec:obj(value.targetSceneDurationSec),
    generativeSpendBias:Number.isFinite(Number(value.generativeSpendBias))?Number(value.generativeSpendBias):1,
  };
}

function schemaApplies(schemaName){
  const name=text(schemaName).toLowerCase();
  return ['script','packaging','story','angle','scene','storyboard','thumbnail'].some((part)=>name.includes(part));
}

function promptPack(profile){
  return[
    `CONTENT ARCHETYPE: ${profile.id} — ${profile.label}.`,
    profile.hookPatterns.length?`Preferred hook grammar: ${profile.hookPatterns.join('; ')}.`:'',
    ...profile.scriptGuidance,
    ...profile.voiceGuidance,
    ...profile.packagingGuidance,
    ...profile.qaGuidance,
  ].filter(Boolean).join('\n');
}

export function bindTextModelToContentArchetype(model,profileValue){
  const profile=normalizeContentArchetypeProfile(profileValue);
  if(!profile)return model;
  const guidance=promptPack(profile);
  return{
    name:model.name,
    getNonAssetCostUsd:model.getNonAssetCostUsd?.bind(model),
    async generateJson(input){
      if(!schemaApplies(input.schemaName))return model.generateJson(input);
      const system=[input.system,'The content archetype below is authoritative production grammar, not optional flavor. Adapt structure, narration/dialogue, pacing and packaging to it while preserving factual/source constraints.',guidance].filter(Boolean).join('\n\n');
      const prompt=[input.prompt,guidance].filter(Boolean).join('\n\n');
      return model.generateJson({...input,system,prompt});
    },
  };
}

function mediaGuidance(profile){
  const capture=profile.captureAesthetic??{};
  const captureText=capture.enabled
    ?`Capture aesthetic is ${capture.purpose||'editorial-naturalism'}: favor plausible consumer-camera imperfections, natural exposure/focus response and restrained compression. This is an editorial aesthetic only; never add fake source watermarks, timestamps or UI, and preserve synthetic-media provenance/disclosure.`
    :'';
  return[
    `CONTENT ARCHETYPE ${profile.id}. Camera grammar: ${profile.cameraProfile}. Reality mode: ${profile.realityMode}.`,
    ...profile.visualGuidance,
    ...profile.editingGuidance,
    captureText,
  ].filter(Boolean).join(' ');
}

function withArchetypeMetadata(asset,profile){
  return{
    ...asset,
    metadata:{...(asset.metadata??{}),contentArchetype:{id:profile.id,label:profile.label,cameraProfile:profile.cameraProfile,realityMode:profile.realityMode,syntheticDisclosurePolicy:profile.syntheticDisclosurePolicy,captureAesthetic:profile.captureAesthetic}},
  };
}

export function bindImageProviderToContentArchetype(provider,profileValue){
  const profile=normalizeContentArchetypeProfile(profileValue);
  if(!profile)return provider;
  const guidance=mediaGuidance(profile);
  return{
    name:provider.name,
    async generate(input){
      const result=await provider.generate({...input,prompt:[input.prompt,guidance].filter(Boolean).join(' ')});
      return withArchetypeMetadata(result,profile);
    },
  };
}

export function bindVideoProviderToContentArchetype(provider,profileValue){
  const profile=normalizeContentArchetypeProfile(profileValue);
  if(!profile)return provider;
  const guidance=mediaGuidance(profile);
  return{
    name:provider.name,
    async generate(input){
      const result=await provider.generate({...input,prompt:[input.prompt,guidance].filter(Boolean).join(' ')});
      return withArchetypeMetadata(result,profile);
    },
  };
}

export function archetypeVoiceMode(profileValue){return normalizeContentArchetypeProfile(profileValue)?.voiceMode??'SINGLE_NARRATOR';}
