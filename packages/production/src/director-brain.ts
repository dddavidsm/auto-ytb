export type CanonicalMossTraits = {
  species: string;
  locomotion: 'BIPEDAL';
  headWidthHeightRatio: number;
  muzzleSize: number;
  eyeSize: number;
  eyeSpacing: number;
  earDimensions: string;
  bodyHeight: number;
  torsoProportions: string;
  armLength: number;
  legLength: number;
  pawProportions: string;
  tailLength: number;
  tailThickness: string;
  tailRings: string;
  furColors: string[];
  creamMarkings: string;
  scarfDimensions: string;
  scarfStripePattern: string;
  scarfColors: string[];
};

export type MossCharacterMaster = {
  id: string;
  version: string;
  flowCharacterId: string;
  source: string;
  canonicalReferences: string[];
  traits: CanonicalMossTraits;
  forbiddenChanges: string[];
};

export type LanternMaster = {
  id: string;
  version: string;
  kind: 'PROP';
  source: string;
  immutableTraits: string[];
};

export type SceneState = {
  shotId: string;
  moss: { position: string; pose: string; orientation: string; emotion: string; locomotion: 'BIPEDAL'; heldObjects: string[] };
  lantern: { position: string; state: string };
  firefly: { position: string; state: string };
  location: string;
  cameraSide: string;
  time: string;
  lighting: string;
};

export function validateMossCharacterMaster(master: MossCharacterMaster) {
  const issues: string[] = [];
  if (!master.id || !master.flowCharacterId) issues.push('persistent Flow character identity is missing');
  if (master.traits.locomotion !== 'BIPEDAL') issues.push('canonical locomotion must be bipedal');
  if (master.canonicalReferences.length < 1) issues.push('at least one canonical reference is required');
  if (master.forbiddenChanges.length < 4) issues.push('identity lock needs explicit forbidden changes');
  return { status: issues.length ? 'FAIL' as const : 'PASS' as const, issues };
}

export function validateSceneStateContinuity(previous: SceneState, next: SceneState) {
  const blockers: string[] = [];
  if (next.moss.locomotion !== previous.moss.locomotion) blockers.push('locomotion changed between shots');
  if (next.location !== previous.location) blockers.push('location changed without an explicit transition');
  if (next.lantern.state === 'MISSING' && previous.moss.heldObjects.includes('LANTERN_MASTER_V1')) blockers.push('lantern disappeared from a held-object state');
  return { status: blockers.length ? 'FAIL' as const : 'PASS' as const, blockers };
}

export type MotionPhysicsObservation = {
  footContact: boolean;
  groundContact: boolean;
  acceleration: boolean;
  deceleration: boolean;
  bodyWeight: boolean;
  objectContact: boolean;
  sliding: boolean;
  floating: boolean;
  teleportLikeDisplacement: boolean;
  notes?: string[];
};

export function evaluateMotionPhysics(observations: MotionPhysicsObservation[]) {
  const blockers = observations.flatMap((item, index) => [
    ...(item.sliding ? [`sample ${index}: visible foot or prop sliding`] : []),
    ...(item.floating ? [`sample ${index}: floating motion`] : []),
    ...(item.teleportLikeDisplacement ? [`sample ${index}: teleport-like displacement`] : []),
    ...(item.footContact ? [] : [`sample ${index}: foot contact not demonstrated`]),
  ]);
  const passingSignals = observations.reduce((sum, item) => sum + [item.footContact, item.groundContact, item.acceleration, item.deceleration, item.bodyWeight, item.objectContact].filter(Boolean).length, 0);
  const totalSignals = Math.max(1, observations.length * 6);
  return { status: blockers.length ? 'FAIL' as const : 'PASS' as const, score: Number((passingSignals / totalSignals * 10).toFixed(2)), blockers };
}

export type GenerationEvidence = {
  provider: string;
  model: string;
  mode: string;
  shotType: string;
  referenceMethod: string;
  motionType: string;
  identityConsistency: number;
  bodyConsistency: number;
  propConsistency: number;
  motionPhysics: number;
  dialoguePerformance: number;
  lipSync: number;
  promptAdherence: number;
  cameraControl: number;
  temporalStability: number;
  storyAccuracy: number;
  costPerGeneration: number;
  creditCost: number;
  latencySeconds: number;
  kept: boolean;
};

export type ModelCompetencyProfile = GenerationEvidence & { sampleCount: number; confidence: number };

function competencyKey(evidence: Pick<GenerationEvidence, 'provider' | 'model' | 'mode' | 'shotType' | 'referenceMethod' | 'motionType'>) {
  return [evidence.provider, evidence.model, evidence.mode, evidence.shotType, evidence.referenceMethod, evidence.motionType].join('|');
}

export function updateModelCompetencyProfile(previous: ModelCompetencyProfile | null, evidence: GenerationEvidence): ModelCompetencyProfile {
  if (!previous) return { ...evidence, sampleCount: 1, confidence: 0.35 };
  const count = previous.sampleCount + 1;
  const numeric = ['identityConsistency', 'bodyConsistency', 'propConsistency', 'motionPhysics', 'dialoguePerformance', 'lipSync', 'promptAdherence', 'cameraControl', 'temporalStability', 'storyAccuracy', 'costPerGeneration', 'creditCost', 'latencySeconds'] as const;
  const next = { ...previous } as ModelCompetencyProfile;
  for (const field of numeric) next[field] = Number(((previous[field] * previous.sampleCount + evidence[field]) / count).toFixed(4));
  next.kept = previous.kept || evidence.kept;
  next.sampleCount = count;
  next.confidence = Number(Math.min(0.95, 0.35 + count * 0.1).toFixed(2));
  return next;
}

export function buildCompetencyProfile(evidence: GenerationEvidence[]) {
  const profiles = new Map<string, ModelCompetencyProfile>();
  for (const item of evidence) profiles.set(competencyKey(item), updateModelCompetencyProfile(profiles.get(competencyKey(item)) ?? null, item));
  return Object.fromEntries(profiles.entries());
}

export type CreditCandidate = { id: string; expectedInformationGain: number; expectedProductionValue: number; creditCost: number };

export function rankGenerationByValuePerPoint(candidates: CreditCandidate[]) {
  return [...candidates].map((candidate) => ({
    ...candidate,
    valuePerPoint: Number(((Math.max(0, candidate.expectedInformationGain) + Math.max(0, candidate.expectedProductionValue)) / Math.max(0.01, candidate.creditCost)).toFixed(4)),
  })).sort((a, b) => b.valuePerPoint - a.valuePerPoint);
}

export function createDirectorBrainSummary(input: { humanScore: number; automatedScore: number; evidence: GenerationEvidence[]; creditCandidates: CreditCandidate[] }) {
  return {
    humanCalibration: { humanScore: input.humanScore, automatedScore: input.automatedScore, error: Number((input.automatedScore - input.humanScore).toFixed(2)), humanIsAuthoritative: true },
    competencyProfiles: buildCompetencyProfile(input.evidence),
    creditRanking: rankGenerationByValuePerPoint(input.creditCandidates),
  };
}
