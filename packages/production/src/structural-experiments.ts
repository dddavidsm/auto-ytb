export type StructuralAxis = 'hook' | 'duration' | 'visual_density' | 'cost';

export type StructuralArm = {
  axis: StructuralAxis;
  arm: 'CONTROL' | 'MORE_DIRECT' | 'SHORTER' | 'LONGER' | 'DENSER' | 'SPARSER' | 'LEANER' | 'PREMIUM';
  targetDurationFactor: number;
  targetSceneDurationFactor: number;
  maxCostFactor: number;
  scriptGuidance?: string;
};

export type StructuralArmLearning = {
  axis: StructuralAxis;
  arm: StructuralArm['arm'];
  sampleSize: number;
  meanOutcomeScore: number;
};

export type StructuralLearningProfile = {
  sampleSize: number;
  arms: StructuralArmLearning[];
};

export type StructuralExperiment = {
  mode: 'CONTROL' | 'EXPLOIT' | 'EXPLORE';
  explorationRate: number;
  selected: StructuralArm;
  sampleSize: number;
  learnedScores: Array<{ axis: StructuralAxis; arm: StructuralArm['arm']; sampleSize: number; observedMean: number | null; confidence: number; learnedScore: number }>;
};

const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
const round=(v:number)=>Math.round(v*10)/10;
const stableUnit=(seed:string)=>{let h=2166136261;for(let i=0;i<seed.length;i+=1){h^=seed.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0)/4294967295;};

export function structuralExplorationRate(sampleSize:number):number{
  return clamp(0.22/Math.sqrt(Math.max(1,sampleSize/4)),0.06,0.22);
}

function availableArms(allowCostExperiment=true):StructuralArm[]{
  const arms:StructuralArm[]=[
    {axis:'hook',arm:'CONTROL',targetDurationFactor:1,targetSceneDurationFactor:1,maxCostFactor:1},
    {axis:'hook',arm:'MORE_DIRECT',targetDurationFactor:1,targetSceneDurationFactor:1,maxCostFactor:1,scriptGuidance:'Experimental arm: make the hook materially more direct than baseline. State the central tension and stakes earlier, without exaggeration.'},
    {axis:'duration',arm:'SHORTER',targetDurationFactor:0.92,targetSceneDurationFactor:1,maxCostFactor:0.96,scriptGuidance:'Experimental arm: compress exposition and transitions while preserving evidence and payoff.'},
    {axis:'duration',arm:'LONGER',targetDurationFactor:1.08,targetSceneDurationFactor:1,maxCostFactor:1.05,scriptGuidance:'Experimental arm: allow slightly deeper development only where it increases understanding or payoff; no filler.'},
    {axis:'visual_density',arm:'DENSER',targetDurationFactor:1,targetSceneDurationFactor:0.85,maxCostFactor:1.05},
    {axis:'visual_density',arm:'SPARSER',targetDurationFactor:1,targetSceneDurationFactor:1.15,maxCostFactor:0.96},
  ];
  if(allowCostExperiment){
    arms.push(
      {axis:'cost',arm:'LEANER',targetDurationFactor:1,targetSceneDurationFactor:1.08,maxCostFactor:0.88},
      {axis:'cost',arm:'PREMIUM',targetDurationFactor:1,targetSceneDurationFactor:0.95,maxCostFactor:1.10},
    );
  }
  return arms;
}

function learnedRows(arms:StructuralArm[],profile?:StructuralLearningProfile){
  return arms.map((candidate)=>{
    const observed=profile?.arms.find((item)=>item.axis===candidate.axis&&item.arm===candidate.arm);
    const sampleSize=Math.max(0,Math.floor(observed?.sampleSize ?? 0));
    const mean=observed&&Number.isFinite(observed.meanOutcomeScore)?clamp(observed.meanOutcomeScore,0,100):null;
    // Bayesian-style shrinkage toward a neutral 50 prior prevents one or two lucky videos from taking over.
    const confidence=sampleSize/(sampleSize+5);
    const learnedScore=mean==null?50:50+(mean-50)*confidence;
    return {axis:candidate.axis,arm:candidate.arm,sampleSize,observedMean:mean,confidence:round(confidence),learnedScore:round(learnedScore)};
  });
}

export function selectStructuralExperiment(input:{sampleSize:number;experimentSeed:string;allowCostExperiment?:boolean;learning?:StructuralLearningProfile;}):StructuralExperiment{
  const rate=structuralExplorationRate(input.sampleSize);
  const arms=availableArms(input.allowCostExperiment!==false);
  const scores=learnedRows(arms,input.learning);
  const control=arms[0]!;
  const controlScore=scores[0]?.learnedScore ?? 50;
  const explore=stableUnit(`${input.experimentSeed}:structural:mode`)<rate;

  if(explore){
    const exploratory=arms.slice(1);
    const idx=Math.floor(stableUnit(`${input.experimentSeed}:structural:arm`)*exploratory.length);
    return {mode:'EXPLORE',explorationRate:round(rate),selected:exploratory[Math.min(idx,exploratory.length-1)]!,sampleSize:input.sampleSize,learnedScores:scores};
  }

  const ranked=scores
    .slice(1)
    .filter((row)=>row.sampleSize>=3)
    .sort((a,b)=>b.learnedScore-a.learnedScore||b.sampleSize-a.sampleSize);
  const best=ranked[0];
  // Require both minimum evidence and a material learned advantage over control before exploiting.
  if(best && best.learnedScore>=controlScore+3){
    const selected=arms.find((arm)=>arm.axis===best.axis&&arm.arm===best.arm)!;
    return {mode:'EXPLOIT',explorationRate:round(rate),selected,sampleSize:input.sampleSize,learnedScores:scores};
  }
  return {mode:'CONTROL',explorationRate:round(rate),selected:control,sampleSize:input.sampleSize,learnedScores:scores};
}
