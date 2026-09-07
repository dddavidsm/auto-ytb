export type ContentFormat = 'LONG_HORIZONTAL' | 'SHORT_VERTICAL' | 'HYBRID';

export type FormatSignals = {
  narrativeDepth: number;
  visualSnackability: number;
  trendVelocity: number;
  searchIntentDepth: number;
  repeatability: number;
  monetizationDepth: number;
  sponsorFit: number;
  shortHookStrength: number;
  longRetentionPotential: number;
  mobileConsumptionFit: number;
  tvConsumptionFit: number;
  kidAudienceFit?: number;
  episodicPotential?: number;
  productionComplexity?: number;
};

export type FormatRisk = {
  madeForKidsRisk?: number;
  copyrightRisk?: number;
  policyRisk?: number;
  lowEffortRisk?: number;
};

export type FormatRecommendation = {
  primary: ContentFormat;
  scores: Record<ContentFormat, number>;
  confidence: number;
  rationale: string[];
  suggestedDurationsSec: {
    longHorizontal?: { min: number; target: number; max: number };
    shortVertical?: { min: number; target: number; max: number };
  };
  derivativeStrategy: 'NONE' | 'LONG_TO_SHORTS' | 'SHORTS_TO_LONG' | 'BIDIRECTIONAL';
};

const clamp=(v:number,min=0,max=100)=>Math.max(min,Math.min(max,v));
const r=(v:number)=>Math.round(v*10)/10;

export function recommendContentFormat(signals: FormatSignals, risks: FormatRisk = {}): FormatRecommendation {
  const longScore =
    signals.narrativeDepth*0.18 +
    signals.searchIntentDepth*0.10 +
    signals.monetizationDepth*0.14 +
    signals.sponsorFit*0.10 +
    signals.longRetentionPotential*0.20 +
    signals.tvConsumptionFit*0.10 +
    (signals.episodicPotential ?? 50)*0.08 +
    (100-signals.productionComplexity! || 50)*0;

  const shortScore =
    signals.visualSnackability*0.18 +
    signals.trendVelocity*0.16 +
    signals.repeatability*0.14 +
    signals.shortHookStrength*0.20 +
    signals.mobileConsumptionFit*0.16 +
    (signals.episodicPotential ?? 50)*0.06 +
    (signals.kidAudienceFit ?? 0)*0.10;

  let long = longScore;
  let short = shortScore;

  const lowEffortPenalty=clamp(risks.lowEffortRisk ?? 0)*0.12;
  const copyrightPenalty=clamp(risks.copyrightRisk ?? 0)*0.08;
  const policyPenalty=clamp(risks.policyRisk ?? 0)*0.08;
  long -= lowEffortPenalty*0.65 + copyrightPenalty + policyPenalty;
  short -= lowEffortPenalty + copyrightPenalty + policyPenalty;

  // Made-for-kids is not automatically bad, but it materially changes monetization, personalization and compliance.
  const kidRisk=clamp(risks.madeForKidsRisk ?? 0);
  if(kidRisk >= 60) {
    long -= 3;
    short -= 2;
  }

  long=clamp(long);
  short=clamp(short);
  const hybrid=clamp(Math.min(long,short)*0.72 + Math.max(long,short)*0.28 + (Math.abs(long-short)<=12 ? 7 : 0));
  const scores={LONG_HORIZONTAL:r(long),SHORT_VERTICAL:r(short),HYBRID:r(hybrid)};
  const ranked=(Object.entries(scores) as Array<[ContentFormat,number]>).sort((a,b)=>b[1]-a[1]);
  const primary=ranked[0][0];
  const confidence=r(clamp(55 + Math.abs(ranked[0][1]-ranked[1][1])*2 + Math.max(long,short)*0.18));
  const rationale:string[]=[];
  if(long>=70) rationale.push('Strong depth/retention/monetization signals support long-form horizontal.');
  if(short>=70) rationale.push('Strong hook/velocity/mobile/repeatability signals support Shorts.');
  if(Math.abs(long-short)<=12) rationale.push('Both formats are viable; use a hybrid funnel and learn them independently.');
  if((signals.kidAudienceFit ?? 0)>=65) rationale.push('Kid-audience fit is high; treat made-for-kids compliance and economics as a separate channel model, not a generic format shortcut.');
  if((risks.lowEffortRisk ?? 0)>=60) rationale.push('High low-effort/repetitive-content risk: require stronger originality and editorial value regardless of format.');

  let derivativeStrategy: FormatRecommendation['derivativeStrategy']='NONE';
  if(primary==='LONG_HORIZONTAL' && short>=55) derivativeStrategy='LONG_TO_SHORTS';
  else if(primary==='SHORT_VERTICAL' && long>=55) derivativeStrategy='SHORTS_TO_LONG';
  else if(primary==='HYBRID') derivativeStrategy='BIDIRECTIONAL';

  return {
    primary,
    scores,
    confidence,
    rationale,
    suggestedDurationsSec:{
      longHorizontal: long>=50 ? {min:420,target:660,max:1200} : undefined,
      shortVertical: short>=50 ? {min:20,target:45,max:180} : undefined,
    },
    derivativeStrategy,
  };
}
