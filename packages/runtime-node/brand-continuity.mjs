function normalizeContext(value){
  if(!value)return null;
  if(typeof value==='string'){
    try{return normalizeContext(JSON.parse(value));}catch{return null;}
  }
  if(typeof value!=='object')return null;
  const referenceUris=[...new Set((Array.isArray(value.referenceUris)?value.referenceUris:[]).map(String).filter(Boolean))];
  return {
    required:Boolean(value.required),
    channelKey:String(value.channelKey??''),
    characterMode:String(value.characterMode??'none'),
    characterName:value.characterName?String(value.characterName):null,
    continuityKey:value.continuityKey?String(value.continuityKey):null,
    referenceUris,
    styleTags:Array.isArray(value.styleTags)?value.styleTags.map(String):[],
    styleGuidance:String(value.styleGuidance??''),
  };
}

export function parseBrandContinuityContext(value){return normalizeContext(value);}

export function assertBrandContinuityReady(context){
  const normalized=normalizeContext(context);
  if(!normalized)return null;
  if(normalized.required&&!normalized.referenceUris.length){
    throw new Error(`Brand continuity requires a canonical visual reference for ${normalized.characterName||normalized.channelKey||'this channel'}`);
  }
  return normalized;
}

function continuityPrompt(context){
  const parts=[];
  if(context.characterName)parts.push(`Persistent character: ${context.characterName}. Preserve the exact same face, proportions, silhouette, wardrobe, signature accessories and recognizable identity as the canonical reference.`);
  if(context.continuityKey)parts.push(`Continuity identity key: ${context.continuityKey}. Do not redesign or reinterpret the identity.`);
  if(context.styleTags.length)parts.push(`Channel visual language: ${context.styleTags.join(', ')}.`);
  if(context.styleGuidance)parts.push(context.styleGuidance);
  if(context.required)parts.push('Identity continuity is a hard requirement. Scene composition may change, but the persistent character/brand identity may not drift.');
  return parts.join(' ');
}

export function bindMediaProviderToBrand(provider, contextValue){
  const context=assertBrandContinuityReady(contextValue);
  if(!context||(!context.required&&!context.referenceUris.length&&!context.styleGuidance&&!context.styleTags.length))return provider;
  const brandPrompt=continuityPrompt(context);
  return {
    name:provider.name,
    async generate(input){
      const references=[...new Set([...(context.referenceUris??[]),...(input.referenceUris??[])])].slice(0,3);
      const result=await provider.generate({...input,prompt:[brandPrompt,input.prompt].filter(Boolean).join(' '),referenceUris:references.length?references:undefined});
      return {...result,brandContinuity:{channelKey:context.channelKey,continuityKey:context.continuityKey,characterName:context.characterName,referenceCount:references.length}};
    },
  };
}
