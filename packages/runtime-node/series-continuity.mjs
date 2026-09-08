function normalize(value){
  if(!value)return null;
  if(typeof value==='string'){try{return normalize(JSON.parse(value));}catch{return null;}}
  if(typeof value!=='object')return null;
  return {
    required:Boolean(value.required),seriesId:String(value.seriesId??''),seriesKey:String(value.seriesKey??''),seriesTitle:String(value.seriesTitle??''),bibleVersion:Number(value.bibleVersion??0),continuityKey:String(value.continuityKey??''),
    audienceMode:String(value.audienceMode??'GENERAL'),targetAgeMin:value.targetAgeMin==null?null:Number(value.targetAgeMin),targetAgeMax:value.targetAgeMax==null?null:Number(value.targetAgeMax),
    seasonNumber:Number(value.seasonNumber??1),episodeNumber:Number(value.episodeNumber??1),episodeKey:String(value.episodeKey??''),
    referenceUris:Array.isArray(value.referenceUris)?value.referenceUris.map(String).filter(Boolean):[],canonicalMemory:Array.isArray(value.canonicalMemory)?value.canonicalMemory:[],
    scriptGuidance:String(value.scriptGuidance??''),visualGuidance:String(value.visualGuidance??''),qaGuidance:String(value.qaGuidance??''),
    characterContinuityKeys:Array.isArray(value.characterContinuityKeys)?value.characterContinuityKeys.map(String):[],styleContinuityKeys:Array.isArray(value.styleContinuityKeys)?value.styleContinuityKeys.map(String):[],
  };
}
export function parseSeriesContinuityContext(value){return normalize(value);}

function appliesToSchema(schemaName){const name=String(schemaName??'').toLowerCase();return ['script','packaging','story','angle','scene','storyboard'].some((part)=>name.includes(part));}
export function bindTextModelToSeries(model,contextValue){
  const context=normalize(contextValue);
  if(!context?.required)return model;
  if(!context.seriesId||!context.continuityKey||!context.scriptGuidance)throw new Error('Series continuity context is incomplete');
  return {
    name:model.name,
    getNonAssetCostUsd:model.getNonAssetCostUsd?.bind(model),
    async generateJson(input){
      if(!appliesToSchema(input.schemaName))return model.generateJson(input);
      const canon=[
        `SERIES CANON — ${context.seriesTitle||context.seriesKey} · bible v${context.bibleVersion} · ${context.episodeKey}.`,
        'The following continuity instructions are authoritative. Do not improvise changes to established characters, world rules, age targeting, relationships, props or unresolved canon.',
        context.scriptGuidance,
        context.qaGuidance?`Self-check before returning: ${context.qaGuidance}`:'',
      ].filter(Boolean).join('\n');
      return model.generateJson({...input,system:[input.system,canon].filter(Boolean).join('\n\n'),prompt:[input.prompt,canon].filter(Boolean).join('\n\n')});
    },
  };
}

export function auditSeriesContinuity({context:contextValue,manifest}){
  const context=normalize(contextValue);
  if(!context?.required)return{required:false,passed:true,issues:[],score:100};
  const issues=[];
  if(!context.seriesId||!context.seriesKey)issues.push('missing-series-identity');
  if(!context.continuityKey)issues.push('missing-series-continuity-key');
  if(context.bibleVersion<1)issues.push('missing-active-bible-version');
  if(!context.episodeKey)issues.push('missing-episode-key');
  if(context.audienceMode==='MADE_FOR_KIDS'&&(context.targetAgeMin==null||context.targetAgeMax==null))issues.push('kids-age-band-missing');
  const generative=Array.isArray(manifest?.assets)?manifest.assets.filter((asset)=>asset?.generated):[];
  if(context.referenceUris.length&&generative.length){
    const withoutProof=generative.filter((asset)=>!asset?.brandContinuity?.referenceCount&&!asset?.metadata?.brandContinuity?.referenceCount);
    if(withoutProof.length)issues.push(`generated-assets-without-series-reference:${withoutProof.length}`);
  }
  const score=Math.max(0,100-issues.length*22);
  return{required:true,passed:issues.length===0,issues,score,seriesId:context.seriesId,seriesKey:context.seriesKey,bibleVersion:context.bibleVersion,episodeKey:context.episodeKey,continuityKey:context.continuityKey};
}
