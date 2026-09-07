import type { StoryAngle } from './types.js';

export type AngleInput = Omit<StoryAngle, 'score'>;

export function scoreAngle(angle: AngleInput): StoryAngle {
  const upside = angle.novelty * 0.18 + angle.emotionalPull * 0.16 + angle.retentionPotential * 0.24 + angle.monetizationFit * 0.12 + angle.evidenceFit * 0.18 + angle.productionFit * 0.12;
  const score = Math.max(0, Math.min(100, upside - angle.risk * 0.28));
  return { ...angle, score: Math.round(score * 10) / 10 };
}

export function rankAngles(angles: AngleInput[]): StoryAngle[] {
  return angles.map(scoreAngle).sort((a, b) => b.score - a.score);
}
