export type VideoDNA = {
  schema: 'VIDEO_DNA_V1';
  sourceId: string;
  metadata: { title?: string; durationSec?: number; format?: string; platform?: string };
  hook: { firstValueSec?: number; centralClaimSec?: number; type?: string; promiseAlignment?: number };
  narration: { language?: string; wordsPerMinute?: number; dialogueRatio?: number; sentenceCount?: number };
  editing: { shotCount?: number; medianShotDurationSec?: number; visualChangeRate?: number; transitionStyle?: string };
  visualRhythm: { visualTypes?: string[]; exactEntityCoverage?: number; genericBrollRatio?: number };
  audio?: { musicPresent?: boolean; sfxPresent?: boolean; voiceEnergy?: number };
  payoff?: { revealSec?: number; ctaSec?: number; payoffType?: string };
  provenance: { method: string; collectedAt: string; evidenceUrls?: string[] };
};

export type VideoBlueprint = {
  schema: 'VIDEO_BLUEPRINT_V1';
  briefId: string;
  viewerPromise: string;
  hook: { candidates: string[]; selected?: string; firstFrameIntent: string };
  informationArc: Array<{ beatId: string; claim?: string; tension?: string; payoff?: string }>;
  entityIds: string[];
  mediaIntents: Array<{ beatId: string; query: string; specificityRequired: string }>;
  attentionPlan: { predictedCurve: Array<{ sec: number; score: number; reason: string }>; openLoops: string[] };
  captionPlan: { style: string; emphasis: string[] };
  musicCurve: Array<{ sec: number; energy: number }>;
  packagingHypothesis: { title: string; thumbnailPromise: string };
};

export type ReferenceComparisonReport = {
  references: Array<{ sourceId: string; role: 'OUTLIER' | 'CATEGORY_LEADER' | 'BASELINE' | 'OWN_WINNER'; dna: VideoDNA }>;
  differentiators: string[];
  commonConventions: string[];
  limitations: string[];
};

export function compareVideoDNA(references: ReferenceComparisonReport['references']): ReferenceComparisonReport {
  const outliers = references.filter((x) => x.role === 'OUTLIER');
  const baselines = references.filter((x) => x.role === 'BASELINE');
  const differentiators: string[] = [];
  if (outliers.some((x) => (x.dna.hook.firstValueSec ?? 9) < 3) && baselines.every((x) => (x.dna.hook.firstValueSec ?? 9) >= 3)) differentiators.push('outliers deliver first value before second three');
  if (outliers.some((x) => (x.dna.editing.visualChangeRate ?? 0) > (baselines[0]?.dna.editing.visualChangeRate ?? 0))) differentiators.push('outliers change visual evidence more frequently');
  if (outliers.some((x) => (x.dna.visualRhythm.exactEntityCoverage ?? 0) > (baselines[0]?.dna.visualRhythm.exactEntityCoverage ?? 0))) differentiators.push('outliers use more entity-specific evidence');
  return { references, differentiators, commonConventions: ['clear title promise', 'early topic identification', 'timecoded visual changes'], limitations: ['public competitor retention is not assumed or fabricated'] };
}
