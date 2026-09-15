export type DiscoveryKind = 'DISCOVERY_REFERENCE' | 'PUBLISHABLE_ASSET';
export type RightsState = 'CLEARED' | 'VERIFY' | 'BLOCKED' | 'UNKNOWN';
export type SpecificityClass = 'EXACT_ENTITY' | 'EXACT_EVENT' | 'EXACT_LOCATION' | 'STRONG_CONTEXT' | 'WEAK_CONTEXT' | 'GENERIC' | 'IRRELEVANT';

export type ContentEntity = { id: string; canonicalName: string; type: string; aliases?: string[]; brand?: string; model?: string; year?: string; sourceRefs?: string[] };
export type DiscoveryReference = { id: string; kind: 'DISCOVERY_REFERENCE'; url: string; title: string; provider: string; rights: RightsState; entities: string[]; discoveredAt: string; notes?: string };
export type PublishableAsset = { id: string; kind: 'PUBLISHABLE_ASSET'; uri: string; provider: string; sourceUrl: string; title: string; rights: RightsState; license: string; creator?: string; attribution?: string; entities: string[]; technical?: Record<string, unknown> };
export type MediaSegment = PublishableAsset & { segmentId: string; startSec: number; endSec: number; description: string; actions?: string[]; locations?: string[]; ocr?: string[]; transcript?: string; shotType?: string; qualityScore: number; motionScore?: number; semanticTerms?: string[] };
export type RightsLedgerEntry = { assetId: string; sourceUrl: string; provider: string; license: string; rights: RightsState; commercialUse?: boolean; attribution?: string; checkedAt: string; risk: 'LOW' | 'MEDIUM' | 'HIGH' };
export type NarrationBeat = { beatId: string; text: string; startSec: number; endSec: number; entityIds: string[]; requiredVisual?: string; critical?: boolean };
export type CoverageRow = { beatId: string; requiredEntities: string[]; exactAssets: string[]; strongContextAssets: string[]; fallbackAssets: string[]; rightsConfidence: number; coverageConfidence: number; specificity: SpecificityClass; decision: 'USE' | 'RESEARCH' | 'REWRITE' | 'GENERATE' };
export type MediaAvailabilityReport = { opportunityId: string; generatedAt: string; rows: Array<{ beatId: string; status: 'EXCELLENT' | 'GOOD' | 'MARGINAL' | 'POOR'; exactCount: number; contextualCount: number; rationale: string }>; overall: 'EXCELLENT' | 'GOOD' | 'MARGINAL' | 'POOR' };
export type ScriptMediaCoverageMatrix = { rows: CoverageRow[]; exactVisualCoverageRatio: number; genericBrollRatio: number; hardFailures: string[] };
export type MediaResourcePack = { packId: string; entities: ContentEntity[]; discovery: DiscoveryReference[]; assets: PublishableAsset[]; segments: MediaSegment[]; rights: RightsLedgerEntry[]; coverage: ScriptMediaCoverageMatrix };

const tokens = (value: string) => new Set(value.toLowerCase().split(/[^a-z0-9áéíóúñ]+/i).filter((x) => x.length > 2));
const overlap = (a: Set<string>, b: Set<string>) => [...a].filter((x) => b.has(x)).length;

export class MediaIntelligenceEngine {
  readonly entities = new Map<string, ContentEntity>();
  readonly discovery = new Map<string, DiscoveryReference>();
  readonly assets = new Map<string, PublishableAsset>();
  readonly segments = new Map<string, MediaSegment>();
  readonly rights = new Map<string, RightsLedgerEntry>();

  registerEntity(entity: ContentEntity): ContentEntity { this.entities.set(entity.id, entity); return entity; }
  registerDiscovery(reference: DiscoveryReference): DiscoveryReference { this.discovery.set(reference.id, reference); return reference; }
  registerAsset(asset: PublishableAsset): PublishableAsset { this.assets.set(asset.id, asset); this.rights.set(asset.id, { assetId: asset.id, sourceUrl: asset.sourceUrl, provider: asset.provider, license: asset.license, rights: asset.rights, commercialUse: asset.rights === 'CLEARED', attribution: asset.attribution, checkedAt: new Date().toISOString(), risk: asset.rights === 'CLEARED' ? 'LOW' : asset.rights === 'VERIFY' ? 'MEDIUM' : 'HIGH' }); return asset; }
  registerSegment(segment: MediaSegment): MediaSegment { this.registerAsset(segment); this.segments.set(segment.segmentId, segment); return segment; }

  classify(segment: MediaSegment, beat: NarrationBeat): SpecificityClass {
    const names = beat.entityIds.map((id) => this.entities.get(id)?.canonicalName ?? id);
    const text = `${segment.title} ${segment.description} ${(segment.entities ?? []).join(' ')} ${(segment.semanticTerms ?? []).join(' ')}`;
    const textTokens = tokens(text);
    const entityHits = names.filter((name) => overlap(tokens(name), textTokens) > 0).length;
    if (entityHits > 0 && beat.requiredVisual && overlap(tokens(beat.requiredVisual), textTokens) > 0) return 'EXACT_ENTITY';
    if (entityHits > 0) return 'EXACT_ENTITY';
    if ((segment.locations ?? []).some((location) => beat.text.toLowerCase().includes(location.toLowerCase()))) return 'EXACT_LOCATION';
    const beatTerms = tokens(`${beat.text} ${beat.requiredVisual ?? ''}`);
    const score = overlap(beatTerms, textTokens) / Math.max(1, beatTerms.size);
    if (score >= 0.35) return 'STRONG_CONTEXT';
    if (score >= 0.12) return 'WEAK_CONTEXT';
    return 'GENERIC';
  }

  rank(beat: NarrationBeat, options: { allowVerify?: boolean } = {}): Array<MediaSegment & { specificity: SpecificityClass; score: number }> {
    return [...this.segments.values()].map((segment) => {
      const specificity = this.classify(segment, beat);
      const rightsPenalty = segment.rights === 'CLEARED' ? 0 : segment.rights === 'VERIFY' && options.allowVerify ? 12 : 40;
      const score = ({ EXACT_ENTITY: 100, EXACT_EVENT: 98, EXACT_LOCATION: 94, STRONG_CONTEXT: 72, WEAK_CONTEXT: 38, GENERIC: 8, IRRELEVANT: -20 }[specificity]) + segment.qualityScore + (segment.motionScore ?? 0) * 0.2 - rightsPenalty;
      return { ...segment, specificity, score };
    }).sort((a, b) => b.score - a.score);
  }

  buildAvailability(opportunityId: string, beats: NarrationBeat[]): MediaAvailabilityReport {
    const rows = beats.map((beat) => { const ranked = this.rank(beat, { allowVerify: true }); const exact = ranked.filter((x) => x.specificity === 'EXACT_ENTITY' || x.specificity === 'EXACT_EVENT' || x.specificity === 'EXACT_LOCATION'); const context = ranked.filter((x) => x.specificity === 'STRONG_CONTEXT'); const status: MediaAvailabilityReport['rows'][number]['status'] = exact.length >= 2 ? 'EXCELLENT' : exact.length ? 'GOOD' : context.length >= 2 ? 'MARGINAL' : 'POOR'; return { beatId: beat.beatId, status, exactCount: exact.length, contextualCount: context.length, rationale: status === 'POOR' ? 'No specific or strong contextual segment was indexed.' : `${exact.length} exact and ${context.length} strong contextual segments indexed.` }; });
    const overall = rows.some((x) => x.status === 'POOR') ? 'POOR' : rows.some((x) => x.status === 'MARGINAL') ? 'MARGINAL' : rows.some((x) => x.status === 'GOOD') ? 'GOOD' : 'EXCELLENT';
    return { opportunityId, generatedAt: new Date().toISOString(), rows, overall };
  }

  buildCoverage(beats: NarrationBeat[]): ScriptMediaCoverageMatrix {
    const rows = beats.map((beat) => { const ranked = this.rank(beat, { allowVerify: true }); const exact = ranked.filter((x) => ['EXACT_ENTITY', 'EXACT_EVENT', 'EXACT_LOCATION'].includes(x.specificity)).slice(0, 8); const strong = ranked.filter((x) => x.specificity === 'STRONG_CONTEXT').slice(0, 8); const fallback = ranked.filter((x) => ['WEAK_CONTEXT', 'GENERIC'].includes(x.specificity)).slice(0, 8); const rights = exact.filter((x) => x.rights === 'CLEARED').length / Math.max(1, exact.length); const coverageConfidence = Math.min(1, (exact.length * 0.35 + strong.length * 0.12)); const specificity = exact.length ? exact[0].specificity : strong.length ? 'STRONG_CONTEXT' : 'GENERIC'; const decision: CoverageRow['decision'] = !exact.length && !strong.length ? 'REWRITE' : exact.length ? 'USE' : 'RESEARCH'; return { beatId: beat.beatId, requiredEntities: beat.entityIds, exactAssets: exact.map((x) => x.segmentId), strongContextAssets: strong.map((x) => x.segmentId), fallbackAssets: fallback.map((x) => x.segmentId), rightsConfidence: Number(rights.toFixed(3)), coverageConfidence: Number(coverageConfidence.toFixed(3)), specificity, decision }; });
    const total = rows.length || 1; const exactVisualCoverageRatio = rows.filter((x) => x.exactAssets.length > 0).length / total; const genericBrollRatio = rows.filter((x) => x.exactAssets.length === 0 && x.strongContextAssets.length === 0 && x.fallbackAssets.length > 0).length / total; const hardFailures = rows.filter((x) => x.decision === 'REWRITE' || x.rightsConfidence === 0).map((x) => x.beatId); return { rows, exactVisualCoverageRatio: Number(exactVisualCoverageRatio.toFixed(3)), genericBrollRatio: Number(genericBrollRatio.toFixed(3)), hardFailures };
  }

  createResourcePack(packId: string, beats: NarrationBeat[]): MediaResourcePack { return { packId, entities: [...this.entities.values()], discovery: [...this.discovery.values()], assets: [...this.assets.values()], segments: [...this.segments.values()], rights: [...this.rights.values()], coverage: this.buildCoverage(beats) }; }
}
