import type { Scene } from './types.js';

export type CostRates = { voicePerMinuteUsd: number; aiImageUsd: number; aiVideoPerSecondUsd: number; renderUsd: number; storageUsd: number };

export const DEFAULT_COST_RATES: CostRates = { voicePerMinuteUsd: 0.08, aiImageUsd: 0.04, aiVideoPerSecondUsd: 0.18, renderUsd: 0.15, storageUsd: 0.03 };

export function estimateProductionCost(input: { narrationSeconds: number; scenes: Scene[]; rates?: CostRates }): number {
  const rates = input.rates ?? DEFAULT_COST_RATES;
  const aiImages = input.scenes.filter((scene) => scene.kind === 'ai_image').length;
  const aiVideoSeconds = input.scenes.filter((scene) => scene.kind === 'ai_video').reduce((sum, scene) => sum + scene.durationSec, 0);
  const value = (input.narrationSeconds / 60) * rates.voicePerMinuteUsd + aiImages * rates.aiImageUsd + aiVideoSeconds * rates.aiVideoPerSecondUsd + rates.renderUsd + rates.storageUsd;
  return Math.round(value * 100) / 100;
}
