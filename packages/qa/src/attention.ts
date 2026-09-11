import type { ContentExecutionPlan, PackagingVariant, ProductionContentFormat, Scene, ScriptBeat, VideoScript } from '@auto-ytb/production';

export type AttentionDimensionId =
  | 'promise-match'
  | 'hook-strength'
  | 'narrative-momentum'
  | 'story-arc'
  | 'visual-communication'
  | 'pattern-variation'
  | 'payoff'
  | 'clarity'
  | 'format-fit';

export type AttentionDimension = {
  id: AttentionDimensionId;
  score: number;
  weight: number;
  message: string;
};

export type AttentionIssue = {
  severity: 'critical' | 'major' | 'minor';
  code: string;
  message: string;
  guidance: string;
};

export type AttentionReview = {
  ready: boolean;
  score: number;
  minScore: number;
  dimensions: AttentionDimension[];
  issues: AttentionIssue[];
  revisionGuidance: string[];
  metrics: {
    firstHookSeconds: number;
    retentionDeviceShare: number;
    averageWordsPerSentence: number;
    visualKindCount: number;
    visualChangeRatePerMinute: number;
    longestSceneSeconds: number;
    sceneDurationCv: number;
  };
};

const STOP = new Set(['the','a','an','and','or','but','to','of','for','in','on','at','is','are','was','were','be','been','being','this','that','it','its','your','you','we','our','with','from','as','by','how','why','what','when','where','who']);
const HOUSEKEEPING = /\b(welcome back|welcome to|in this video|today we(?:'re| are) going to|before we (?:start|begin)|make sure to (?:like|subscribe)|don['’]t forget to subscribe|hit the like button)\b/i;
const CURIOSITY = /\b(but|except|until|hidden|really|actually|why|what if|nobody|secret|problem|changed|turns out|the catch|instead|unexpected|race|risk|mystery|could|might|suddenly|surprise|caught|almost|wait|escape|discover)\b/i;

function clamp(value:number,min=0,max=100){return Math.max(min,Math.min(max,value));}
function round(value:number,digits=1){const p=10**digits;return Math.round(value*p)/p;}
function words(text:string){return String(text??'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter((word)=>word && !STOP.has(word));}
function lexicalCoverage(source:string,target:string){const left=new Set(words(source));const right=new Set(words(target));if(!left.size)return 0;return [...left].filter((word)=>right.has(word)).length/left.size;}
function sentenceStats(text:string){const sentences=String(text??'').split(/[.!?]+/).map((value)=>value.trim()).filter(Boolean);const total=sentences.reduce((sum,sentence)=>sum+sentence.split(/\s+/).filter(Boolean).length,0);return {count:sentences.length,average:sentences.length?total/sentences.length:0};}
function coefficientOfVariation(values:number[]){if(values.length<2)return 0;const mean=values.reduce((a,b)=>a+b,0)/values.length;if(!mean)return 0;const variance=values.reduce((sum,value)=>sum+(value-mean)**2,0)/values.length;return Math.sqrt(variance)/mean;}
function maxRun<T>(items:T[]){let max=0,current=0,last:unknown=Symbol('none');for(const item of items){if(item===last)current+=1;else{last=item;current=1;}max=Math.max(max,current);}return max;}
function communicationForBeat(beat:ScriptBeat|undefined,plan?:ContentExecutionPlan){
  if(!beat)return'';
  if(plan?.scriptMode==='VISUAL_ACTION')return[beat.onScreenText,beat.visualIntent].filter(Boolean).join(' ');
  return beat.narration;
}

export function reviewAttentionBlueprint(input:{
  script: VideoScript;
  packaging: PackagingVariant[];
  scenes: Scene[];
  contentFormat: ProductionContentFormat;
  executionPlan?: ContentExecutionPlan;
  selectedPackagingId?: string;
  minScore?: number;
}): AttentionReview {
  const isShort=input.contentFormat==='SHORT_VERTICAL';
  const visualAction=input.executionPlan?.scriptMode==='VISUAL_ACTION';
  const researchRequired=input.executionPlan?.researchRequired!==false;
  const minScore=input.minScore??86;
  const selected=input.packaging.find((variant)=>variant.id===input.selectedPackagingId)??input.packaging[0];
  const first=input.script.beats[0];
  const communication=input.script.beats.map((beat)=>communicationForBeat(beat,input.executionPlan)).join(' ');
  const opening=input.script.beats.slice(0,isShort?1:2).map((beat)=>communicationForBeat(beat,input.executionPlan)).join(' ');
  const firstCommunication=communicationForBeat(first,input.executionPlan);
  const promiseText=[selected?.title,selected?.promise,selected?.thumbnailText].filter(Boolean).join(' ');
  const promiseCoverage=lexicalCoverage(promiseText,`${input.script.thesis} ${opening}`);

  let promiseScore=clamp(45+promiseCoverage*55);
  if(!selected)promiseScore=20;
  if(HOUSEKEEPING.test(opening))promiseScore-=18;

  const firstHookSeconds=first?.purpose==='hook'?Math.max(0,Number(first.targetDurationSec??0)):999;
  let hookScore=0;
  if(first?.purpose==='hook')hookScore+=34;
  if(Number(first?.startSec??999)<=0.5)hookScore+=16;
  if(firstHookSeconds<=(isShort?4:18))hookScore+=15; else if(firstHookSeconds<=(isShort?8:35))hookScore+=7;
  if(first?.retentionDevice && first.retentionDevice!=='none')hookScore+=15;
  if(CURIOSITY.test(firstCommunication)||Boolean(first?.visualIntent?.trim()))hookScore+=10;
  if(!HOUSEKEEPING.test(firstCommunication))hookScore+=10; else hookScore-=25;
  hookScore=clamp(hookScore);

  const devices=input.script.beats.filter((beat)=>beat.retentionDevice && beat.retentionDevice!=='none').length;
  const retentionDeviceShare=devices/Math.max(1,input.script.beats.length);
  const longBeatLimit=isShort?20:125;
  const oversizedBeats=input.script.beats.filter((beat)=>Number(beat.targetDurationSec)>longBeatLimit).length;
  const activePurposes=new Set(input.script.beats.map((beat)=>beat.purpose));
  const momentumScore=clamp(50+retentionDeviceShare*42-oversizedBeats*10+(activePurposes.has('escalation')?5:0)+(activePurposes.has('reveal')?5:0));

  const purposeOrder=input.script.beats.map((beat)=>beat.purpose);
  const hasHook=purposeOrder[0]==='hook';
  const hasDevelopment=researchRequired
    ?purposeOrder.includes('evidence')||purposeOrder.includes('setup')
    :purposeOrder.includes('setup')||purposeOrder.includes('escalation')||visualAction;
  const hasEscalation=purposeOrder.includes('escalation')||isShort;
  const hasReveal=purposeOrder.includes('reveal')||purposeOrder.includes('payoff');
  const hasPayoff=purposeOrder.includes('payoff')||purposeOrder.includes('reveal');
  const storyArcScore=clamp((hasHook?24:0)+(hasDevelopment?18:0)+(hasEscalation?18:0)+(hasReveal?20:0)+(hasPayoff?20:0));

  const sceneDurations=input.scenes.map((scene)=>Math.max(0,Number(scene.durationSec??0))).filter(Boolean);
  const totalSceneSeconds=sceneDurations.reduce((a,b)=>a+b,0);
  const visualVariantKeys=input.scenes.map((scene)=>scene.kind==='broll'
    ?'broll:'+(scene.sourceFootageId??scene.id)
    :'kind:'+scene.kind);
  const visualKindCount=new Set(visualVariantKeys).size;
  const longestSceneSeconds=Math.max(0,...sceneDurations);
  const visualChangeRatePerMinute=totalSceneSeconds>0?input.scenes.length/(totalSceneSeconds/60):0;
  const sceneDurationCv=coefficientOfVariation(sceneDurations);
  const repeatedKindRun=maxRun(visualVariantKeys);
  const sceneCap=isShort?9:24;
  let visualCommunicationScore=55;
  if(visualKindCount>=(isShort?2:3))visualCommunicationScore+=15;
  else if(visualKindCount>=2)visualCommunicationScore+=8;
  if(longestSceneSeconds<=sceneCap)visualCommunicationScore+=15;else visualCommunicationScore-=Math.min(25,(longestSceneSeconds-sceneCap)*2);
  if(repeatedKindRun<=3)visualCommunicationScore+=10;else visualCommunicationScore-=Math.min(20,(repeatedKindRun-3)*5);
  if(input.scenes.every((scene)=>String(scene.instruction??'').trim().length>=12))visualCommunicationScore+=5;
  if(visualAction&&input.script.beats.every((beat)=>String(beat.visualIntent??'').trim().length>=10))visualCommunicationScore+=5;
  visualCommunicationScore=clamp(visualCommunicationScore);

  let patternVariationScore=70;
  if(sceneDurationCv>=0.12&&sceneDurationCv<=0.8)patternVariationScore+=15;
  if(visualKindCount>=(isShort?2:3))patternVariationScore+=10;
  if(repeatedKindRun>3)patternVariationScore-=15;
  if(visualChangeRatePerMinute<(isShort?8:3.5))patternVariationScore-=20;
  if(visualChangeRatePerMinute>(isShort?35:15))patternVariationScore-=8;
  patternVariationScore=clamp(patternVariationScore);

  const payoffIndex=Math.max(purposeOrder.lastIndexOf('payoff'),purposeOrder.lastIndexOf('reveal'));
  const payoffPosition=payoffIndex>=0?payoffIndex/Math.max(1,input.script.beats.length-1):0;
  let payoffScore=payoffIndex>=0?70:15;
  if(payoffPosition>=0.55)payoffScore+=15;
  if(payoffIndex===input.script.beats.length-1||input.script.beats.slice(payoffIndex+1).every((beat)=>beat.purpose==='cta'))payoffScore+=10;
  if(selected && lexicalCoverage(selected.promise??selected.title,communicationForBeat(input.script.beats[payoffIndex],input.executionPlan))>0.18)payoffScore+=5;
  payoffScore=clamp(payoffScore);

  const sentence=sentenceStats(communication);
  const averageWordsPerSentence=sentence.average;
  let clarityScore=100;
  if(visualAction){
    const maxContextWords=Math.max(0,...input.script.beats.map((beat)=>String(beat.onScreenText??'').trim().split(/\s+/).filter(Boolean).length));
    if(maxContextWords>16)clarityScore-=Math.min(45,(maxContextWords-16)*3);
  }else{
    if(averageWordsPerSentence>28)clarityScore-=Math.min(35,(averageWordsPerSentence-28)*2);
    if(averageWordsPerSentence>35)clarityScore-=15;
  }
  if(HOUSEKEEPING.test(communication))clarityScore-=10;
  clarityScore=clamp(clarityScore);

  const scriptDuration=Number(input.script.targetDurationSec??0);
  let formatFitScore=100;
  if(isShort){
    if(scriptDuration>180||scriptDuration<8)formatFitScore-=45;
    if(firstHookSeconds>4)formatFitScore-=25;
    if(visualChangeRatePerMinute<8)formatFitScore-=20;
  }else{
    if(scriptDuration<180)formatFitScore-=20;
    if(firstHookSeconds>30)formatFitScore-=25;
    if(visualChangeRatePerMinute<3)formatFitScore-=15;
  }
  formatFitScore=clamp(formatFitScore);

  const dimensions:AttentionDimension[]=[
    {id:'promise-match',score:round(promiseScore),weight:14,message:`Packaging-to-opening promise coverage ${(promiseCoverage*100).toFixed(0)}%`},
    {id:'hook-strength',score:round(hookScore),weight:18,message:`${visualAction?'Visual hook':'Hook'} ${firstHookSeconds===999?'missing':`${firstHookSeconds.toFixed(1)}s`} · ${first?.retentionDevice??'no retention device'}`},
    {id:'narrative-momentum',score:round(momentumScore),weight:14,message:`Retention devices ${(retentionDeviceShare*100).toFixed(0)}% · ${oversizedBeats} oversized beats`},
    {id:'story-arc',score:round(storyArcScore),weight:12,message:`Hook ${hasHook?'yes':'no'} · development ${hasDevelopment?'yes':'no'} · escalation ${hasEscalation?'yes':'no'} · reveal/payoff ${hasPayoff?'yes':'no'}`},
    {id:'visual-communication',score:round(visualCommunicationScore),weight:13,message:`${visualKindCount} visual types · longest scene ${longestSceneSeconds.toFixed(1)}s`},
    {id:'pattern-variation',score:round(patternVariationScore),weight:8,message:`${visualChangeRatePerMinute.toFixed(1)} visual changes/min · duration CV ${sceneDurationCv.toFixed(2)}`},
    {id:'payoff',score:round(payoffScore),weight:10,message:payoffIndex>=0?`Payoff/reveal at ${(payoffPosition*100).toFixed(0)}% of beat sequence`:'No payoff/reveal found'},
    {id:'clarity',score:round(clarityScore),weight:6,message:visualAction?'Visual/context text density is readable':`${averageWordsPerSentence.toFixed(1)} words/sentence average`},
    {id:'format-fit',score:round(formatFitScore),weight:5,message:`${input.contentFormat} · ${scriptDuration}s · ${input.executionPlan?.scriptMode??'generic'} attention grammar`},
  ];
  const weightTotal=dimensions.reduce((sum,item)=>sum+item.weight,0);
  const score=round(dimensions.reduce((sum,item)=>sum+item.score*item.weight,0)/weightTotal);
  const issues:AttentionIssue[]=[];
  const add=(severity:AttentionIssue['severity'],code:string,message:string,guidance:string)=>issues.push({severity,code,message,guidance});
  if(hookScore<75)add('critical','weak-hook','Opening is not strong enough for the format.',visualAction?'Make the first visible action immediately understandable and surprising/tense/curious; remove pre-action setup and make the subject/action readable in the first seconds.':isShort?'Make the first spoken/visual beat deliver tension or an irresistible question in the first 1-2 seconds; remove all setup before the hook.':'Open directly on the highest-stakes contradiction, surprising consequence or unresolved question; delay background/context until the promise is clear.');
  if(promiseScore<70)add('critical','promise-mismatch','The title/thumbnail promise is not paid into quickly enough.',visualAction?'Make the opening action/image visibly deliver the packaging promise without relying on narration.':'Rewrite the opening so the viewer immediately understands why the clicked promise matters, without restating the title verbatim.');
  if(storyArcScore<75)add('major','flat-arc','The narrative lacks a complete escalation/reveal/payoff progression.',visualAction?'Reorder visible beats into hook action → complication/escalation → reveal → observable payoff.':'Reorder beats into hook → essential context/evidence → escalation/complication → reveal → payoff.');
  if(momentumScore<72)add('major','low-momentum','Too much of the script lacks curiosity, contrast or progressive revelation.',visualAction?'Make every visible beat change the situation, raise stakes, reveal information or move directly toward the payoff.':'Give each beat a reason to continue: a concrete question, contrast, consequence, reveal or unresolved information gap.');
  if(visualCommunicationScore<72)add('critical','weak-visual-storytelling','Visual plan is too static, repetitive or underspecified.','Make every visual earn its screen time by explaining, proving, escalating or refreshing attention; replace decorative repeats with evidence, action, diagrams, motion or meaningful scene changes.');
  if(patternVariationScore<65)add('major','monotonous-pacing','The visual rhythm is likely to feel monotonous.','Vary scene duration and visual mode according to narrative importance; use pattern interrupts at structural transitions rather than arbitrary fixed intervals.');
  if(payoffScore<72)add('critical','weak-payoff','The video does not clearly resolve the curiosity it creates.',visualAction?'End on an observable result/reaction/consequence that resolves the opening curiosity before any CTA.':'Strengthen the final reveal/payoff so the viewer receives a concrete answer, consequence or emotional resolution before any CTA.');
  if(clarityScore<70)add('major','dense-language',visualAction?'On-screen context is too dense to read at viewing speed.':'Narration is harder to process than necessary.',visualAction?'Reduce on-screen text to short contextual phrases; the visuals/action should carry the story.':'Shorten sentences, remove stacked clauses and make each sentence advance one clear idea.');
  if(formatFitScore<75)add('critical','format-mismatch','The structure does not fit the viewing behavior of this format.','Adapt hook speed, duration and visual cadence specifically to the selected format instead of reusing a long-form/Shorts template.');
  if(HOUSEKEEPING.test(opening))add('critical','housekeeping-intro','The opening contains housekeeping or meta-introduction.','Delete greetings, “in this video”, subscription asks and setup that does not immediately serve the viewer promise.');
  const critical=issues.some((issue)=>issue.severity==='critical');
  const ready=score>=minScore&&!critical;
  return {ready,score,minScore,dimensions,issues,revisionGuidance:issues.map((issue)=>issue.guidance),metrics:{firstHookSeconds:round(firstHookSeconds===999?0:firstHookSeconds),retentionDeviceShare:round(retentionDeviceShare,3),averageWordsPerSentence:round(averageWordsPerSentence),visualKindCount,visualChangeRatePerMinute:round(visualChangeRatePerMinute),longestSceneSeconds:round(longestSceneSeconds),sceneDurationCv:round(sceneDurationCv,3)}};
}
