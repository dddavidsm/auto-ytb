export type StructuralAxis = 'hook' | 'duration' | 'visual_density' | 'cost';

export type StructuralArm = {
  axis: StructuralAxis;
  arm: 'CONTROL' | 'MORE_DIRECT' | 'SHORTER' | 'LONGER' | 'DENSER' | 'SPARSER' | 'LEANER' | 'PREMIUM';
  targetDurationFactor: number;
  targetSceneDurationFactor: number;
  maxCostFactor: number;
  scriptGuidance?: string;
};

export type StructuralExperiment = {
  mode: 'CONTROL' | 'EXPLORE';
  explorationRate: number;
  selected: StructuralArm;
  sampleSize: number;
};

const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
const stableUnit=(seed:string)=>{let h=2166136261;for(let i=0;i<seed.length;i+=1){h^=seed.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0)/4294967295;};

export function structuralExplorationRate(sampleSize:number):number{
  return clamp(0.22/Math.sqrt(Math.max(1,sampleSize/4)),0.06,0.22);
}

export function selectStructuralExperiment(input:{sampleSize:number;experimentSeed:string;allowCostExperiment?:boolean;}):StructuralExperiment{
  const rate=structuralExplorationRate(input.sampleSize);
  const explore=stableUnit(`${input.experimentSeed}:structural:mode`)<rate;
  const control:StructuralArm={axis:'hook',arm:'CONTROL',targetDurationFactor:1,targetSceneDurationFactor:1,maxCostFactor:1};
  if(!explore) return {mode:'CONTROL',explorationRate:Math.round(rate*100)/100,selected:control,sampleSize:input.sampleSize};

  const arms:StructuralArm[]=[
    {axis:'hook',arm:'MORE_DIRECT',targetDurationFactor:1,targetSceneDurationFactor:1,maxCostFactor:1,scriptGuidance:'Experimental arm: make the hook materially more direct than baseline. State the central tension and stakes earlier, without exaggeration.'},
    {axis:'duration',arm:'SHORTER',targetDurationFactor:0.92,targetSceneDurationFactor:1,maxCostFactor:0.96,scriptGuidance:'Experimental arm: compress exposition and transitions while preserving evidence and payoff.'},
    {axis:'duration',arm:'LONGER',targetDurationFactor:1.08,targetSceneDurationFactor:1,maxCostFactor:1.05,scriptGuidance:'Experimental arm: allow slightly deeper development only where it increases understanding or payoff; no filler.'},
    {axis:'visual_density',arm:'DENSER',targetDurationFactor:1,targetSceneDurationFactor:0.85,maxCostFactor:1.05},
    {axis:'visual_density',arm:'SPARSER',targetDurationFactor:1,targetSceneDurationFactor:1.15,maxCostFactor:0.96},
  ];
  if(input.allowCostExperiment!==false){
    arms.push(
      {axis:'cost',arm:'LEANER',targetDurationFactor:1,targetSceneDurationFactor:1.08,maxCostFactor:0.88},
      {axis:'cost',arm:'PREMIUM',targetDurationFactor:1,targetSceneDurationFactor:0.95,maxCostFactor:1.10},
    );
  }
  const idx=Math.floor(stableUnit(`${input.experimentSeed}:structural:arm`)*arms.length);
  return {mode:'EXPLORE',explorationRate:Math.round(rate*100)/100,selected:arms[Math.min(idx,arms.length-1)]!,sampleSize:input.sampleSize};
}
