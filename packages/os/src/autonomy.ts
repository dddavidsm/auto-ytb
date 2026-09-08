export type AutonomousPublishingPolicy = {
  autonomyMode: 'REVIEW_REQUIRED' | 'FULL_AUTONOMOUS';
  allowAutomaticPublicScheduling: boolean;
  minimumQaScoreForAutoPublish: number;
  minimumResearchConfidenceForAutoPublish: number;
  blockOnUnresolvedRights: boolean;
  blockOnPolicyWarning: boolean;
  autoPublishDelayMinutes?: number;
};

export type AutonomousPublishContext = {
  qaScore?: number;
  researchConfidence?: number;
  qaBlockers?: string[];
  qaWarnings?: string[];
  unresolvedRights?: number;
  policyWarnings?: number;
  youtubeVideoId?: string | null;
};

export type AutonomousPublishDecision = {
  action: 'SCHEDULE' | 'KEEP_PRIVATE';
  publishAt?: string;
  reasons: string[];
};

export function decideAutonomousPublication(policy:AutonomousPublishingPolicy,context:AutonomousPublishContext,now=new Date()):AutonomousPublishDecision{
  const reasons:string[]=[];
  if(policy.autonomyMode!=='FULL_AUTONOMOUS')reasons.push('Channel policy requires human review');
  if(!policy.allowAutomaticPublicScheduling)reasons.push('Automatic public scheduling disabled');
  if(!context.youtubeVideoId)reasons.push('No uploaded YouTube video id');
  if((context.qaBlockers?.length??0)>0)reasons.push(`QA blockers: ${context.qaBlockers?.join(', ')}`);
  if((context.qaScore??0)<policy.minimumQaScoreForAutoPublish)reasons.push(`QA ${context.qaScore??0} below ${policy.minimumQaScoreForAutoPublish}`);
  if((context.researchConfidence??0)<policy.minimumResearchConfidenceForAutoPublish)reasons.push(`Research confidence ${context.researchConfidence??0} below ${policy.minimumResearchConfidenceForAutoPublish}`);
  if(policy.blockOnUnresolvedRights&&(context.unresolvedRights??0)>0)reasons.push(`${context.unresolvedRights} unresolved rights items`);
  if(policy.blockOnPolicyWarning&&(context.policyWarnings??0)>0)reasons.push(`${context.policyWarnings} policy warnings`);
  if(reasons.length)return {action:'KEEP_PRIVATE',reasons};
  const delay=Math.max(10,Math.min(24*60,policy.autoPublishDelayMinutes??30));
  return {action:'SCHEDULE',publishAt:new Date(now.getTime()+delay*60_000).toISOString(),reasons:['All autonomous publication gates passed']};
}
