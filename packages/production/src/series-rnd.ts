export type TargetAudience = 'PRESCHOOL_2_4' | 'KIDS_4_7' | 'KIDS_7_10' | 'FAMILY_GENERAL';
export type QualityState = 'FAIL' | 'PROTOTYPE' | 'PROMISING' | 'PROFESSIONAL' | 'REFERENCE_COMPETITIVE';

export type SeriesOpportunityScore = {
  marketDemand: number; storyFlexibility: number; characterAppeal: number; thumbnailStrength: number;
  repeatability: number; originality: number; languagePortability: number; cost: number;
  kidsFit: number; total: number;
};

export type CharacterMaster = {
  id: string;
  name: string;
  species: string;
  structure: 'HUMANOID_BIPED' | 'QUADRUPED' | 'OTHER';
  version: string;
  modelUri: string;
  canonicalViews: string[];
  rig: { status: 'MISSING' | 'PROTOTYPE' | 'VALIDATED'; root?: string; bones: string[]; tail?: string };
  face: { status: 'MISSING' | 'PROTOTYPE' | 'VALIDATED'; blendShapes: string[]; visemes: string[] };
  palette: string[];
  materials: string[];
  proportions: Record<string, number>;
  accessories: string[];
  voiceMasterId?: string;
  forbiddenChanges: string[];
};

export type WorldMaster = {
  id: string;
  name: string;
  locations: Array<{ id: string; name: string; assetUri: string; lighting: string }>;
  palette: string[];
  cameraLanguage: string[];
  reusableProps: string[];
};

export type TemporalShotObservation = {
  shotId: string;
  samples: Array<{ at: 'start' | '25%' | '50%' | '75%' | 'end'; characterIdentity: number; bodyMotion: number; facialActing: number; lipSync: number; flicker: number; issues: string[] }>;
};

export type CrossShotContinuityReport = {
  passed: boolean;
  score: number;
  issues: string[];
  checks: Array<{ fromShot: string; toShot: string; character: number; clothing: number; prop: number; location: number; lighting: number }>;
};

const clamp = (value: number) => Math.max(0, Math.min(10, Number(value)));
const REQUIRED_BONES = ['root', 'spine', 'head', 'upper_arm.L', 'upper_arm.R', 'forearm.L', 'forearm.R', 'thigh.L', 'thigh.R', 'shin.L', 'shin.R'];
const REQUIRED_VISEMES = ['REST', 'MBP', 'A', 'E', 'I', 'O', 'U', 'FV', 'L', 'WQ', 'SZ'];

export function validateCharacterMaster(master: CharacterMaster) {
  const issues: string[] = [];
  if (!master.id || !master.version || !master.modelUri || /^PENDING_/i.test(master.modelUri)) issues.push('missing canonical model identity');
  if (master.structure !== 'HUMANOID_BIPED') issues.push('master is not configured as a riggable biped');
  for (const view of ['front', 'three-quarter', 'side', 'rear']) if (!master.canonicalViews.some((item) => item.includes(view))) issues.push(`missing canonical view: ${view}`);
  for (const bone of REQUIRED_BONES) if (!master.rig.bones.includes(bone)) issues.push(`missing rig bone: ${bone}`);
  for (const viseme of REQUIRED_VISEMES) if (!master.face.visemes.includes(viseme)) issues.push(`missing viseme: ${viseme}`);
  for (const shape of ['blink.L', 'blink.R', 'brow.up', 'smile', 'frown', 'surprise']) if (!master.face.blendShapes.includes(shape)) issues.push(`missing facial shape: ${shape}`);
  if (!master.palette.length || !master.materials.length) issues.push('palette/material definition missing');
  return { passed: issues.length === 0, issues, requiredBones: REQUIRED_BONES, requiredVisemes: REQUIRED_VISEMES };
}

export function assessTemporalContinuity(observations: TemporalShotObservation[], options: { identityFloor?: number; motionFloor?: number } = {}) {
  const identityFloor = options.identityFloor ?? 8;
  const motionFloor = options.motionFloor ?? 6;
  const issues: string[] = [];
  const scores: number[] = [];
  for (const shot of observations) {
    for (const sample of shot.samples) {
      scores.push((clamp(sample.characterIdentity) + clamp(sample.bodyMotion) + clamp(sample.facialActing) + clamp(sample.lipSync) + (10 - clamp(sample.flicker))) / 5);
      if (sample.characterIdentity < identityFloor) issues.push(`${shot.shotId}@${sample.at}: character identity drift`);
      if (sample.bodyMotion < motionFloor) issues.push(`${shot.shotId}@${sample.at}: insufficient body motion`);
      if (sample.flicker > 3) issues.push(`${shot.shotId}@${sample.at}: visible flicker/morphing`);
      issues.push(...sample.issues.map((issue) => `${shot.shotId}@${sample.at}: ${issue}`));
    }
  }
  return { passed: issues.length === 0, score: scores.length ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)) : 0, issues, samples: scores.length };
}

export function assessCrossShotContinuity(checks: CrossShotContinuityReport['checks'], floor = 8): CrossShotContinuityReport {
  const issues: string[] = [];
  for (const check of checks) {
    for (const [name, value] of Object.entries(check).filter(([key]) => key !== 'fromShot' && key !== 'toShot')) if (Number(value) < floor) issues.push(`${check.fromShot}->${check.toShot}: ${name} below continuity floor`);
  }
  const values = checks.flatMap((check) => Object.entries(check).filter(([key]) => key !== 'fromShot' && key !== 'toShot').map(([, value]) => Number(value)));
  return { passed: issues.length === 0, score: values.length ? Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(2)) : 0, issues, checks };
}

export function seriesEconomics(input: { oneTime: Array<{ name: string; costUsd: number }>; perEpisode: Array<{ name: string; costUsd: number }>; episodeDurationsMinutes?: number[] }) {
  const oneTimeCostUsd = input.oneTime.reduce((sum, item) => sum + Math.max(0, item.costUsd), 0);
  const perEpisodeCostUsd = input.perEpisode.reduce((sum, item) => sum + Math.max(0, item.costUsd), 0);
  const durationFactor = (input.episodeDurationsMinutes ?? [1, 3, 5]).map((minutes) => ({ minutes, estimatedCostUsd: Number((oneTimeCostUsd + perEpisodeCostUsd * minutes).toFixed(2)) }));
  return { oneTimeCostUsd: Number(oneTimeCostUsd.toFixed(2)), perEpisodeCostUsd: Number(perEpisodeCostUsd.toFixed(2)), durationFactor, season10CostUsd: Number((oneTimeCostUsd + perEpisodeCostUsd * 10).toFixed(2)) };
}

export const mossMasterDesign: CharacterMaster = {
  id: 'MOSS_MASTER_DESIGN_V1', name: 'Moss', species: 'red-panda-inspired anthropomorphic forest adventurer', structure: 'HUMANOID_BIPED', version: '1.0.0', modelUri: 'PENDING_MESHY_OR_BLENDER_EXPORT',
  canonicalViews: ['front-reference', 'three-quarter-reference', 'side-reference', 'rear-reference', 'full-body-reference', 'close-up-reference'],
  rig: { status: 'MISSING', bones: [] }, face: { status: 'MISSING', blendShapes: [], visemes: [] }, palette: ['red-panda russet', 'warm cream', 'deep forest green', 'golden acorn'], materials: ['short groomed fur', 'woven scarf', 'matte leather satchel'], proportions: { headToBody: 0.42, torsoToLegs: 0.55, earHeight: 0.12 }, accessories: ['striped scarf'], forbiddenChanges: ['species silhouette', 'ear shape', 'scarf stripe order', 'eye spacing', 'body proportions', 'palette drift'],
};
