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
    preferredFormats:arr(value.preferredFormats).filter((item)=>['LONG_HORIZONTAL','SHORT_VERTICAL'].includes(item)),
    allowIntegratedNarrator:value.allowIntegratedNarrator===true,
    requiresCanonicalCast:value.requiresCanonicalCast===true,
    researchRequired:value.researchRequired!==false,
    factClaimMode:text(value.factClaimMode)||(value.researchRequired===false?'CREATIVE_ORIGINAL':'VERIFY_CLAIMS'),
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
  const dialogueSerialization=['MULTI_CHARACTER_DIALOGUE','HYBRID_DIALOGUE_NARRATION'].includes(profile.voiceMode)
    ?'When writing spoken dialogue inside narration fields, serialize every speaker turn on its own line as [Exact Character Name] dialogue. Use [Narrator] only when the archetype explicitly allows integrated narration. Never combine two speakers inside one tagged line; these tags are production controls and will be removed before audio/subtitles.'
    :'';
  const noNarrator=profile.voiceMode==='NONE'
    ?'Do not invent a voice-over just because the generic schema has a narration field. Treat the content as visual-first and keep any verbal context minimal; downstream production treats that field as non-spoken beat context. Natural sound/on-screen context should carry what is necessary.'
    :'';
  return[
    `CONTENT ARCHETYPE: ${profile.id} — ${profile.label}.`,
    `Voice mode: ${profile.voiceMode}. Reality mode: ${profile.realityMode}. Research required: ${profile.researchRequired}. Fact mode: ${profile.factClaimMode}.`,
    profile.hookPatterns.length?`Preferred hook grammar: ${profile.hookPatterns.join('; ')}.`:'',
    dialogueSerialization,noNarrator,
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
    contentArchetypeProfile:profile,
    getNonAssetCostUsd:model.getNonAssetCostUsd?.bind(model),
    async generateJson(input){
      if(!schemaApplies(input.schemaName))return model.generateJson(input);
      const system=[input.system,'The content archetype below is authoritative production grammar, not optional flavor. Adapt structure, narration/dialogue, pacing and packaging to it while preserving factual/source constraints when research is required.',guidance].filter(Boolean).join('\n\n');
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
