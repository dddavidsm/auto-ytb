/** Domain contracts for the one canonical sourced-production path. */
export type ProductionInputMode = 'USER_PROMPT' | 'USER_SCRIPT' | 'USER_VOICEOVER' | 'RADAR_OPPORTUNITY' | 'BACKLOG_ITEM' | 'SERIES_EPISODE';
export type VisualCriticality = 'MUST_SHOW_EXACT' | 'SHOULD_SHOW_EXACT' | 'STRONG_CONTEXT_OK' | 'EDITORIAL_CONTEXT_OK' | 'OPTIONAL_VISUAL';
export type MediaStrategy = 'REAL_EXACT' | 'REAL_MULTI_SHOT' | 'REAL_CONTEXTUAL' | 'DOCUMENT' | 'IMAGE' | 'REFERENCE_GROUNDED_SYNTHETIC' | 'GENERIC_SYNTHETIC' | 'GRAPHIC' | 'SCRIPT_REWRITE' | 'REMOVE_LINE' | 'REJECT_TOPIC';

export type ProductionBriefV2 = {
  version: 'PRODUCTION_BRIEF_V2';
  runId: string;
  inputMode: ProductionInputMode;
  topic: string;
  angle: string;
  viewerPromise: string;
  targetAudience: string;
  language: string;
  platform: string;
  format: '16:9' | '9:16' | '1:1';
  targetDurationRange: { minSeconds: number; maxSeconds: number };
  channelId?: string;
  seriesId?: string;
  qualityMode: 'DRAFT' | 'STANDARD' | 'MAX_QUALITY';
  budget?: { maxUsd?: number; approvedProviders?: string[] };
  researchRequirements: string[];
  sourcePreferences: string[];
  sourceRestrictions: string[];
  visualStyle: 'SOURCED_AUTOPRODUCTION' | 'HYBRID_EDITORIAL' | 'NEWS_EXPLAINER' | 'DOCUMENTARY' | 'VIDEO_ESSAY' | 'TOP_LIST';
  captionStyle: 'KARAOKE_CLEAN' | 'KARAOKE_BOLD' | 'DOCUMENTARY_SUBTLE' | 'NEWS_CLEAN' | 'NO_CAPTIONS';
  voiceProfile?: string;
  packagingIntent?: string;
  userConstraints: string[];
};

export type VisualGapReportRow = {
  unitId: string;
  narration: string;
  visualCriticality: VisualCriticality;
  realExactCount: number;
  realStrongCount: number;
  realContextualCount: number;
  missingConcept?: string;
  selectedStrategy: MediaStrategy;
  confidence: 'STRONG' | 'INFERRED' | 'UNKNOWN';
  reason: string;
};

export function validateProductionBriefV2(brief: ProductionBriefV2): string[] {
  const errors: string[] = [];
  if (brief.version !== 'PRODUCTION_BRIEF_V2') errors.push('UNSUPPORTED_BRIEF_VERSION');
  if (!brief.runId || !brief.topic || !brief.viewerPromise) errors.push('MISSING_REQUIRED_BRIEF_IDENTITY');
  if (!brief.targetDurationRange || brief.targetDurationRange.minSeconds <= 0 || brief.targetDurationRange.maxSeconds < brief.targetDurationRange.minSeconds) errors.push('INVALID_DURATION_RANGE');
  if (brief.visualStyle === 'SOURCED_AUTOPRODUCTION' && !brief.sourcePreferences.length) errors.push('SOURCED_MODE_REQUIRES_SOURCE_PREFERENCES');
  return errors;
}

/**
 * A named critical entity must have a real exact/strong candidate. Context is
 * intentionally accepted for non-critical connective narration.
 */
export function evaluateVisualGapRows(rows: VisualGapReportRow[]) {
  const criticalFailures = rows.filter((row) => row.visualCriticality === 'MUST_SHOW_EXACT' && row.realExactCount + row.realStrongCount === 0);
  const graphicFallbackViolations = rows.filter((row) => row.selectedStrategy === 'GRAPHIC' && row.realExactCount + row.realStrongCount + row.realContextualCount === 0 && row.visualCriticality !== 'OPTIONAL_VISUAL');
  return {
    status: criticalFailures.length || graphicFallbackViolations.length ? 'BLOCKED' as const : 'READY' as const,
    criticalFailures: criticalFailures.map((row) => row.unitId),
    graphicFallbackViolations: graphicFallbackViolations.map((row) => row.unitId),
  };
}
