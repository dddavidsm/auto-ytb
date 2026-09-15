export type HumanGroundTruthFeedback = {
  runId: string;
  humanOverallScore: number;
  issues: string[];
  liked: string[];
  disliked: string[];
  timestamp: string;
  source: 'USER' | 'REVIEWER';
  automatedScoreAtReview?: number | null;
  calibrationError?: number | null;
};

export function createHumanGroundTruthFeedback(input: Omit<HumanGroundTruthFeedback, 'timestamp' | 'calibrationError'> & { timestamp?: string }): HumanGroundTruthFeedback {
  const humanOverallScore = Math.max(0, Math.min(10, Number(input.humanOverallScore)));
  const automatedScoreAtReview = input.automatedScoreAtReview == null ? null : Math.max(0, Math.min(10, Number(input.automatedScoreAtReview)));
  return {
    ...input,
    humanOverallScore,
    automatedScoreAtReview,
    calibrationError: automatedScoreAtReview == null ? null : Number((automatedScoreAtReview - humanOverallScore).toFixed(2)),
    timestamp: input.timestamp ?? new Date().toISOString(),
  };
}

export function calibrateAutomatedScore(input: { humanScore: number; automatedScore: number }) {
  const humanScore = Math.max(0, Math.min(10, Number(input.humanScore)));
  const automatedScore = Math.max(0, Math.min(10, Number(input.automatedScore)));
  return {
    humanScore,
    automatedScore,
    calibrationError: Number((automatedScore - humanScore).toFixed(2)),
    authoritativeScore: humanScore,
    humanOverridesAutomated: true as const,
  };
}
