export type ProductionVisualMode = 'FOOTAGE_PRO' | 'HYBRID_EDITORIAL' | 'GRAPHIC_EXPLAINER' | 'GENERATIVE_IP' | 'ARCHIVAL';
export type VisualAssetKind = 'REAL_VIDEO' | 'SYNTHETIC_VIDEO' | 'IMAGE' | 'DOCUMENT' | 'GRAPHIC';
export type EvidenceRole = 'DIRECT_EVIDENCE' | 'CONTEXTUAL_REAL' | 'SYNTHETIC_ILLUSTRATION' | 'DOCUMENT' | 'DATA' | 'DECORATIVE';
export type GapSeverity = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type VisualContinuityProfile = {
  sourceShotIds: string[];
  cameraClass: string;
  cameraMovement: string;
  motionDirection: string;
  framing: string;
  palette: string;
  lighting: string;
  environment: string;
  energy: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
  resolution: string;
  texture: string;
  notes: string[];
  provenance: { method: string; confidence: number; observedAt: string };
};

export type SyntheticShotContract = {
  shotPurpose: string;
  subject: string;
  action: string;
  environment: string;
  cameraPosition: string;
  cameraMovement: string;
  lensFeel: string;
  depthOfField: string;
  lighting: string;
  timeOfDay: string;
  colorTemperature: string;
  exposure: string;
  motionBlur: string;
  frameRateFeel: string;
  shutterFeel: string;
  captureCharacter: string;
  shotDurationSeconds: number;
  aspectRatio: string;
  screenDirection: string;
  subjectScale: string;
  visualEnergy: string;
  previousShotContext: string;
  nextShotContext: string;
};

export type ShotStyleMatchScore = {
  photorealism: 'STRONG' | 'MEDIUM' | 'WEAK' | 'UNKNOWN';
  temporalRealism: 'STRONG' | 'MEDIUM' | 'WEAK' | 'UNKNOWN';
  styleMatch: 'STRONG' | 'MEDIUM' | 'WEAK' | 'UNKNOWN';
  physics: 'STRONG' | 'MEDIUM' | 'WEAK' | 'UNKNOWN';
  score: number | null;
  evidence: string[];
  method: string;
};

export type VisualGapRow = {
  unitId: string;
  startTime: number;
  endTime: number;
  narration: string;
  claimIds: string[];
  entities: string[];
  requiredAction: string[];
  requiredObject: string[];
  requiredMechanism: string[];
  visualIntent: unknown;
  realExactCount: number;
  realStrongCount: number;
  realContextualCount: number;
  syntheticCandidateNeeded: boolean;
  documentCandidateCount: number;
  graphicCandidateCount: number;
  severity: GapSeverity;
  selectedStrategy: 'REAL_EXACT' | 'REAL_STRONG' | 'REAL_MULTI_SHOT' | 'REAL_PLUS_SYNTHETIC' | 'SYNTHETIC_PHOTOREAL' | 'DOCUMENT' | 'GRAPHIC_REQUIRED' | 'SCRIPT_REWRITE' | 'TOPIC_REJECT';
  confidence: number | null;
  reason: string;
};

export type GenerationJustification = {
  unitId: string;
  visualGap: string;
  whyRealFootageInsufficient: string;
  whyScriptShouldRemain: string;
  whySyntheticIsAppropriate: string;
  evidenceRole: 'SYNTHETIC_ILLUSTRATION';
  providerChoice: string;
  expectedQuality: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
  estimatedCost: { value: number | null; currency: string; source: string };
  alternativesConsidered: string[];
};

export type ModeContractReport = {
  mode: ProductionVisualMode;
  status: 'PASS' | 'FAIL' | 'UNKNOWN';
  requirements: Record<string, unknown>;
  observed: Record<string, unknown>;
  failures: string[];
  warnings: string[];
};

const words = (value: unknown): string[] => String(value ?? '').toLowerCase().split(/[^a-z0-9]+/).filter((item) => item.length > 2);
const overlap = (left: string[], right: string[]) => {
  const a = new Set(left.flatMap(words));
  const b = new Set(right.flatMap(words));
  return [...a].filter((item) => b.has(item)).length / Math.max(1, Math.min(a.size, b.size));
};
const now = () => new Date().toISOString();

export function buildVisualContinuityProfile(input: {
  previous?: Array<{ segmentId?: string; cameraMovement?: string; cameraDistance?: string; motionLevel?: string; visualQuality?: string; environment?: string[]; location?: string[]; semanticDescription?: string }>;
  next?: Array<{ segmentId?: string; cameraMovement?: string; cameraDistance?: string; motionLevel?: string; visualQuality?: string; environment?: string[]; location?: string[]; semanticDescription?: string }>;
  overall?: Array<{ segmentId?: string; cameraMovement?: string; cameraDistance?: string; motionLevel?: string; visualQuality?: string; environment?: string[]; location?: string[]; semanticDescription?: string }>;
}): VisualContinuityProfile {
  const all = [...(input.previous ?? []), ...(input.next ?? []), ...(input.overall ?? [])];
  const first = all[0] ?? {};
  const movement = all.map((item) => String(item.cameraMovement ?? '')).filter(Boolean);
  const motion = all.map((item) => String(item.motionLevel ?? '')).filter(Boolean);
  const environment = all.flatMap((item) => [...(item.environment ?? []), ...(item.location ?? [])]).filter(Boolean);
  const descriptions = all.map((item) => item.semanticDescription ?? '').filter(Boolean);
  const high = motion.filter((item) => /HIGH/i.test(item)).length;
  const energy: VisualContinuityProfile['energy'] = !motion.length ? 'UNKNOWN' : high / motion.length > 0.45 ? 'HIGH' : motion.some((item) => /MEDIUM/i.test(item)) ? 'MEDIUM' : 'LOW';
  return {
    sourceShotIds: all.map((item) => item.segmentId).filter(Boolean) as string[],
    cameraClass: /underwater/i.test(descriptions.join(' ')) ? 'UNDERWATER_CAMERA' : /macro|close/i.test(`${first.cameraDistance} ${descriptions.join(' ')}`) ? 'MACRO' : /drone|aerial/i.test(descriptions.join(' ')) ? 'DRONE' : 'DOCUMENTARY_HANDHELD',
    cameraMovement: movement[0] ?? 'UNKNOWN',
    motionDirection: /left to right|right to left|tracking/i.test(descriptions.join(' ')) ? 'OBSERVED_TRACKING' : 'UNKNOWN',
    framing: first.cameraDistance ?? 'UNKNOWN',
    palette: /blue|underwater|pool|ocean/i.test(`${environment.join(' ')} ${descriptions.join(' ')}`) ? 'COOL_BLUE_NATURAL' : 'NATURAL_NEUTRAL',
    lighting: /night|dark|low light/i.test(descriptions.join(' ')) ? 'LOW_LIGHT_NATURAL' : 'NATURAL_AVAILABLE_LIGHT',
    environment: environment.slice(0, 8).join(', ') || 'UNKNOWN',
    energy,
    resolution: 'MATCH_NEIGHBOURING_FOOTAGE',
    texture: 'NATURAL_CAMERA_COMPRESSION_AND_NOISE',
    notes: ['Generated shot must look captured in the same production, not like a diagram or polished CGI.', ...descriptions.slice(0, 3).map((item) => `Neighbour evidence: ${item}`)],
    provenance: { method: 'neighbour-shot-semantic-profiles', confidence: all.length ? 0.72 : 0, observedAt: now() },
  };
}

export function compileSyntheticShotPrompt(contract: SyntheticShotContract, continuity: VisualContinuityProfile, negativeConstraints: string[] = []): string {
  return [
    `Photorealistic documentary footage: ${contract.subject}.`,
    `Action: ${contract.action}. Purpose: ${contract.shotPurpose}.`,
    `Environment: ${contract.environment}. Camera: ${contract.cameraPosition}, ${contract.cameraMovement}, ${contract.lensFeel}, ${contract.depthOfField}.`,
    `Lighting: ${contract.lighting}; time: ${contract.timeOfDay}; colour temperature: ${contract.colorTemperature}; exposure: ${contract.exposure}.`,
    `Natural motion blur, ${contract.frameRateFeel}, ${contract.shutterFeel}, ${contract.captureCharacter}. Duration ${contract.shotDurationSeconds.toFixed(1)} seconds, ${contract.aspectRatio}.`,
    `Continuity profile: camera=${continuity.cameraClass}; movement=${continuity.cameraMovement}; framing=${continuity.framing}; palette=${continuity.palette}; lighting=${continuity.lighting}; energy=${continuity.energy}; environment=${continuity.environment}.`,
    `Bridge from: ${contract.previousShotContext}. Bridge to: ${contract.nextShotContext}. Screen direction: ${contract.screenDirection}; subject scale: ${contract.subjectScale}; visual energy: ${contract.visualEnergy}.`,
    `Material realism and physically plausible motion. ${negativeConstraints.concat(['no flat diagram', 'no infographic', 'no labels', 'no readable generated text', 'no cartoon', 'no CGI render', 'no impossible geometry', 'no morphing', 'no fake logos']).join(', ')}.`,
  ].join(' ');
}

export class SyntheticBrollEngine {
  static buildContract(input: Partial<SyntheticShotContract> & Pick<SyntheticShotContract, 'subject' | 'action'>): SyntheticShotContract {
    return {
      shotPurpose: input.shotPurpose ?? 'bridge a specific visual gap', environment: input.environment ?? 'same real-world environment as adjacent footage', cameraPosition: input.cameraPosition ?? 'medium close-up', cameraMovement: input.cameraMovement ?? 'subtle handheld drift', lensFeel: input.lensFeel ?? 'natural documentary lens', depthOfField: input.depthOfField ?? 'moderate depth of field', lighting: input.lighting ?? 'natural available light', timeOfDay: input.timeOfDay ?? 'same as neighbouring shots', colorTemperature: input.colorTemperature ?? 'matched to neighbouring footage', exposure: input.exposure ?? 'natural exposure with small camera adaptation', motionBlur: input.motionBlur ?? 'natural motion blur', frameRateFeel: input.frameRateFeel ?? 'real-time documentary frame cadence', shutterFeel: input.shutterFeel ?? 'natural shutter, no hyper-smooth slow motion', captureCharacter: input.captureCharacter ?? 'consumer/documentary camera texture', shotDurationSeconds: input.shotDurationSeconds ?? 3, aspectRatio: input.aspectRatio ?? '16:9', screenDirection: input.screenDirection ?? 'continue observed direction', subjectScale: input.subjectScale ?? 'medium detail', visualEnergy: input.visualEnergy ?? 'match adjacent action', previousShotContext: input.previousShotContext ?? 'real footage immediately before', nextShotContext: input.nextShotContext ?? 'real footage immediately after', subject: input.subject, action: input.action,
    };
  }

  static justify(input: Omit<GenerationJustification, 'evidenceRole'>): GenerationJustification { return { ...input, evidenceRole: 'SYNTHETIC_ILLUSTRATION' }; }

  static evaluateCandidate(input: { framesObserved: boolean; photorealism: ShotStyleMatchScore['photorealism']; temporalRealism: ShotStyleMatchScore['temporalRealism']; styleMatch: ShotStyleMatchScore['styleMatch']; physics: ShotStyleMatchScore['physics']; evidence: string[] }): ShotStyleMatchScore {
    const strong = [input.photorealism, input.temporalRealism, input.styleMatch, input.physics].filter((item) => item === 'STRONG').length;
    const score = input.framesObserved ? Math.round((strong / 4) * 100) : null;
    return { ...input, score, method: 'temporal-frame-review-required' };
  }
}

export function buildVisualGapReport(input: Array<Partial<VisualGapRow> & Pick<VisualGapRow, 'unitId' | 'startTime' | 'endTime' | 'narration'>>): { version: 'VISUAL_GAP_REPORT_V1'; rows: VisualGapRow[]; createdAt: string } {
  const rows = input.map((row) => {
    const exact = Number(row.realExactCount ?? 0); const strong = Number(row.realStrongCount ?? 0); const contextual = Number(row.realContextualCount ?? 0);
    const severity: GapSeverity = exact + strong > 0 ? 'NONE' : contextual > 0 ? 'MEDIUM' : 'HIGH';
    const selectedStrategy = row.selectedStrategy ?? (exact > 1 ? 'REAL_MULTI_SHOT' : strong > 0 ? 'REAL_STRONG' : row.syntheticCandidateNeeded ? 'SYNTHETIC_PHOTOREAL' : 'SCRIPT_REWRITE');
    return { unitId: row.unitId, startTime: row.startTime, endTime: row.endTime, narration: row.narration, claimIds: row.claimIds ?? [], entities: row.entities ?? [], requiredAction: row.requiredAction ?? [], requiredObject: row.requiredObject ?? [], requiredMechanism: row.requiredMechanism ?? [], visualIntent: row.visualIntent ?? null, realExactCount: exact, realStrongCount: strong, realContextualCount: contextual, syntheticCandidateNeeded: Boolean(row.syntheticCandidateNeeded), documentCandidateCount: Number(row.documentCandidateCount ?? 0), graphicCandidateCount: Number(row.graphicCandidateCount ?? 0), severity, selectedStrategy, confidence: row.confidence == null ? null : Number(row.confidence), reason: row.reason ?? (severity === 'NONE' ? 'Real moving footage is available.' : 'Real footage does not fully cover the intended action.') } as VisualGapRow;
  });
  return { version: 'VISUAL_GAP_REPORT_V1', rows, createdAt: now() };
}

export function evaluateModeContract(input: { mode: ProductionVisualMode; durationSeconds: number; realVideoSeconds: number; syntheticVideoSeconds: number; graphicSeconds: number; imageSeconds: number; criticalVisualsCovered: boolean; syntheticShots: Array<ShotStyleMatchScore> }): ModeContractReport {
  const duration = Math.max(0.001, input.durationSeconds);
  const realRatio = input.realVideoSeconds / duration; const graphicRatio = input.graphicSeconds / duration;
  const failures: string[] = []; const warnings: string[] = [];
  const requirements = input.mode === 'FOOTAGE_PRO' ? { realVideoRatioMin: 0.75, graphicRatioMax: 0.20, syntheticStyleRequired: true } : { realVideoRatioMin: 0.50, graphicRatioMax: 0.30, syntheticStyleRequired: true };
  if (realRatio < Number(requirements.realVideoRatioMin)) failures.push('REAL_VIDEO_RATIO_BELOW_MODE_FLOOR');
  if (graphicRatio > Number(requirements.graphicRatioMax)) failures.push('GRAPHIC_RATIO_ABOVE_MODE_CAP');
  if (!input.criticalVisualsCovered) failures.push('CRITICAL_VISUAL_GAP');
  if (requirements.syntheticStyleRequired && input.syntheticShots.some((shot) => shot.photorealism !== 'STRONG' || shot.temporalRealism !== 'STRONG' || shot.styleMatch !== 'STRONG')) failures.push('SYNTHETIC_SHOT_FAILED_REALISM_OR_STYLE_GATE');
  if (graphicRatio > 0.1) warnings.push('GRAPHICS_PRESENT_IN_FOOTAGE_LED_MODE');
  return { mode: input.mode, status: failures.length ? 'FAIL' : 'PASS', requirements, observed: { realVideoSeconds: input.realVideoSeconds, syntheticVideoSeconds: input.syntheticVideoSeconds, graphicSeconds: input.graphicSeconds, imageSeconds: input.imageSeconds, realVideoRatio: realRatio, graphicRatio }, failures, warnings };
}

export function evaluateVisualRealityContinuity(input: { mode: ProductionVisualMode; transitions: Array<{ from: VisualAssetKind; to: VisualAssetKind; hasEditorialReason?: boolean; styleMatch?: ShotStyleMatchScore['styleMatch']; reason?: string }> }): { status: 'PASS' | 'FAIL'; failures: string[]; transitions: unknown[] } {
  const failures = input.transitions.flatMap((transition) => {
    const realToGraphic = transition.from === 'REAL_VIDEO' && transition.to === 'GRAPHIC';
    const syntheticBad = transition.to === 'SYNTHETIC_VIDEO' && transition.styleMatch !== 'STRONG';
    return realToGraphic && !transition.hasEditorialReason ? ['REAL_TO_GRAPHIC_BREAK'] : syntheticBad ? ['REAL_TO_BAD_SYNTHETIC_BREAK'] : [];
  });
  return { status: failures.length ? 'FAIL' : 'PASS', failures, transitions: input.transitions };
}

export function buildVisualLanguageReport(input: { durationSeconds: number; realVideoSeconds: number; syntheticVideoSeconds: number; graphicSeconds: number; imageSeconds: number; documentSeconds: number; visualGenreBreakCount: number; staticDominance: boolean; sourceDominance: boolean; syntheticStyleMismatchCount: number }) {
  const total = Math.max(0.001, input.durationSeconds);
  return { version: 'VISUAL_LANGUAGE_REPORT_V1', seconds: { realVideo: input.realVideoSeconds, syntheticVideo: input.syntheticVideoSeconds, graphic: input.graphicSeconds, image: input.imageSeconds, document: input.documentSeconds }, ratios: { realVideo: input.realVideoSeconds / total, syntheticVideo: input.syntheticVideoSeconds / total, graphic: input.graphicSeconds / total, image: input.imageSeconds / total, document: input.documentSeconds / total }, visualGenreBreakCount: input.visualGenreBreakCount, staticDominance: input.staticDominance, sourceDominance: input.sourceDominance, syntheticStyleMismatchCount: input.syntheticStyleMismatchCount };
}
