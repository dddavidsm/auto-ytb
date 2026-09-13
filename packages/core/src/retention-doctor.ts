import type { ProductionTimeline } from './timeline.js';

export type RetentionProblem = 'PACKAGING_EXPECTATION_MISMATCH' | 'WEAK_HOOK' | 'SLOW_SETUP' | 'CONFUSING_SECTION' | 'LOW_INFORMATION_DENSITY' | 'VISUAL_FATIGUE' | 'REPETITION' | 'WEAK_PAYOFF' | 'BAD_TRANSITION' | 'EARLY_CTA' | 'TOPIC_EXHAUSTION';
export type AnalyticsRetentionSnapshot = { videoId: string; dataMode: 'REAL' | 'FIXTURE'; estimated: boolean; publishAgeDays: number; retention: Array<{ elapsedRatio: number; audienceWatchRatio: number }> };
export type RetentionDiagnosisV2 = { problem: RetentionProblem; timestamp: { startSeconds: number; endSeconds: number }; evidence: string[]; likelyCause: string; confidence: number; priority: 'HIGH' | 'MEDIUM' | 'LOW'; recommendedChange: string; testHypothesis: string; sceneId?: string; narrationSegmentId?: string; openLoopState: 'OPEN' | 'RESOLVED' | 'UNKNOWN'; audioState: string };

const intersect = (aStart: number, aEnd: number, bStart: number, bEnd: number) => Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));

export function diagnoseRetentionV2(input: { analytics: AnalyticsRetentionSnapshot; timeline: ProductionTimeline }): RetentionDiagnosisV2 {
  const points = [...input.analytics.retention].sort((a, b) => a.elapsedRatio - b.elapsedRatio);
  let worst = { index: 0, delta: 0 };
  for (let index = 1; index < points.length; index += 1) { const delta = points[index]!.audienceWatchRatio - points[index - 1]!.audienceWatchRatio; if (delta < worst.delta) worst = { index, delta }; }
  const point = points[worst.index] ?? { elapsedRatio: 0, audienceWatchRatio: 1 };
  const timestamp = point.elapsedRatio * Math.max(1, input.timeline.narration.reduce((max, segment) => Math.max(max, segment.startSeconds + segment.durationSeconds), 0));
  const narration = input.timeline.narration.find((segment) => timestamp >= segment.startSeconds && timestamp <= segment.startSeconds + segment.durationSeconds);
  const scene = input.timeline.scenes.find((candidate) => intersect(candidate.startSeconds, candidate.startSeconds + candidate.durationSeconds, timestamp, timestamp + 0.1) > 0);
  const early = point.elapsedRatio <= 0.15;
  const late = point.elapsedRatio >= 0.8;
  const problem: RetentionProblem = early ? 'WEAK_HOOK' : late ? 'WEAK_PAYOFF' : scene?.kind.match(/still|image/i) && scene.durationSeconds > 8 ? 'VISUAL_FATIGUE' : narration?.text.length && narration.text.length < 20 ? 'LOW_INFORMATION_DENSITY' : 'SLOW_SETUP';
  const drop = Math.round(Math.abs(worst.delta) * 100);
  return { problem, timestamp: { startSeconds: Math.max(0, timestamp - 2), endSeconds: timestamp + 2 }, evidence: [input.analytics.estimated ? 'fixture/estimated retention; replace with YouTube Analytics when OAuth is available' : 'actual retention snapshot', `${drop} percentage-point local retention change`, scene ? `scene ${scene.id}` : 'no scene mapping found', narration ? `narration ${narration.id}` : 'no narration mapping found'], likelyCause: early ? 'Opening does not pay the title/thumbnail promise quickly enough.' : late ? 'The narrative has not created a strong final resolution or payoff.' : scene?.kind.match(/still|image/i) ? 'Visual state remains unchanged while audience expectation continues.' : 'The current beat likely delays new information or causal clarity.', confidence: points.length >= 5 ? 76 : 48, priority: early || late ? 'HIGH' : 'MEDIUM', recommendedChange: early ? 'Change only the first 15 seconds: concrete consequence, visual action and one specific promise.' : late ? 'Strengthen the final reveal/payoff while preserving the successful opening.' : `Test one ${problem.toLowerCase().replaceAll('_', ' ')} repair at ${scene?.id ?? 'the mapped segment'}.`, testHypothesis: `A single ${problem.toLowerCase().replaceAll('_', ' ')} repair will improve retention at ${Math.round(point.elapsedRatio * 100)}% without changing topic or all later beats.`, sceneId: scene?.id, narrationSegmentId: narration?.id, openLoopState: late ? 'RESOLVED' : narration ? 'OPEN' : 'UNKNOWN', audioState: input.timeline.audio.some((cue) => cue.kind === 'VOICE' && intersect(cue.startSeconds, cue.startSeconds + cue.durationSeconds, timestamp, timestamp + 0.1) > 0) ? 'VOICE_PRESENT' : 'NO_VOICE_MAPPED' };
}
