export type TrendPoint = { at: Date; value: number };
export type TrendAnalysis = {
  current: number;
  baseline: number;
  velocityPct: number;
  accelerationPct: number;
  breakoutScore: number;
  persistenceScore: number;
};

const avg = (xs: number[]) => xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : 0;
const clamp = (n: number) => Math.max(0, Math.min(100, n));
const round = (n: number) => Math.round(n * 10) / 10;

export function analyzeTrend(points: TrendPoint[]): TrendAnalysis {
  const sorted = [...points].filter(p => Number.isFinite(p.value) && p.value >= 0).sort((a,b)=>a.at.getTime()-b.at.getTime());
  if (sorted.length < 4) {
    const current = sorted.at(-1)?.value ?? 0;
    return { current, baseline: current, velocityPct: 0, accelerationPct: 0, breakoutScore: 50, persistenceScore: 0 };
  }

  const values = sorted.map(p=>p.value);
  const split = Math.max(2, Math.floor(values.length * 0.6));
  const baselineValues = values.slice(0, split);
  const recentValues = values.slice(split);
  const baseline = Math.max(avg(baselineValues), 0.0001);
  const recent = Math.max(avg(recentValues), 0);
  const velocityPct = ((recent - baseline) / baseline) * 100;

  const half = Math.max(1, Math.floor(recentValues.length / 2));
  const earlyRecent = Math.max(avg(recentValues.slice(0, half)), 0.0001);
  const lateRecent = Math.max(avg(recentValues.slice(half)), 0);
  const accelerationPct = ((lateRecent - earlyRecent) / earlyRecent) * 100;

  // 0% growth ≈ 50; +100% ≈ 75; +300% plus acceleration trends toward 100.
  const growthComponent = 50 + Math.sign(velocityPct) * Math.log2(1 + Math.abs(velocityPct) / 50) * 18;
  const accelComponent = 50 + Math.sign(accelerationPct) * Math.log2(1 + Math.abs(accelerationPct) / 50) * 14;
  const breakoutScore = clamp(growthComponent * 0.7 + accelComponent * 0.3);

  const recentPositive = recentValues.filter((v, i, arr) => i === 0 || v >= arr[i-1]! * 0.9).length;
  const persistenceScore = clamp((recentPositive / recentValues.length) * 100);

  return {
    current: round(values.at(-1) ?? 0),
    baseline: round(baseline),
    velocityPct: round(velocityPct),
    accelerationPct: round(accelerationPct),
    breakoutScore: round(breakoutScore),
    persistenceScore: round(persistenceScore),
  };
}
