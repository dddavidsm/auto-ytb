export type SeriesMemoryFact={type:string;key:string;importance:number;canonical:boolean;payload:Record<string,unknown>};
export type SeriesMemoryConflict={code:string;severity:'WARN'|'BLOCK';message:string;memoryKey?:string};
export type SeriesPerformanceEvidence={sampleSize:number;views:number;averageViewPercentage?:number|null;averageViewDurationSeconds?:number|null;shareRate?:number|null;subscribersPerThousand?:number|null;revenueUsd?:number|null;costUsd?:number|null;profitUsd?:number|null;roi?:number|null;watchMinutesPerDollar?:number|null};
export type SeriesContinuationDecision={decision:'LEARN'|'CONTINUE'|'SCALE'|'PAUSE'|'REVIEW';score:number;confidence:number;rationale:string[]};
const clamp=(value:number,min=0,max=100)=>Math.max(min,Math.min(max,value));
const keyOf=(fact:SeriesMemoryFact)=>`${fact.type.trim().toLowerCase()}:${fact.key.trim().toLowerCase()}`;

export function mergeCanonicalMemory(existing:SeriesMemoryFact[],incoming:SeriesMemoryFact[],limit=80):SeriesMemoryFact[]{
  const map=new Map<string,SeriesMemoryFact>();
  for(const fact of [...existing,...incoming]){
    if(!fact?.type?.trim()||!fact?.key?.trim())continue;
    const normalized={...fact,importance:clamp(Number(fact.importance??50)),canonical:fact.canonical!==false,payload:fact.payload&&typeof fact.payload==='object'?fact.payload:{}};
    const key=keyOf(normalized),current=map.get(key);
    if(!current||normalized.importance>=current.importance)map.set(key,normalized);
  }
  return [...map.values()].sort((a,b)=>Number(b.canonical)-Number(a.canonical)||b.importance-a.importance).slice(0,Math.max(1,limit));
}

export function validateEpisodeMemory(input:{facts:SeriesMemoryFact[];conflicts?:SeriesMemoryConflict[];madeForKids?:boolean}):{passed:boolean;blocking:string[];warnings:string[]}{
  const blocking:string[]=[],warnings:string[]=[];
  for(const conflict of input.conflicts??[]){(conflict.severity==='BLOCK'?blocking:warnings).push(`${conflict.code}: ${conflict.message}`);}
  for(const fact of input.facts??[]){
    if(!fact.type?.trim()||!fact.key?.trim())blocking.push('memory fact missing type/key');
    if(Number(fact.importance)<0||Number(fact.importance)>100)blocking.push(`memory importance out of range: ${fact.key}`);
    const type=fact.type.toLowerCase();
    if(['character_invariant','style_invariant','identity_override'].includes(type))blocking.push(`episode memory cannot rewrite immutable canon: ${fact.key}`);
    if(input.madeForKids&&['purchase_pressure','unsafe_challenge','graphic_violence','sexual_content'].includes(type))blocking.push(`kids series unsafe canonical memory type: ${type}`);
  }
  return{passed:blocking.length===0,blocking,warnings};
}

export function decideSeriesContinuation(evidence:SeriesPerformanceEvidence):SeriesContinuationDecision{
  const n=Math.max(0,Math.floor(evidence.sampleSize||0)),views=Math.max(0,Number(evidence.views||0));
  const confidence=Math.round(Math.min(1,(n/10)*0.65+(Math.log10(views+1)/5)*0.35)*1000)/1000;
  if(n<3||views<300)return{decision:'LEARN',score:50,confidence,rationale:['Not enough episode-level evidence to alter series strategy.']};
  const avp=clamp(Number(evidence.averageViewPercentage??50));
  const share=Math.max(0,Math.min(10,Number(evidence.shareRate??0)));
  const subs=Math.max(-20,Math.min(50,Number(evidence.subscribersPerThousand??0)));
  const roi=Math.max(-2,Math.min(8,Number(evidence.roi??0)));
  const watch=Math.max(0,Math.min(5000,Number(evidence.watchMinutesPerDollar??0)));
  const score=Math.round(clamp(50+(avp-50)*0.55+share*1.3+subs*0.15+roi*4+Math.min(8,Math.log10(watch+1)*2.2))*10)/10;
  const rationale=[`AVP ${avp.toFixed(1)}%`,`ROI ${roi.toFixed(2)}x`,`share rate ${share.toFixed(2)}%`,`n=${n}, views=${Math.round(views)}`];
  if(confidence<0.48)return{decision:'LEARN',score,confidence,rationale:[...rationale,'Evidence confidence remains below the strategy-change threshold.']};
  if(n>=6&&views>=1500&&score>=68&&roi>=0.4)return{decision:'SCALE',score,confidence,rationale:[...rationale,'Series has repeatable audience and economic evidence strong enough to increase cadence/budget cautiously.']};
  if(n>=8&&views>=3000&&score<38&&roi<0)return{decision:'PAUSE',score,confidence,rationale:[...rationale,'Sustained weak retention/economics justify pausing automatic expansion while preserving the IP and history.']};
  if(score>=48)return{decision:'CONTINUE',score,confidence,rationale:[...rationale,'Evidence supports continued episodic production without aggressive scaling.']};
  return{decision:'REVIEW',score,confidence,rationale:[...rationale,'Performance is weak or mixed; keep the series intact but require more experimentation before scaling.']};
}
