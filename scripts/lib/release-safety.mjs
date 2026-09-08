const list=(value)=>Array.isArray(value)?value:[];
const text=(value)=>String(value??'').trim();
const persistentMode=(mode)=>['persistent','persistent-character','character','persistent_character'].includes(text(mode).toLowerCase());

export function auditFinalManifestReleaseSafety(manifest={},channel={}){
  const issues=[];
  const warnings=[];
  const soundtrack=manifest.soundtrack??{};
  const naturalSoundRequired=text(manifest.executionPlan?.audioMode)==='NATURAL_SOUND';
  const audioCues=[...(manifest.music?[manifest.music]:[]),...list(manifest.sfx),...(!manifest.music&&soundtrack.music?[soundtrack.music]:[]),...(list(soundtrack.sfx))];
  const uniqueAudio=new Map();
  for(const cue of audioCues){const key=`${text(cue?.kind)}:${text(cue?.assetId)}:${text(cue?.uri)}`;if(!uniqueAudio.has(key))uniqueAudio.set(key,cue);}
  for(const cue of uniqueAudio.values()){
    if(text(cue?.rightsStatus)!=='CLEARED')issues.push(`audio:${text(cue?.assetId)||'unknown'} rightsStatus is ${text(cue?.rightsStatus)||'missing'}, not CLEARED`);
    if(!text(cue?.license))issues.push(`audio:${text(cue?.assetId)||'unknown'} has no license record`);
    if(!text(cue?.uri))issues.push(`audio:${text(cue?.assetId)||'unknown'} has no source URI`);
  }
  if(soundtrack&&Object.keys(soundtrack).length&&soundtrack.rightsReady===false)issues.push('soundtrack rightsReady is false');
  if(audioCues.length===0){
    if(naturalSoundRequired)issues.push('audio:natural-sound-required but no cleared ambience/foley/reaction cue is present in the final manifest');
    else warnings.push('No soundtrack cues in final manifest; voice-only release is allowed.');
  }

  const identity=channel.identity??{};
  const characterMode=identity.characterMode??channel.characterMode??'none';
  const characterName=text(identity.characterName??channel.characterName);
  const continuityRequired=persistentMode(characterMode);
  const generated=list(manifest.assets).filter((asset)=>asset?.generated===true);
  let continuityKey=null;
  let continuityCompliant=0;
  if(continuityRequired){
    if(!generated.length)issues.push('Persistent-character channel has no generated scene assets to audit for continuity.');
    for(const asset of generated){
      const proof=asset?.brandContinuity??asset?.metadata?.brandContinuity;
      const id=text(asset?.id)||text(asset?.sceneId)||'unknown';
      if(!proof){issues.push(`brand:${id} missing brandContinuity proof`);continue;}
      const key=text(proof.continuityKey);
      if(!key){issues.push(`brand:${id} missing continuityKey`);continue;}
      if(continuityKey==null)continuityKey=key;
      else if(key!==continuityKey){issues.push(`brand:${id} continuityKey ${key} differs from ${continuityKey}`);continue;}
      if(Number(proof.referenceCount??0)<1){issues.push(`brand:${id} canonical reference was not applied`);continue;}
      if(characterName&&text(proof.characterName)!==characterName){issues.push(`brand:${id} character ${text(proof.characterName)||'missing'} differs from ${characterName}`);continue;}
      continuityCompliant+=1;
    }
  }

  const audioReady=issues.every((issue)=>!issue.startsWith('audio:')&&!issue.startsWith('soundtrack'));
  const brandReady=issues.every((issue)=>!issue.startsWith('brand:')&&!issue.startsWith('Persistent-character'));
  return{
    passed:issues.length===0,
    audioReady,
    brandReady,
    issues,
    warnings,
    audio:{cueCount:uniqueAudio.size,rightsReady:audioReady,naturalSoundRequired},
    brand:{required:continuityRequired,characterMode:text(characterMode),characterName:characterName||null,continuityKey,generatedAssetCount:generated.length,compliantAssetCount:continuityCompliant},
  };
}
