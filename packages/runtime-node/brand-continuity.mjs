import { normalizeReferenceCatalog, selectSceneReferences } from './scene-reference-routing.mjs';

function normalizeContext(value){
  if(!value)return null;
  if(typeof value==='string'){
    try{return normalizeContext(JSON.parse(value));}catch{return null;}
  }
  if(typeof value!=='object')return null;
  const referenceUris=[...new Set((Array.isArray(value.referenceUris)?value.referenceUris:[]).map(String).filter(Boolean))];
  const referenceCatalog=normalizeReferenceCatalog(value.referenceCatalog??value.visualReferences);
  return {
    required:Boolean(value.required),
    channelKey:String(value.channelKey??''),
    characterMode:String(value.characterMode??'none'),
    characterName:value.characterName?String(value.characterName):null,
    continuityKey:value.continuityKey?String(value.continuityKey):null,
    referenceUris,
    referenceCatalog,
    styleTags:Array.isArray(value.styleTags)?value.styleTags.map(String):[],
    styleGuidance:String(value.styleGuidance??''),
  };
}

export function parseBrandContinuityContext(value){return normalizeContext(value);}
export { selectSceneReferences } from './scene-reference-routing.mjs';

export function assertBrandContinuityReady(context){
  const normalized=normalizeContext(context);
  if(!normalized)return null;
  if(normalized.required&&!normalized.referenceUris.length&&!normalized.referenceCatalog.length){
    throw new Error(`Brand continuity requires a canonical visual reference for ${normalized.characterName||normalized.channelKey||'this channel'}`);
  }
  return normalized;
}

function continuityPrompt(context,selection){
  const parts=[];
  if(context.characterName)parts.push(`Persistent character: ${context.characterName}. Preserve the exact same face, proportions, silhouette, wardrobe, signature accessories and recognizable identity as the canonical reference.`);
  if(context.continuityKey)parts.push(`Continuity identity key: ${context.continuityKey}. Do not redesign or reinterpret the identity.`);
  if(selection?.characterNames?.length)parts.push(`This scene's canonical cast references are: ${selection.characterNames.join(', ')}. Do not substitute, merge or redesign those identities.`);
  if(context.styleTags.length)parts.push(`Channel visual language: ${context.styleTags.join(', ')}.`);
  if(context.styleGuidance)parts.push(context.styleGuidance);
  if(context.required)parts.push('Identity continuity is a hard requirement. Scene composition may change, but the persistent character/brand identity may not drift.');
  return parts.join(' ');
}

export function bindMediaProviderToBrand(provider, contextValue){
  const context=assertBrandContinuityReady(contextValue);
  if(!context||(!context.required&&!context.referenceUris.length&&!context.referenceCatalog.length&&!context.styleGuidance&&!context.styleTags.length))return provider;
  return {
    name:provider.name,
    brandContinuityContext:context,
    async generate(input){
      const selection=selectSceneReferences(context,input.prompt,input.referenceUris,3);
      const brandPrompt=continuityPrompt(context,selection);
      const result=await provider.generate({...input,prompt:[brandPrompt,input.prompt].filter(Boolean).join(' '),referenceUris:selection.uris.length?selection.uris:undefined});
      const proof={required:context.required,channelKey:context.channelKey,continuityKey:context.continuityKey,characterName:context.characterName,referenceCount:selection.uris.length,referenceKeys:selection.keys,characterNames:selection.characterNames,styleKeys:selection.styleKeys};
      return {...result,metadata:{...(result.metadata??{}),brandContinuity:proof},brandContinuity:proof};
    },
  };
}

export function auditBrandContinuityAssets(assets,contextValue){
  const context=normalizeContext(contextValue);
  const generated=(assets??[]).filter((asset)=>asset?.generated!==false);
  if(!context||!context.required)return{passed:true,score:100,totalGenerated:generated.length,compliant:generated.length,issues:[]};
  const issues=[];let compliant=0;
  for(const asset of generated){
    const proof=asset?.brandContinuity??asset?.metadata?.brandContinuity;
    if(!proof){issues.push(`${asset?.id??'unknown'}: missing continuity proof`);continue;}
    if(context.continuityKey&&proof.continuityKey!==context.continuityKey){issues.push(`${asset?.id??'unknown'}: continuity key mismatch`);continue;}
    if(Number(proof.referenceCount??0)<1){issues.push(`${asset?.id??'unknown'}: canonical reference not applied`);continue;}
    if(context.characterName&&proof.characterName!==context.characterName){issues.push(`${asset?.id??'unknown'}: character identity mismatch`);continue;}
    compliant+=1;
  }
  const total=generated.length;
  const score=total?Math.round(compliant/total*100):0;
  if(!total)issues.push('No generated assets available for required continuity audit');
  return{passed:total>0&&issues.length===0&&score===100,score,totalGenerated:total,compliant,issues};
}
