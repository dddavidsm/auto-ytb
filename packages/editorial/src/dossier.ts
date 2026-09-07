import type { SearchProvider, TextModel } from '@auto-ytb/providers';
import { rankAngles, type AngleInput } from './angles.js';
import { detectClaimConflicts } from './contradictions.js';
import { assessSource, researchConfidence } from './source-quality.js';
import type { Claim, ResearchDossier } from './types.js';

export async function buildResearchDossier(input: {
  topic: string;
  search: SearchProvider;
  model: TextModel;
  recencyDays?: number;
  now?: Date;
}): Promise<ResearchDossier> {
  const now = input.now ?? new Date();
  const queries = [input.topic, `${input.topic} analysis`, `${input.topic} official`, `${input.topic} criticism`];
  const resultSets = await Promise.all(queries.map((query) => input.search.search(query, { limit: 8, recencyDays: input.recencyDays ?? 180 })));
  const unique = new Map(resultSets.flat().map((result) => [result.url, result]));
  const sources = [...unique.values()].map((source) => assessSource(source, now)).sort((a, b) => b.qualityScore - a.qualityScore).slice(0, 24);

  const evidenceText = sources.map((source) => `[${source.id}] ${source.title}\n${source.snippet}\n${source.url}`).join('\n\n');
  const extracted = await input.model.generateJson<{
    executiveSummary: string;
    claims: Claim[];
    timeline: Array<{ date: string; event: string; sourceIds: string[] }>;
    angles: AngleInput[];
  }>({
    system: 'You are a rigorous documentary researcher. Never invent sources. Every factual claim must cite source IDs from the supplied evidence. Mark uncertainty and disputes explicitly.',
    prompt: `Topic: ${input.topic}\n\nEvidence:\n${evidenceText}\n\nProduce a concise research dossier with claims, timeline and 4-8 materially different story angles.`,
    schemaName: 'research_dossier',
    temperature: 0.2,
  });

  const validSourceIds = new Set(sources.map((source) => source.id));
  const claims = extracted.value.claims.map((claim) => ({
    ...claim,
    sourceIds: claim.sourceIds.filter((id) => validSourceIds.has(id)),
    confidence: Math.max(0, Math.min(100, claim.confidence)),
  }));
  const contradictions = detectClaimConflicts(claims);
  const angles = rankAngles(extracted.value.angles);
  const confidence = researchConfidence(sources, claims.map((claim) => claim.confidence));
  const blockingIssues: string[] = [];
  if (sources.length < 4) blockingIssues.push('Insufficient source coverage');
  if (!sources.some((source) => source.primaryEvidence)) blockingIssues.push('No primary/official source');
  if (claims.some((claim) => claim.importance === 'critical' && claim.sourceIds.length < 1)) blockingIssues.push('Critical claim without a valid source');
  if (contradictions.some((conflict) => conflict.severity === 'high')) blockingIssues.push('High-severity factual dispute unresolved');

  return {
    topic: input.topic,
    generatedAt: now.toISOString(),
    executiveSummary: extracted.value.executiveSummary,
    sources,
    claims,
    contradictions,
    timeline: extracted.value.timeline,
    angles,
    recommendedAngleId: blockingIssues.length === 0 ? angles[0]?.id ?? null : null,
    researchConfidence: confidence,
    blockingIssues,
  };
}
