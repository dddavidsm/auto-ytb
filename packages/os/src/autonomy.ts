export type AutonomousPublishingPolicy = {
  autonomyMode: 'REVIEW_REQUIRED' | 'FULL_AUTONOMOUS';
  allowAutomaticPublicScheduling: boolean;
  minimumQaScoreForAutoPublish: number;
  minimumResearchConfidenceForAutoPublish: number;
  minimumAttentionScoreForAutoPublish?: number;
  minimumFinalMediaScoreForAutoPublish?: number;
  maximumAutoPublishCostUsd?: number;
  blockOnUnresolvedRights: boolean;
  blockOnPolicyWarning: boolean;
  autoPublishDelayMinutes?: number;
};

export type AutonomousPublishContext = {
  qaScore?: number;
  researchConfidence?: number;
  qaBlockers?: string[];
  qaWarnings?: string[];
  attentionScore?: number;
  attentionReady?: boolean;
  finalMediaScore?: number;
  finalMediaPassed?: boolean;
  totalCostUsd?: number;
  productionState?: string | null;
  unresolvedRights?: number;
  policyWarnings?: number;
  youtubeVideoId?: string | null;
};

export type AutonomousPublishDecision = {
  action: 'SCHEDULE' | 'KEEP_PRIVATE';
  publishAt?: string;
  reasons: string[];
};

function finite(value:number|undefined,fallback=0){return Number.isFinite(Number(value))?Number(value):fallback;}

export function decideAutonomousPublication(policy:AutonomousPublishingPolicy,context:AutonomousPublishContext,now=new Date()):AutonomousPublishDecision{
  const reasons:string[]=[];
  if(policy.autonomyMode!=='FULL_AUTONOMOUS')reasons.push('Channel policy requires human review');
  if(!policy.allowAutomaticPublicScheduling)reasons.push('Automatic public scheduling disabled');
  if(!context.youtubeVideoId)reasons.push('No uploaded YouTube video id');
  if((context.qaBlockers?.length??0)>0)reasons.push(`QA blockers: ${context.qaBlockers?.join(', ')}`);
  if(finite(context.qaScore)<policy.minimumQaScoreForAutoPublish)reasons.push(`QA ${finite(context.qaScore)} below ${policy.minimumQaScoreForAutoPublish}`);
  if(finite(context.researchConfidence)<policy.minimumResearchConfidenceForAutoPublish)reasons.push(`Research confidence ${finite(context.researchConfidence)} below ${policy.minimumResearchConfidenceForAutoPublish}`);

  if(policy.minimumAttentionScoreForAutoPublish!=null){
    if(context.attentionReady!==true)reasons.push('Attention review is not READY');
    if(finite(context.attentionScore)<policy.minimumAttentionScoreForAutoPublish)reasons.push(`Attention ${finite(context.attentionScore)} below ${policy.minimumAttentionScoreForAutoPublish}`);
  }
  if(policy.minimumFinalMediaScoreForAutoPublish!=null){
    if(context.finalMediaPassed!==true)reasons.push('Final media inspection did not pass');
    if(finite(context.finalMediaScore)<policy.minimumFinalMediaScoreForAutoPublish)reasons.push(`Final media ${finite(context.finalMediaScore)} below ${policy.minimumFinalMediaScoreForAutoPublish}`);
  }
  if(policy.maximumAutoPublishCostUsd!=null&&finite(context.totalCostUsd)>policy.maximumAutoPublishCostUsd)reasons.push(`Production cost $${finite(context.totalCostUsd).toFixed(2)} exceeds autonomous publish cap $${policy.maximumAutoPublishCostUsd.toFixed(2)}`);
  if(String(context.productionState??'').toUpperCase()==='BLOCKED')reasons.push('Production run is BLOCKED');
  if(policy.blockOnUnresolvedRights&&(context.unresolvedRights??0)>0)reasons.push(`${context.unresolvedRights} unresolved rights items`);
  if(policy.blockOnPolicyWarning&&(context.policyWarnings??0)>0)reasons.push(`${context.policyWarnings} policy warnings`);
  if(reasons.length)return {action:'KEEP_PRIVATE',reasons};
  const delay=Math.max(10,Math.min(24*60,policy.autoPublishDelayMinutes??30));
  return {action:'SCHEDULE',publishAt:new Date(now.getTime()+delay*60_000).toISOString(),reasons:['All autonomous publication gates passed']};
}
