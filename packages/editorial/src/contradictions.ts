import type { Claim } from './types.js';

export function detectClaimConflicts(claims: Claim[]): Array<{ claimIds: string[]; description: string; severity: 'low' | 'medium' | 'high' }> {
  const disputed = claims.filter((claim) => claim.disputed);
  return disputed.map((claim) => ({
    claimIds: [claim.id],
    description: claim.notes ?? `Claim marked as disputed: ${claim.text}`,
    severity: claim.importance === 'critical' ? 'high' : claim.importance === 'supporting' ? 'medium' : 'low',
  }));
}
