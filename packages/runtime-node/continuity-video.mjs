import { normalizeReferenceCatalog, selectSceneReferences } from './scene-reference-routing.mjs';

function normalizeContext(value){
  if(!value||typeof value!=='object')return null;
  const referenceUris=[...new Set((Array.isArray(value.referenceUris)?value.referenceUris:[]).map(String).filter(Boolean))].slice(0,8);
  return{
    required:Boolean(value.required),
    channelKey:String(value.channelKey??''),
    characterName:value.characterName?String(value.characterName):null,
    continuityKey:value.continuityKey?String(value.continuityKey):null,
    styleGuidance:String(value.styleGuidance??''),
    styleTags:Array.isArray(value.styleTags)?value.styleTags.map(String):[],
    referenceUris,
    referenceCatalog:normalizeReferenceCatalog(value.referenceCatalog??value.visualReferences),
  };
}
function continuityPrompt(context,selection){
  return[
    context.characterName?`Persistent character ${context.characterName}: preserve exact recognizable identity, proportions, silhouette, wardrobe and signature accessories.`:'',
    selection?.characterNames?.length?`Scene cast anchors: ${selection.characterNames.join(', ')}. Preserve each as a distinct canonical identity; never blend character designs.`:'',
    context.continuityKey?`Continuity identity key ${context.continuityKey}; do not redesign the identity.`:'',
    context.styleTags.length?`Canonical visual language: ${context.styleTags.join(', ')}.`:'',
    context.styleGuidance,
    'Use the selected canonical references to preserve identity and art direction while allowing the requested action, pose, camera and environment to change.',
  ].filter(Boolean).join(' ');
}

export function withContinuityBridgeVideo(videoProvider,imageProvider,contextValue){
  const context=normalizeContext(contextValue);
  if(!context||(context.referenceUris.length<1&&context.referenceCatalog.length<1))return videoProvider;
  return{
    name:videoProvider.name,
    continuityBridgeContext:context,
    async generate(input){
      const selection=selectSceneReferences(context,input.prompt,input.referenceUris,3);
      const refs=selection.uris;
      const prompt=continuityPrompt(context,selection);
      if(refs.length<2){
        const result=await videoProvider.generate({...input,prompt:[prompt,input.prompt].filter(Boolean).join(' '),referenceUris:refs.length?refs:undefined});
        return{
          ...result,
          metadata:{...(result.metadata??{}),continuityBridge:{used:false,canonicalReferenceCount:refs.length,referenceKeys:selection.keys,characterNames:selection.characterNames}},
          brandContinuity:{required:context.required,channelKey:context.channelKey,continuityKey:context.continuityKey,characterName:context.characterName,referenceCount:refs.length,referenceKeys:selection.keys,characterNames:selection.characterNames,styleKeys:selection.styleKeys,bridgeUsed:false},
        };
      }
      const bridge=await imageProvider.generate({
        prompt:[prompt,input.prompt,'Create a clean production-ready first frame for animation. No text, labels, logos or watermarks.'].filter(Boolean).join(' '),
        aspectRatio:input.aspectRatio,
        referenceUris:refs,
      });
      const result=await videoProvider.generate({...input,prompt:[prompt,input.prompt,'Animate from the supplied canonical keyframe without redesigning characters or art style. Preserve facial identity, wardrobe, proportions, palette and rendering language across motion.'].filter(Boolean).join(' '),referenceUris:[bridge.uri]});
      const bridgeCost=Math.max(0,Number(bridge.costUsd??0)),videoCost=Math.max(0,Number(result.costUsd??0));
      return{
        ...result,
        costUsd:bridgeCost+videoCost,
        metadata:{...(result.metadata??{}),continuityBridge:{used:true,bridgeAssetId:bridge.id,bridgeUri:bridge.uri,bridgeModel:bridge.model??null,canonicalReferenceCount:refs.length,referenceKeys:selection.keys,characterNames:selection.characterNames,styleKeys:selection.styleKeys,bridgeCostUsd:bridgeCost,videoCostUsd:videoCost,totalCostUsd:bridgeCost+videoCost}},
        brandContinuity:{required:context.required,channelKey:context.channelKey,continuityKey:context.continuityKey,characterName:context.characterName,referenceCount:refs.length,referenceKeys:selection.keys,characterNames:selection.characterNames,styleKeys:selection.styleKeys,bridgeUsed:true},
      };
    },
  };
}
