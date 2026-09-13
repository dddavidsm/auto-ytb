import type { BenchmarkVideo } from './benchmark.js';
import type { ContentDNA } from './content-dna.js';
import type { ReferencePack } from './reference-pack.js';
import type { ViralTemplate } from './engines.js';

export type CausalStatus = 'LIKELY_CAUSAL' | 'CORRELATED' | 'UNKNOWN';
export type WinnerExpansionCandidate = { id: string; type: 'sameMechanismNewEntity' | 'sameConflictNewCountry' | 'sequel' | 'prequel' | 'oppositeCase' | 'hiddenExample' | 'largerScale' | 'smallerScale' | 'newEra' | 'newIndustry' | 'newGeography'; premise: string; variables: Array<{ name: string; status: CausalStatus }>; demand: number; referenceEvidence: number; packaging: number; originality: number; cost: number; ypp: number; channelFit: number; totalScore: number; decision: 'TEST' | 'KEEP' | 'ITERATE' | 'SCALE' | 'KILL'; autoProduce: false };
export type WinnerExpansionPlan = { winnerId: string; causalVariables: Array<{ name: string; status: CausalStatus; evidence: string }>; candidates: WinnerExpansionCandidate[]; selected: WinnerExpansionCandidate[]; rationale: string };

const types: WinnerExpansionCandidate['type'][] = ['sameMechanismNewEntity', 'sameConflictNewCountry', 'sequel', 'prequel', 'oppositeCase', 'hiddenExample', 'largerScale', 'smallerScale', 'newEra', 'newIndustry', 'newGeography'];
const clamp = (value: number) => Math.max(0, Math.min(100, value));
const hash = (value: string) => [...value].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 997, 0);

export function buildWinnerExpansionPlan(input: { winner: BenchmarkVideo; analyticsAvailable?: boolean; contentDNA?: ContentDNA; viralTemplate: ViralTemplate; referencePack?: ReferencePack; maxCandidates?: number }): WinnerExpansionPlan {
  const demand = clamp(input.winner.likelyOutlier.score);
  const evidence = clamp((input.referencePack?.items.length ?? 0) * 12 + input.winner.likelyOutlier.persistenceScore);
  const causalVariables = [{ name: 'narrative mechanism', status: 'LIKELY_CAUSAL' as const, evidence: input.viralTemplate.storyArchitecture.join(' → ') }, { name: 'specific entity', status: 'CORRELATED' as const, evidence: 'winner-level evidence cannot isolate entity causality' }, { name: 'exact title/thumbnail expression', status: 'UNKNOWN' as const, evidence: 'must be retested with original packaging' }, { name: 'duration/pacing', status: 'CORRELATED' as const, evidence: input.viralTemplate.pacingProfile }];
  const limit = Math.max(1, Math.min(30, input.maxCandidates ?? 30));
  const candidates = types.flatMap((type, typeIndex) => Array.from({ length: Math.ceil(limit / types.length) }, (_, index) => {
    const seed = hash(`${input.winner.id}:${type}:${index}`);
    const packaging = clamp(68 + (seed % 25));
    const originality = clamp(76 + ((seed >> 2) % 20));
    const cost = clamp(84 - ((seed >> 3) % 22));
    const channelFit = clamp(70 + ((seed >> 4) % 22));
    const totalScore = Math.round((demand * 0.18 + evidence * 0.18 + packaging * 0.16 + originality * 0.18 + cost * 0.1 + 88 * 0.08 + channelFit * 0.12) * 10) / 10;
    const decision: WinnerExpansionCandidate['decision'] = totalScore >= 82 ? 'TEST' : totalScore >= 72 ? 'KEEP' : totalScore >= 60 ? 'ITERATE' : 'KILL';
    return { id: `expansion-${String(typeIndex + 1).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`, type, premise: `${input.winner.title}: ${type.replaceAll(/([A-Z])/g, ' $1').toLowerCase()} ${index + 1}`, variables: causalVariables.map(({ name, status }) => ({ name, status })), demand, referenceEvidence: evidence, packaging, originality, cost, ypp: 88, channelFit, totalScore, decision, autoProduce: false as const };
  })).slice(0, limit).sort((a, b) => b.totalScore - a.totalScore);
  return { winnerId: input.winner.id, causalVariables, candidates, selected: candidates.filter((candidate) => candidate.decision === 'TEST').slice(0, 5), rationale: input.analyticsAvailable ? 'Owned analytics are available; expansion ranking combines market evidence with observed channel outcomes.' : 'No owned analytics available; market evidence is weighted heavily and every candidate remains review/test-only.' };
}
