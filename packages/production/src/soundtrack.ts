import type { AudioLibraryAsset, ContentExecutionPlan, ProductionContentFormat, SoundtrackCue, SoundtrackPlan, VideoScript } from './types.js';

const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
const normalize=(values:string[]|undefined)=>new Set((values??[]).map((value)=>String(value).trim().toLowerCase()).filter(Boolean));

function narrativeMoods(script:VideoScript){
  const moods=new Map<string,number>([['documentary',3],['cinematic',2],['subtle',2]]);
  for(const beat of script.beats){
    const bump=(key:string,value:number)=>moods.set(key,(moods.get(key)??0)+value);
    if(beat.purpose==='hook'){bump('tension',5);bump('curiosity',4);}
    if(beat.purpose==='setup'){bump('ambient',3);bump('restrained',2);}
    if(beat.purpose==='evidence'){bump('analytical',5);bump('focused',3);}
    if(beat.purpose==='escalation'){bump('tension',5);bump('driving',4);}
    if(beat.purpose==='reveal'){bump('reveal',5);bump('cinematic',3);}
    if(beat.purpose==='payoff'){bump('resolve',5);bump('uplift',2);}
  }
  return [...moods.entries()].sort((a,b)=>b[1]-a[1]).map(([key])=>key);
}

function assetScore(asset:AudioLibraryAsset,format:ProductionContentFormat,moods:string[],desiredTags:string[]=[]){
  if(asset.rightsStatus!=='CLEARED')return -Infinity;
  if(asset.formats?.length&&!asset.formats.includes(format))return -Infinity;
  const assetMoods=normalize(asset.moods),tags=normalize(asset.tags);
  let score=0;
  moods.slice(0,6).forEach((mood,index)=>{if(assetMoods.has(mood)||tags.has(mood))score+=Math.max(1,8-index);});
  desiredTags.forEach((tag)=>{const key=tag.toLowerCase();if(tags.has(key)||assetMoods.has(key))score+=8;});
  if(asset.kind==='music'&&tags.has('background'))score+=3;
  if(asset.kind==='sfx'&&tags.has('transition'))score+=2;
  score-=Math.max(0,Number(asset.costUsd??0))*2;
  return score;
}

function hasAnyTag(asset:AudioLibraryAsset,desired:string[]){const values=normalize([...(asset.tags??[]),...(asset.moods??[])]);return desired.some((tag)=>values.has(tag));}
function cueFrom(asset:AudioLibraryAsset,startSec:number,reason:string,gainFallback:number,extras:Partial<SoundtrackCue>={}):SoundtrackCue{
  return {assetId:asset.id,kind:asset.kind,uri:asset.uri,startSec:Math.max(0,startSec),gain:clamp(Number(asset.defaultGain??gainFallback),0.02,asset.kind==='music'?0.35:0.7),license:asset.license,rightsStatus:asset.rightsStatus,sourceUrl:asset.sourceUrl,costUsd:Math.max(0,Number(asset.costUsd??0)),reason,...extras};
}

export function selectLicensedSoundtrack(input:{script:VideoScript;contentFormat:ProductionContentFormat;catalog?:AudioLibraryAsset[];maxAudioCostUsd?:number;enableMusic?:boolean;enableSfx?:boolean;audioMode?:ContentExecutionPlan['audioMode'];archetypeId?:string}):SoundtrackPlan{
  const catalog=input.catalog??[];
  const budget=Math.max(0,Number(input.maxAudioCostUsd??1.5));
  const moods=narrativeMoods(input.script);
  const notes:string[]=[];
  const selectedIds=new Set<string>();
  let spent=0;
  let music:SoundtrackCue|undefined;
  const sfx:SoundtrackCue[]=[];
  const naturalSound=input.audioMode==='NATURAL_SOUND';

  if(naturalSound&&input.enableSfx!==false){
    const ambientTags=['ambience','ambient','roomtone','location','natural','outdoor','indoor','animal'];
    const ambient=catalog.filter((asset)=>asset.kind==='sfx'&&hasAnyTag(asset,ambientTags)).map((asset)=>({asset,score:assetScore(asset,input.contentFormat,['ambient','natural'],ambientTags)})).filter((item)=>Number.isFinite(item.score)).sort((a,b)=>b.score-a.score).find(({asset})=>spent+Math.max(0,Number(asset.costUsd??0))<=budget);
    if(ambient){
      const cue=cueFrom(ambient.asset,0,`Natural ambience bed for ${input.archetypeId??'visual-first content'}`,0.12,{loop:true,endSec:input.script.targetDurationSec});
      sfx.push(cue);selectedIds.add(ambient.asset.id);spent+=cue.costUsd??0;
      notes.push(`Natural ambience ${ambient.asset.id} selected and looped under the visual event.`);
    }else notes.push('No cleared natural ambience matched the catalog; do not substitute cinematic music or fake source audio.');
    const accentTags=['natural','animal','reaction','foley','contact'];
    for(const beat of input.script.beats.filter((beat)=>['hook','reveal','payoff'].includes(beat.purpose))){
      if(sfx.length>=(ambient?3:2))break;
      const winner=catalog.filter((asset)=>asset.kind==='sfx'&&!selectedIds.has(asset.id)&&hasAnyTag(asset,accentTags)).map((asset)=>({asset,score:assetScore(asset,input.contentFormat,['natural'],[beat.purpose,...accentTags])})).filter((item)=>Number.isFinite(item.score)&&item.score>0).sort((a,b)=>b.score-a.score).find(({asset})=>spent+Math.max(0,Number(asset.costUsd??0))<=budget);
      if(!winner)continue;
      const cue=cueFrom(winner.asset,beat.startSec,`Natural ${beat.purpose} accent · ${winner.asset.id}`,0.18);
      sfx.push(cue);selectedIds.add(winner.asset.id);spent+=cue.costUsd??0;
    }
    notes.push(`${sfx.length} natural/location cue(s) selected; generic transition packs and background music are disabled.`);
  }else{
    if(input.enableMusic!==false){
      const audioModeTags=input.audioMode==='DIALOGUE_LED'?['gentle','playful']:input.audioMode==='HYBRID'?['social','light']:['background'];
      const candidates=catalog.filter((asset)=>asset.kind==='music').map((asset)=>({asset,score:assetScore(asset,input.contentFormat,moods,audioModeTags)})).filter((item)=>Number.isFinite(item.score)).sort((a,b)=>b.score-a.score);
      const winner=candidates.find(({asset})=>spent+Math.max(0,Number(asset.costUsd??0))<=budget);
      if(winner){
        music=cueFrom(winner.asset,0,`Best cleared ${input.audioMode??'background'} match for ${moods.slice(0,4).join(', ')}`,0.16);
        selectedIds.add(winner.asset.id);spent+=music.costUsd??0;
        notes.push(`Music ${winner.asset.id} selected from CLEARED catalog at score ${winner.score.toFixed(1)}.`);
      }else notes.push('No budget-compatible CLEARED music asset matched; spoken audio remains clean.');
    }

    if(input.enableSfx!==false){
      const beatCandidates=input.script.beats.filter((beat)=>['hook','escalation','reveal','payoff'].includes(beat.purpose));
      const maxCues=input.contentFormat==='SHORT_VERTICAL'?3:5;
      for(const beat of beatCandidates){
        if(sfx.length>=maxCues)break;
        const modeTags=input.audioMode==='DIALOGUE_LED'?['reaction','playful']:input.audioMode==='HYBRID'?['reaction']:[];
        const desired=[beat.purpose,beat.retentionDevice??'',beat.purpose==='reveal'?'impact':'transition',...modeTags].filter(Boolean);
        const candidates=catalog.filter((asset)=>asset.kind==='sfx'&&!selectedIds.has(asset.id)).map((asset)=>({asset,score:assetScore(asset,input.contentFormat,moods,desired)})).filter((item)=>Number.isFinite(item.score)&&item.score>0).sort((a,b)=>b.score-a.score);
        const winner=candidates.find(({asset})=>spent+Math.max(0,Number(asset.costUsd??0))<=budget);
        if(!winner)continue;
        const cue=cueFrom(winner.asset,beat.startSec,`${beat.purpose} accent · ${winner.asset.id}`,0.22);
        sfx.push(cue);selectedIds.add(winner.asset.id);spent+=cue.costUsd??0;
      }
      if(sfx.length)notes.push(`${sfx.length} sparse narrative SFX cue(s) selected; no constant effect bed.`);
    }
  }

  const selected=[...(music?[music]:[]),...sfx];
  const rightsReady=selected.every((cue)=>cue.rightsStatus==='CLEARED'&&Boolean(cue.license));
  if(!rightsReady)notes.push('Audio rights are not fully cleared; public release must remain blocked.');
  if(spent>budget+1e-9)notes.push(`Audio spend exceeded budget unexpectedly: $${spent.toFixed(2)} > $${budget.toFixed(2)}.`);
  return{music,sfx,rightsReady,estimatedCostUsd:Math.round(spent*10000)/10000,selectionNotes:notes};
}
