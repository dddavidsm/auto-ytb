export type QualityDimension =
  | 'CHARACTER_QUALITY'
  | 'CHARACTER_CONSISTENCY'
  | 'FACIAL_PERFORMANCE'
  | 'BODY_PERFORMANCE'
  | 'LIP_SYNC_QUALITY'
  | 'VOICE_PERFORMANCE'
  | 'SCENE_DESIGN'
  | 'ENVIRONMENT_QUALITY'
  | 'LIGHTING'
  | 'MATERIALS'
  | 'ANIMATION_QUALITY'
  | 'CAMERA'
  | 'STAGING'
  | 'EDITING'
  | 'PACING'
  | 'STORY'
  | 'EMOTION'
  | 'AUDIO'
  | 'MUSIC'
  | 'SFX'
  | 'FOLEY'
  | 'CAPTIONS'
  | 'THUMBNAIL'
  | 'REFERENCE_COMPETITIVENESS';

export type QualityValue = number | 'NOT_EVALUATED';
export type HumanReview = {
  runId: string;
  score: number;
  issues: string[];
  liked: string[];
  disliked: string[];
  timestamp: string;
};

const DIMENSIONS: QualityDimension[] = [
  'CHARACTER_QUALITY', 'CHARACTER_CONSISTENCY', 'FACIAL_PERFORMANCE', 'BODY_PERFORMANCE',
  'LIP_SYNC_QUALITY', 'VOICE_PERFORMANCE', 'SCENE_DESIGN', 'ENVIRONMENT_QUALITY',
  'LIGHTING', 'MATERIALS', 'ANIMATION_QUALITY', 'CAMERA', 'STAGING', 'EDITING', 'PACING',
  'STORY', 'EMOTION', 'AUDIO', 'MUSIC', 'SFX', 'FOLEY', 'CAPTIONS', 'THUMBNAIL', 'REFERENCE_COMPETITIVENESS',
];

function finite(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(10, number)) : null;
}

export function normalizeQualityDimensions(input: Partial<Record<QualityDimension, QualityValue>> = {}) {
  return Object.fromEntries(DIMENSIONS.map((dimension) => {
    const value = input[dimension];
    return [dimension, value === 'NOT_EVALUATED' ? value : finite(value) ?? 'NOT_EVALUATED'];
  })) as Record<QualityDimension, QualityValue>;
}

/**
 * Conservative, reference-calibrated score. It never returns 10 and never
 * treats an unevaluated temporal dimension as a pass.
 */
export function referenceCalibratedQualityScore(input: {
  dimensions: Partial<Record<QualityDimension, QualityValue>>;
  referenceFloor?: number;
  humanReviews?: HumanReview[];
}) {
  const dimensions = normalizeQualityDimensions(input.dimensions);
  const evaluated = Object.values(dimensions).filter((value): value is number => typeof value === 'number');
  const automatedMean = evaluated.length ? evaluated.reduce((sum, value) => sum + value, 0) / evaluated.length : 0;
  const referenceFloor = Math.max(0, Math.min(10, Number(input.referenceFloor ?? 7)));
  const humanReviews = (input.humanReviews ?? []).filter((review) => Number.isFinite(review.score));
  const humanMean = humanReviews.length ? humanReviews.reduce((sum, review) => sum + Math.max(0, Math.min(10, review.score)), 0) / humanReviews.length : null;
  const calibrationPenalty = automatedMean >= referenceFloor && humanMean !== null && humanMean < automatedMean - 1 ? Math.min(2.5, automatedMean - humanMean) : 0;
  const score = Math.min(9, Math.max(0, Number((humanMean === null ? automatedMean : (automatedMean * 0.35 + humanMean * 0.65) - calibrationPenalty).toFixed(2))));
  return {
    score,
    maxAutomatedScore: 9,
    status: humanMean === null ? 'PENDING_HUMAN_REVIEW' : score >= referenceFloor ? 'CALIBRATED' : 'BELOW_REFERENCE',
    automatedMean: Number(automatedMean.toFixed(2)),
    humanMean: humanMean === null ? null : Number(humanMean.toFixed(2)),
    calibrationPenalty: Number(calibrationPenalty.toFixed(2)),
    referenceFloor,
    evaluatedDimensions: evaluated.length,
    unevaluatedDimensions: DIMENSIONS.filter((dimension) => dimensions[dimension] === 'NOT_EVALUATED'),
    dimensions,
  };
}

export function buildProfessionalSeriesQualityGate(input: {
  dimensions: Partial<Record<QualityDimension, QualityValue>>;
  humanApproved?: boolean;
  targetAudience?: string;
  kidsCompliance?: 'PASS' | 'FAIL' | 'NOT_EVALUATED';
  requiresKidsGate?: boolean;
  referenceFloor?: number;
}) {
  const dimensions = normalizeQualityDimensions(input.dimensions);
  const blockers: string[] = [];
  const required: QualityDimension[] = [
    'CHARACTER_QUALITY', 'CHARACTER_CONSISTENCY', 'FACIAL_PERFORMANCE', 'BODY_PERFORMANCE',
    'LIP_SYNC_QUALITY', 'SCENE_DESIGN', 'ENVIRONMENT_QUALITY', 'ANIMATION_QUALITY', 'CAMERA',
    'STAGING', 'AUDIO', 'STORY', 'EMOTION', 'REFERENCE_COMPETITIVENESS',
  ];
  for (const dimension of required) {
    const value = dimensions[dimension];
    if (value === 'NOT_EVALUATED') blockers.push(`${dimension}: NOT_EVALUATED`);
    else if (Number(value) < 7) blockers.push(`${dimension}: below professional floor`);
  }
  if (input.requiresKidsGate && input.kidsCompliance !== 'PASS') blockers.push('KIDS_QUALITY: not passed');
  if (!input.humanApproved) blockers.push('HUMAN_REVIEW: approval required; automated judges cannot approve a professional series proof');
  const score = referenceCalibratedQualityScore({ dimensions, referenceFloor: input.referenceFloor });
  return {
    status: blockers.length ? 'READY_FOR_HUMAN_REVIEW' : 'SEASON_QUALITY_READY',
    blockers,
    score,
    targetAudience: input.targetAudience ?? 'UNSPECIFIED',
    humanApproved: Boolean(input.humanApproved),
  };
}

export function recordHumanReview(input: Omit<HumanReview, 'timestamp'> & { timestamp?: string }): HumanReview {
  return {
    ...input,
    score: Math.max(0, Math.min(10, Number(input.score))),
    issues: [...input.issues].map(String),
    liked: [...input.liked].map(String),
    disliked: [...input.disliked].map(String),
    timestamp: input.timestamp ?? new Date().toISOString(),
  };
}
