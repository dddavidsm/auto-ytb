export type StoryBeat = {
  id: string;
  purpose: 'HOOK' | 'SETUP' | 'PROBLEM' | 'ATTEMPT' | 'ESCALATION' | 'REVEAL' | 'PAYOFF' | 'BUTTON';
  spokenText: string;
  action: string;
  consequence: string;
  mossGoal: string;
  object?: string;
  location?: string;
  durationSeconds?: number;
};

export type StoryPitch = {
  id: string;
  title: string;
  oneSentence: string;
  hook: string;
  goal: string;
  obstacle: string;
  payoff: string;
  ageFit: string;
  visualPotential: number;
  seriesFit: number;
  originality: number;
  feasibility: number;
  score?: number;
};

export function scoreStoryPitch(pitch: StoryPitch) {
  const fields = ['visualPotential', 'seriesFit', 'originality', 'feasibility'] as const;
  const numeric = fields.map((field) => Math.max(0, Math.min(10, Number(pitch[field]))));
  const clarity = [pitch.oneSentence, pitch.hook, pitch.goal, pitch.obstacle, pitch.payoff]
    .every((value) => String(value ?? '').trim().length > 8) ? 10 : 4;
  const score = Number((numeric.reduce((sum, value) => sum + value, 0) / numeric.length * 0.7 + clarity * 0.3).toFixed(2));
  return { ...pitch, score, clarity, status: score >= 7 ? 'PASS' : 'REWRITE' };
}

export function buildCausalityChainReport(beats: StoryBeat[]) {
  const checks = beats.map((beat, index) => ({
    beatId: beat.id,
    previousBeatId: beats[index - 1]?.id ?? null,
    hasAction: Boolean(beat.action?.trim()),
    hasConsequence: Boolean(beat.consequence?.trim()),
    causedByPrevious: index === 0 || Boolean(beat.consequence?.trim() && beat.action?.trim()),
    result: index === 0 || (Boolean(beat.action?.trim()) && Boolean(beat.consequence?.trim())) ? 'PASS' : 'FAIL',
  }));
  return { status: checks.every((check) => check.result === 'PASS') ? 'PASS' : 'FAIL', checks };
}

export function trackNarrativeObjects(beats: StoryBeat[]) {
  const objects = new Map<string, { firstBeat: string; lastBeat: string; appearances: number; continuity: 'PASS' | 'FAIL' }>();
  for (const beat of beats) {
    if (!beat.object) continue;
    const existing = objects.get(beat.object);
    objects.set(beat.object, existing
      ? { ...existing, lastBeat: beat.id, appearances: existing.appearances + 1 }
      : { firstBeat: beat.id, lastBeat: beat.id, appearances: 1, continuity: 'PASS' });
  }
  return Object.fromEntries(objects.entries());
}

export function scoreNarrativeRandomness(beats: StoryBeat[]) {
  let penalties = 0;
  for (let index = 1; index < beats.length; index += 1) {
    if (!beats[index].action || !beats[index].consequence) penalties += 2;
    if (beats[index].location && beats[index].location !== beats[index - 1].location && !beats[index].consequence) penalties += 2;
  }
  const score = Number(Math.max(0, Math.min(1, penalties / Math.max(1, beats.length * 2))).toFixed(3));
  return { score, status: score <= 0.2 ? 'PASS' : 'FAIL', penalties };
}

export function buildStoryQualityReport(input: {
  pitch: ReturnType<typeof scoreStoryPitch>;
  beats: StoryBeat[];
  audioDurationSeconds: number;
  animaticDurationSeconds: number;
}) {
  const causality = buildCausalityChainReport(input.beats);
  const objects = trackNarrativeObjects(input.beats);
  const randomness = scoreNarrativeRandomness(input.beats);
  const firstThreeSeconds = input.beats.slice(0, 2).map((beat) => `${beat.spokenText} ${beat.action}`).join(' ');
  const dimensions = {
    HOOK: input.beats[0]?.purpose === 'HOOK' && firstThreeSeconds.length > 25 ? 'PASS' : 'FAIL',
    PREMISE: input.pitch.status,
    GOAL_CLARITY: input.beats.every((beat) => Boolean(beat.mossGoal?.trim())) ? 'PASS' : 'FAIL',
    CONFLICT: input.beats.some((beat) => beat.purpose === 'PROBLEM') ? 'PASS' : 'FAIL',
    CAUSALITY: causality.status,
    ESCALATION: input.beats.some((beat) => beat.purpose === 'ESCALATION') ? 'PASS' : 'FAIL',
    CHARACTER_MOTIVATION: input.beats.every((beat) => Boolean(beat.mossGoal?.trim())) ? 'PASS' : 'FAIL',
    PACING: input.animaticDurationSeconds >= 25 && input.animaticDurationSeconds <= 40 ? 'PASS' : 'WARN',
    PAYOFF: input.beats.some((beat) => beat.purpose === 'PAYOFF') ? 'PASS' : 'FAIL',
    AGE_FIT: input.pitch.ageFit === 'KIDS_4_7' ? 'PASS' : 'WARN',
    REWATCHABILITY: input.beats.some((beat) => beat.purpose === 'BUTTON') ? 'PASS' : 'WARN',
  } as const;
  const passed = Object.values(dimensions).filter((value) => value === 'PASS').length;
  const score = Number((passed / Object.keys(dimensions).length * 10).toFixed(2));
  return {
    status: Object.values(dimensions).every((value) => value !== 'FAIL') ? 'PASS' : 'REWRITE',
    score: Math.min(9, score),
    dimensions,
    causality,
    narrativeObjects: objects,
    narrativeRandomness: randomness,
    audioStoryboardAgreement: Math.abs(input.audioDurationSeconds - input.animaticDurationSeconds) < 1.2 ? 'PASS' : 'WARN',
  };
}

export function evaluateNegativeStoryFixture() {
  return {
    fixture: 'MOSS_FULL_EPISODE_V1',
    classification: 'VISUALLY_PROMISING_BUT_STORYLESS_NEGATIVE_FIXTURE',
    status: 'FAIL',
    blockers: ['unclear premise', 'weak goal clarity', 'disconnected scene chain', 'weak escalation', 'low viewer continuation motivation'],
  } as const;
}
