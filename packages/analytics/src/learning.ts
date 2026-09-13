export type MetricProvenance = 'ACTUAL' | 'ESTIMATED' | 'UNAVAILABLE';
export type AnalyticsMetric<T extends number | null = number | null> = { value: T; provenance: MetricProvenance; source?: string; observedAt?: string };
export type AnalyticsSnapshotV2 = { videoId: string; channelId: string; publishAgeDays: number; dataMode: 'REAL' | 'FIXTURE' | 'HYBRID'; impressions: AnalyticsMetric; ctr: AnalyticsMetric; views: AnalyticsMetric; watchTimeMinutes: AnalyticsMetric; averageViewDurationSeconds: AnalyticsMetric; averagePercentageViewed: AnalyticsMetric; subscribersGained: AnalyticsMetric; revenueUsd: AnalyticsMetric; rpmUsd: AnalyticsMetric; trafficSources: Record<string, number>; retention: Array<{ elapsedRatio: number; audienceWatchRatio: number }>; capturedAt: string };
export type CreativeDNA = { topic?: string; titleFormula?: string; thumbnailGrammar?: string; hookMechanic?: string; durationSeconds?: number; visualStyle?: string; referencePackId?: string; provider?: string };
export type LearningObservation = { videoId: string; dna: CreativeDNA; costUsd: number; analytics: AnalyticsSnapshotV2 };
export type LearningDecision = 'TEST' | 'KEEP' | 'ITERATE' | 'SCALE' | 'KILL';
export type LearningSignal = { dimension: keyof CreativeDNA; value: string; sampleSize: number; averageOutcome: number; confidence: number; decision: LearningDecision; evidenceIds: string[] };

const finite = (value: number | null | undefined, fallback = 0) => Number.isFinite(value) ? Number(value) : fallback;
const actual = (metric: AnalyticsMetric) => metric.provenance === 'ACTUAL' ? finite(metric.value) : null;
const outcome = (item: LearningObservation) => { const avp = actual(item.analytics.averagePercentageViewed) ?? 0; const ctr = actual(item.analytics.ctr) ?? 0; const roi = item.costUsd > 0 ? (actual(item.analytics.revenueUsd) ?? 0) / item.costUsd : 0; return Math.max(0, Math.min(100, avp * 0.55 + ctr * 3 + Math.min(25, roi * 5))); };

export function normalizeAnalyticsSnapshot(input: Omit<AnalyticsSnapshotV2, 'dataMode'> & { dataMode?: AnalyticsSnapshotV2['dataMode'] }): AnalyticsSnapshotV2 {
  const metric = (value: number | null | undefined, provenance: MetricProvenance, source?: string): AnalyticsMetric => ({ value: value == null || !Number.isFinite(value) ? null : value, provenance, source, observedAt: input.capturedAt });
  return { ...input, dataMode: input.dataMode ?? 'REAL', impressions: metric(input.impressions.value, input.impressions.provenance, input.impressions.source), ctr: metric(input.ctr.value, input.ctr.provenance, input.ctr.source), views: metric(input.views.value, input.views.provenance, input.views.source), watchTimeMinutes: metric(input.watchTimeMinutes.value, input.watchTimeMinutes.provenance, input.watchTimeMinutes.source), averageViewDurationSeconds: metric(input.averageViewDurationSeconds.value, input.averageViewDurationSeconds.provenance, input.averageViewDurationSeconds.source), averagePercentageViewed: metric(input.averagePercentageViewed.value, input.averagePercentageViewed.provenance, input.averagePercentageViewed.source), subscribersGained: metric(input.subscribersGained.value, input.subscribersGained.provenance, input.subscribersGained.source), revenueUsd: metric(input.revenueUsd.value, input.revenueUsd.provenance, input.revenueUsd.source), rpmUsd: metric(input.rpmUsd.value, input.rpmUsd.provenance, input.rpmUsd.source) };
}

export class LearningEngine {
  private readonly observations: LearningObservation[] = [];
  ingest(observation: LearningObservation): this { this.observations.push(observation); return this; }
  signals(): LearningSignal[] {
    const dimensions: Array<keyof CreativeDNA> = ['topic', 'titleFormula', 'thumbnailGrammar', 'hookMechanic', 'visualStyle', 'referencePackId', 'provider'];
    return dimensions.flatMap((dimension) => {
      const groups = new Map<string, LearningObservation[]>();
      for (const observation of this.observations) { const value = observation.dna[dimension]; if (value == null) continue; const key = String(value); groups.set(key, [...(groups.get(key) ?? []), observation]); }
      return [...groups.entries()].map(([value, items]) => { const scores = items.map(outcome); const averageOutcome = scores.reduce((sum, item) => sum + item, 0) / Math.max(1, scores.length); const confidence = Math.min(1, items.length / 8) * (items.every((item) => item.analytics.dataMode === 'REAL' && item.analytics.ctr.provenance === 'ACTUAL') ? 1 : 0.55); const decision: LearningDecision = confidence < 0.4 ? 'TEST' : averageOutcome >= 75 ? 'SCALE' : averageOutcome >= 55 ? 'KEEP' : averageOutcome >= 38 ? 'ITERATE' : 'KILL'; return { dimension, value, sampleSize: items.length, averageOutcome: Math.round(averageOutcome * 10) / 10, confidence: Math.round(confidence * 100) / 100, decision, evidenceIds: items.map((item) => item.videoId) }; });
    }).sort((a, b) => b.averageOutcome * b.confidence - a.averageOutcome * a.confidence);
  }
  compare(): { bestTopics: LearningSignal[]; bestTitleFormulas: LearningSignal[]; bestThumbnailGrammars: LearningSignal[]; bestHookMechanics: LearningSignal[]; bestVisualStyles: LearningSignal[]; bestProviders: LearningSignal[]; bestReferencePacks: LearningSignal[] } {
    const all = this.signals(); const by = (dimension: keyof CreativeDNA) => all.filter((signal) => signal.dimension === dimension).slice(0, 5); return { bestTopics: by('topic'), bestTitleFormulas: by('titleFormula'), bestThumbnailGrammars: by('thumbnailGrammar'), bestHookMechanics: by('hookMechanic'), bestVisualStyles: by('visualStyle'), bestProviders: by('provider'), bestReferencePacks: by('referencePackId') };
  }
}
