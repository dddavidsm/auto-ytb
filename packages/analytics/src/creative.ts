export type CreativeRetentionPoint={elapsedRatio:number;audienceWatchRatio:number};

type BeatLike={id:string;startSec:number;targetDurationSec:number;purpose:string;narration?:string;retentionDevice?:string;visualIntent?:string;sourceIds?:string[]};
type SceneLike={id:string;startSec:number;durationSec:number;kind:string;generated:boolean;visualValue?:number;costTier?:string;selectionReason?:string;sourceIds?:string[]};
type PackagingLike={id:string;title:string;thumbnailText?:string;promise?:string;curiosity?:number;clarity?:number;credibility?:number;differentiation?:number;score?:number};

export type CreativeFingerprint={
  contentFormat:string;language?:string;durationSeconds:number;
  hookType:string;hookRetentionDevice:string;narrativeArchetype:string;
  beatCount:number;sceneCount:number;visualMix:Record<string,number>;
  averageSceneSeconds:number;longestSceneSeconds:number;visualChangesPerMinute:number;
  retentionDeviceMix:Record<string,number>;beatPurposeMix:Record<string,number>;
  selectedPackaging:PackagingLike|null;attentionScore?:number;
  beats:BeatLike[];scenes:SceneLike[];
};

export type CreativeSegmentObservation={
  segmentType:'beat'|'scene';segmentKey:string;startSeconds:number;endSeconds:number;startRatio:number;endRatio:number;
  startRetention:number|null;endRetention:number|null;averageRetention:number|null;retentionDelta:number|null;
  localDips:number;localSpikes:number;features:Record<string,unknown>;
};

function round(value:number,digits=4){const p=10**digits;return Math.round(value*p)/p;}
function mix(values:string[]){const out:Record<string,number>={};for(const value of values){const key=value||'none';out[key]=(out[key]??0)+1;}return out;}
function narrativeArchetype(beats:BeatLike[]){const purposes=beats.map((beat)=>beat.purpose);if(purposes.includes('evidence')&&purposes.includes('escalation')&&purposes.some((p)=>p==='reveal'||p==='payoff'))return 'evidence-escalation-reveal';if(purposes.includes('reveal')||purposes.includes('payoff'))return 'setup-reveal-payoff';if(purposes.includes('evidence'))return 'explainer-evidence';return 'linear';}
function interpolate(points:CreativeRetentionPoint[],ratio:number){if(!points.length)return null;const sorted=[...points].sort((a,b)=>a.elapsedRatio-b.elapsedRatio);if(ratio<=sorted[0].elapsedRatio)return sorted[0].audienceWatchRatio;if(ratio>=sorted.at(-1)!.elapsedRatio)return sorted.at(-1)!.audienceWatchRatio;for(let i=1;i<sorted.length;i+=1){const left=sorted[i-1],right=sorted[i];if(ratio<=right.elapsedRatio){const span=Math.max(1e-9,right.elapsedRatio-left.elapsedRatio);const t=(ratio-left.elapsedRatio)/span;return left.audienceWatchRatio+(right.audienceWatchRatio-left.audienceWatchRatio)*t;}}return sorted.at(-1)!.audienceWatchRatio;}
function localPoints(points:CreativeRetentionPoint[],startRatio:number,endRatio:number){return points.filter((point)=>point.elapsedRatio>=startRatio&&point.elapsedRatio<=endRatio).sort((a,b)=>a.elapsedRatio-b.elapsedRatio);}
function events(points:CreativeRetentionPoint[]){let dips=0,spikes=0;for(let i=1;i<points.length;i+=1){const delta=points[i].audienceWatchRatio-points[i-1].audienceWatchRatio;if(delta<=-0.05)dips+=1;else if(delta>=0.035)spikes+=1;}return{dips,spikes};}
function durationBucket(seconds:number){if(seconds<=3)return'0-3s';if(seconds<=6)return'3-6s';if(seconds<=10)return'6-10s';if(seconds<=16)return'10-16s';if(seconds<=24)return'16-24s';return'24s+';}
function visualValueBucket(value:number|undefined){const n=Number(value??0);if(n>=85)return'85+';if(n>=70)return'70-84';if(n>=50)return'50-69';return'<50';}

export function extractCreativeFingerprint(input:{contentFormat:string;script:{language?:string;targetDurationSec:number;beats:BeatLike[]};scenes:SceneLike[];packaging:PackagingLike[];selectedPackagingId?:string;attentionScore?:number}):CreativeFingerprint{
  const duration=Math.max(1,Number(input.script.targetDurationSec||0));
  const sceneDurations=input.scenes.map((scene)=>Math.max(0,Number(scene.durationSec||0)));
  const selected=input.packaging.find((variant)=>variant.id===input.selectedPackagingId)??input.packaging[0]??null;
  return{
    contentFormat:input.contentFormat,language:input.script.language,durationSeconds:duration,
    hookType:input.script.beats[0]?.purpose??'none',hookRetentionDevice:input.script.beats[0]?.retentionDevice??'none',narrativeArchetype:narrativeArchetype(input.script.beats),
    beatCount:input.script.beats.length,sceneCount:input.scenes.length,visualMix:mix(input.scenes.map((scene)=>scene.kind)),
    averageSceneSeconds:round(sceneDurations.length?sceneDurations.reduce((a,b)=>a+b,0)/sceneDurations.length:0),longestSceneSeconds:round(Math.max(0,...sceneDurations)),visualChangesPerMinute:round(input.scenes.length/(duration/60)),
    retentionDeviceMix:mix(input.script.beats.map((beat)=>beat.retentionDevice??'none')),beatPurposeMix:mix(input.script.beats.map((beat)=>beat.purpose)),selectedPackaging:selected,attentionScore:input.attentionScore,
    beats:input.script.beats,scenes:input.scenes,
  };
}

export function alignRetentionToCreativeSegments(fingerprint:CreativeFingerprint,points:CreativeRetentionPoint[]):CreativeSegmentObservation[]{
  const duration=Math.max(1,fingerprint.durationSeconds);
  const observe=(segmentType:'beat'|'scene',segment:any,start:number,end:number,features:Record<string,unknown>)=>{
    const startRatio=Math.max(0,Math.min(1,start/duration)),endRatio=Math.max(startRatio,Math.min(1,end/duration));
    const startRetention=interpolate(points,startRatio),endRetention=interpolate(points,endRatio);const local=localPoints(points,startRatio,endRatio);const all=[...(startRetention==null?[]:[startRetention]),...local.map((p)=>p.audienceWatchRatio),...(endRetention==null?[]:[endRetention])];
    const avg=all.length?all.reduce((a,b)=>a+b,0)/all.length:null;const delta=startRetention==null||endRetention==null?null:endRetention-startRetention;const ev=events([{elapsedRatio:startRatio,audienceWatchRatio:startRetention??0},...local,{elapsedRatio:endRatio,audienceWatchRatio:endRetention??0}]);
    return{segmentType,segmentKey:String(segment.id),startSeconds:round(start,3),endSeconds:round(end,3),startRatio:round(startRatio,6),endRatio:round(endRatio,6),startRetention:startRetention==null?null:round(startRetention,6),endRetention:endRetention==null?null:round(endRetention,6),averageRetention:avg==null?null:round(avg,6),retentionDelta:delta==null?null:round(delta,6),localDips:ev.dips,localSpikes:ev.spikes,features};
  };
  const beats=fingerprint.beats.map((beat)=>observe('beat',beat,Number(beat.startSec||0),Number(beat.startSec||0)+Number(beat.targetDurationSec||0),{purpose:beat.purpose,retentionDevice:beat.retentionDevice??'none',durationBucket:durationBucket(Number(beat.targetDurationSec||0)),sourceBacked:Boolean(beat.sourceIds?.length),opening:Number(beat.startSec||0)<30}));
  const scenes=fingerprint.scenes.map((scene)=>observe('scene',scene,Number(scene.startSec||0),Number(scene.startSec||0)+Number(scene.durationSec||0),{kind:scene.kind,generated:Boolean(scene.generated),visualValueBucket:visualValueBucket(scene.visualValue),costTier:scene.costTier??'unknown',durationBucket:durationBucket(Number(scene.durationSec||0)),sourceBacked:Boolean(scene.sourceIds?.length),selectionReason:scene.selectionReason??null,opening:Number(scene.startSec||0)<30}));
  return[...beats,...scenes];
}

export function featureSignalsFromObservations(observations:CreativeSegmentObservation[]){
  const signals:Array<{featureName:string;featureValue:string;retentionDelta:number|null;averageRetention:number|null;segmentType:string}>=[];
  for(const observation of observations){for(const [featureName,value] of Object.entries(observation.features)){if(value===null||value===undefined||typeof value==='object')continue;signals.push({featureName,featureValue:String(value),retentionDelta:observation.retentionDelta,averageRetention:observation.averageRetention,segmentType:observation.segmentType});}}
  return signals;
}
