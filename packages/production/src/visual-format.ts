export type VisualFormatFamily = 'ANIMATED_MICRO_STORY' | 'CHARACTER_STORY' | 'SIMPLE_CARTOON_EXPLAINER' | 'LEGACY_DOCUMENTARY_GRAPHIC';
export type VisualNarrativeCoverageType = 'DIRECT' | 'METAPHOR' | 'CONTEXTUAL' | 'ABSTRACT' | 'UNRELATED';

export interface AnimationFormatDNA {
  formatFamily: VisualFormatFamily;
  visualHookType: string;
  primarySubjectType: string;
  characterPresenceRatio: number;
  subjectScreenCoverage: number;
  actionDensity: number;
  reactionDensity: number;
  expressionDensity: number;
  locationChangeRate: number;
  shotChangeRate: number;
  cameraChangeRate: number;
  propUsage: number;
  visualGagRate: number;
  literalNarrativeCoverage: number;
  visualMetaphorCoverage: number;
  abstractGraphicCoverage: number;
  textScreenRatio: number;
  dialogueRatio: number;
  narrationRatio: number;
  motionDensity: number;
  averageShotLength: number;
  backgroundComplexity: number;
  palette: string[];
  characterStyle: string;
  animationComplexity: string;
  estimatedProductionComplexity: string;
  seriesPotential: number;
}

export interface VisualFormatProfile {
  id: VisualFormatFamily;
  label: string;
  targetDurationSeconds: [number, number];
  maxTextScreenRatio: number;
  minActionDensity: number;
  minNarrativeCoverage: number;
  maxPresentationLikeScore: number;
  referenceFamilies: string[];
  dna: Partial<AnimationFormatDNA>;
}

export interface VisualNarrativeCoverage {
  beatId: string;
  spokenLine: string;
  classification: VisualNarrativeCoverageType;
  evidence: string;
  focalSubject?: string;
}

export interface VisualizableScriptScore {
  score: number;
  visualBeats: number;
  eventBeats: number;
  genericPresentationBeats: number;
  penalties: string[];
  rewrites: string[];
}

export interface VisualCadenceReport {
  significantChanges: number;
  changesPerSecond: number;
  actionChanges: number;
  poseChanges: number;
  cameraChanges: number;
  propChanges: number;
  locationChanges: number;
  reactionChanges: number;
  revealChanges: number;
  averageShotLength: number;
  comparedWithReference: 'BELOW_REFERENCE' | 'COMPARABLE' | 'ABOVE_REFERENCE' | 'NOT_EVALUATED';
}

export interface PresentationLikeScore {
  score: number;
  chartPrevalence: number;
  dashboardPrevalence: number;
  textPrevalence: number;
  staticCompositionRatio: number;
  repeatedLayoutRatio: number;
  abstractGraphicRatio: number;
  actionDeficit: number;
  decision: 'PASS' | 'WARN' | 'FAIL';
}

export interface CompetitiveVisualReport {
  result: 'BELOW_REFERENCE' | 'ACCEPTABLE' | 'STRONG';
  score: number;
  evidence: string[];
  dimensions: Record<string, number>;
}

export interface FormatProofScore {
  hook: number;
  visualInterest: number;
  narrativeClarity: number;
  actionDensity: number;
  characterAppeal: number;
  visualCoherence: number;
  motion: number;
  mobileReadability: number;
  cost: number;
  productionTime: number;
  scalability: number;
  seriesPotential: number;
  thumbnailPotential: number;
  total: number;
}

export interface WouldAViewerKeepWatchingReport {
  score: number;
  answers: Record<string, boolean>;
  evidence: string[];
  decision: 'KEEP_WATCHING' | 'BORDERLINE' | 'SWIPE_AWAY';
}

export interface VisualFormatGateResult {
  status: 'PASS' | 'WARN' | 'FAIL';
  blocking: boolean;
  reasons: string[];
}

export const VISUAL_FORMAT_PROFILES: Record<VisualFormatFamily, VisualFormatProfile> = {
  ANIMATED_MICRO_STORY: {
    id: 'ANIMATED_MICRO_STORY', label: 'Animated micro story', targetDurationSeconds: [15, 25], maxTextScreenRatio: 0.12,
    minActionDensity: 0.55, minNarrativeCoverage: 0.82, maxPresentationLikeScore: 0.28,
    referenceFamilies: ['visual-first animated shorts', '3D animated micro stories'],
    dna: { primarySubjectType: 'original character or object', characterPresenceRatio: 0.82, actionDensity: 0.78, motionDensity: 0.82, literalNarrativeCoverage: 0.72, visualMetaphorCoverage: 0.22, abstractGraphicCoverage: 0.06, textScreenRatio: 0.05, animationComplexity: 'medium', estimatedProductionComplexity: 'medium' },
  },
  CHARACTER_STORY: {
    id: 'CHARACTER_STORY', label: 'Character story', targetDurationSeconds: [15, 25], maxTextScreenRatio: 0.15,
    minActionDensity: 0.45, minNarrativeCoverage: 0.78, maxPresentationLikeScore: 0.32,
    referenceFamilies: ['MSA', 'TheOdd1sOut', 'Jaiden Animations', 'Haminations'],
    dna: { primarySubjectType: 'recurring expressive character', characterPresenceRatio: 0.9, actionDensity: 0.62, reactionDensity: 0.8, expressionDensity: 0.9, literalNarrativeCoverage: 0.76, visualMetaphorCoverage: 0.18, abstractGraphicCoverage: 0.06, textScreenRatio: 0.06, animationComplexity: 'low-medium', estimatedProductionComplexity: 'low-medium', seriesPotential: 0.95 },
  },
  SIMPLE_CARTOON_EXPLAINER: {
    id: 'SIMPLE_CARTOON_EXPLAINER', label: 'Simple cartoon explainer', targetDurationSeconds: [15, 25], maxTextScreenRatio: 0.18,
    minActionDensity: 0.42, minNarrativeCoverage: 0.76, maxPresentationLikeScore: 0.38,
    referenceFamilies: ['History Matters', 'Sam O\'Nella Academy', 'Pencilmation'],
    dna: { primarySubjectType: 'simple character and props', characterPresenceRatio: 0.72, actionDensity: 0.58, visualGagRate: 0.42, literalNarrativeCoverage: 0.8, visualMetaphorCoverage: 0.12, abstractGraphicCoverage: 0.08, textScreenRatio: 0.08, animationComplexity: 'low', estimatedProductionComplexity: 'low', seriesPotential: 0.86 },
  },
  LEGACY_DOCUMENTARY_GRAPHIC: {
    id: 'LEGACY_DOCUMENTARY_GRAPHIC', label: 'Legacy documentary graphic', targetDurationSeconds: [45, 180], maxTextScreenRatio: 0.75,
    minActionDensity: 0.1, minNarrativeCoverage: 0.35, maxPresentationLikeScore: 0.95,
    referenceFamilies: ['legacy pilot'], dna: { primarySubjectType: 'graphic card', abstractGraphicCoverage: 0.75, textScreenRatio: 0.42, animationComplexity: 'low', estimatedProductionComplexity: 'low' },
  },
};

export function classifyVisualNarrativeCoverage(input: { beatId: string; spokenLine: string; visual: string; hasCharacter?: boolean; hasAction?: boolean; hasProp?: boolean; isGraphic?: boolean }): VisualNarrativeCoverage {
  const line = input.spokenLine.toLowerCase(); const visual = input.visual.toLowerCase();
  const generic = /chart|dashboard|terminal|paragraph|metrics|diagram|interface|data/.test(visual);
  const event = input.hasAction || input.hasCharacter || input.hasProp || /open|push|run|move|fall|react|cross|break|grab|notice|light|escape/.test(visual);
  if (generic && !event) return { beatId: input.beatId, spokenLine: input.spokenLine, classification: 'ABSTRACT', evidence: 'The visual summarizes information rather than showing an event.' };
  if (!visual.trim()) return { beatId: input.beatId, spokenLine: input.spokenLine, classification: 'UNRELATED', evidence: 'No visual intent was provided.' };
  if (event && /because|means|as if|like|inside|outside|escape|wall|room|door/.test(`${line} ${visual}`)) return { beatId: input.beatId, spokenLine: input.spokenLine, classification: input.hasAction ? 'DIRECT' : 'METAPHOR', evidence: input.hasAction ? 'The visual depicts the narrated event.' : 'The visual turns the idea into a physical event.', focalSubject: input.hasCharacter ? 'character' : undefined };
  if (event) return { beatId: input.beatId, spokenLine: input.spokenLine, classification: 'CONTEXTUAL', evidence: 'The visual supports the beat but does not depict its central event.' };
  return { beatId: input.beatId, spokenLine: input.spokenLine, classification: 'UNRELATED', evidence: 'The proposed visual has no observable causal relationship to the beat.' };
}

export function scoreVisualizableScript(beats: Array<{ spokenLine: string; visual?: string; visualType?: string }>): VisualizableScriptScore {
  const penalties: string[] = []; const rewrites: string[] = []; let eventBeats = 0; let genericPresentationBeats = 0;
  for (const beat of beats) {
    const text = `${beat.visual ?? ''} ${beat.visualType ?? ''}`.toLowerCase();
    if (/chart|dashboard|terminal|paragraph|generic graphic|show relevant/.test(text)) { genericPresentationBeats += 1; penalties.push(`Presentation shortcut for: ${beat.spokenLine}`); rewrites.push(`Replace with a character, object, or physical event that demonstrates: ${beat.spokenLine}`); }
    if (/character|object|action|react|open|push|move|cross|fall|grab|prop|room|door/.test(text)) eventBeats += 1;
  }
  const visualBeats = beats.length; const score = Math.max(0, Math.round((visualBeats ? (eventBeats / visualBeats) * 100 : 0) - genericPresentationBeats * 18));
  return { score, visualBeats, eventBeats, genericPresentationBeats, penalties, rewrites };
}

export function calculatePresentationLikeScore(input: { chartPrevalence: number; dashboardPrevalence: number; textPrevalence: number; staticCompositionRatio: number; repeatedLayoutRatio: number; abstractGraphicRatio: number; actionDensity: number }): PresentationLikeScore {
  const actionDeficit = Math.max(0, 1 - input.actionDensity); const score = Math.min(1, Number((input.chartPrevalence * 0.2 + input.dashboardPrevalence * 0.2 + input.textPrevalence * 0.16 + input.staticCompositionRatio * 0.18 + input.repeatedLayoutRatio * 0.12 + input.abstractGraphicRatio * 0.1 + actionDeficit * 0.04).toFixed(3)));
  return { ...input, score, actionDeficit, decision: score > 0.58 ? 'FAIL' : score > 0.38 ? 'WARN' : 'PASS' };
}

export function calculateVisualCadenceReport(input: { durationSeconds: number; changes: Array<{ action?: boolean; pose?: boolean; camera?: boolean; prop?: boolean; location?: boolean; reaction?: boolean; reveal?: boolean }>; referenceChangesPerSecond?: number }): VisualCadenceReport {
  const count = (key: 'action' | 'pose' | 'camera' | 'prop' | 'location' | 'reaction' | 'reveal') => input.changes.filter((change) => Boolean(change[key])).length;
  const significantChanges = input.changes.filter((change) => Object.values(change).some(Boolean)).length;
  const changesPerSecond = input.durationSeconds > 0 ? Number((significantChanges / input.durationSeconds).toFixed(3)) : 0;
  const reference = input.referenceChangesPerSecond;
  return { significantChanges, changesPerSecond, actionChanges: count('action'), poseChanges: count('pose'), cameraChanges: count('camera'), propChanges: count('prop'), locationChanges: count('location'), reactionChanges: count('reaction'), revealChanges: count('reveal'), averageShotLength: significantChanges ? Number((input.durationSeconds / significantChanges).toFixed(3)) : input.durationSeconds, comparedWithReference: reference == null ? 'NOT_EVALUATED' : changesPerSecond > reference * 1.15 ? 'ABOVE_REFERENCE' : changesPerSecond >= reference * 0.8 ? 'COMPARABLE' : 'BELOW_REFERENCE' };
}

export function calculateCompetitiveVisualReport(input: { hook: number; actionDensity: number; sceneProgression: number; clarity: number; focalSubject: number; novelty: number; storyReadability: number; referenceFloor?: number }): CompetitiveVisualReport {
  const dimensions = { hook: input.hook, actionDensity: input.actionDensity, sceneProgression: input.sceneProgression, clarity: input.clarity, focalSubject: input.focalSubject, novelty: input.novelty, storyReadability: input.storyReadability };
  const score = Number((Object.values(dimensions).reduce((sum, value) => sum + value, 0) / Object.values(dimensions).length).toFixed(1)); const floor = input.referenceFloor ?? 6.5;
  const evidence = [score >= floor ? 'Core visual dimensions meet the family reference floor.' : 'Core visual dimensions remain below the family reference floor.'];
  if (input.actionDensity < 6) evidence.push('Action density is the main competitive gap.'); if (input.focalSubject < 6) evidence.push('The focal subject is not dominant enough on mobile.');
  return { result: score >= 8 ? 'STRONG' : score >= floor ? 'ACCEPTABLE' : 'BELOW_REFERENCE', score, evidence, dimensions };
}

export function evaluateVisualFormatGates(input: { profile: VisualFormatFamily; narrativeCoverage: VisualNarrativeCoverage[]; actionDensity: number; presentationLike: PresentationLikeScore; competitive: CompetitiveVisualReport; hook: number; visualRelevance: number; visualConsistency: number; legacyExample?: boolean }): VisualFormatGateResult {
  const profile = VISUAL_FORMAT_PROFILES[input.profile]; const reasons: string[] = [];
  const blocking = input.profile !== 'LEGACY_DOCUMENTARY_GRAPHIC';
  const abstract = input.narrativeCoverage.filter((item) => item.classification === 'ABSTRACT').length; const unrelated = input.narrativeCoverage.filter((item) => item.classification === 'UNRELATED').length;
  if (input.legacyExample && blocking) reasons.push('Legacy documentary graphics are not acceptable as an animated visual-first format.');
  if (input.actionDensity < profile.minActionDensity) reasons.push(`Action density ${input.actionDensity.toFixed(2)} is below ${profile.minActionDensity.toFixed(2)}.`);
  if (input.presentationLike.score > profile.maxPresentationLikeScore) reasons.push(`PresentationLikeScore ${input.presentationLike.score.toFixed(2)} exceeds ${profile.maxPresentationLikeScore.toFixed(2)}.`);
  if (unrelated > 0) reasons.push(`${unrelated} beat(s) are unrelated to the narration.`); if (abstract > Math.ceil(input.narrativeCoverage.length * 0.25)) reasons.push('Abstract visuals exceed the allowed share.');
  if (input.competitive.result === 'BELOW_REFERENCE') reasons.push('Competitive visual report is below the reference floor.');
  if (blocking && input.hook < 7) reasons.push('Hook does not meet the visual-first threshold.'); if (blocking && input.visualRelevance < 7) reasons.push('Visual relevance is below the visual-first threshold.'); if (blocking && input.visualConsistency < 7) reasons.push('Visual consistency is below the visual-first threshold.');
  return { status: reasons.length ? 'FAIL' : 'PASS', blocking: Boolean(reasons.length && blocking), reasons };
}

export function calculateFormatProofScore(input: Omit<FormatProofScore, 'total'>): FormatProofScore {
  const weights: Array<[keyof Omit<FormatProofScore, 'total'>, number]> = [['hook', 1.3], ['visualInterest', 1.2], ['narrativeClarity', 1.2], ['actionDensity', 1.1], ['characterAppeal', 0.8], ['visualCoherence', 1.1], ['motion', 1], ['mobileReadability', 1], ['cost', 0.5], ['productionTime', 0.5], ['scalability', 0.9], ['seriesPotential', 0.9], ['thumbnailPotential', 0.8]];
  const total = Number((weights.reduce((sum, [key, weight]) => sum + Number(input[key]) * weight, 0) / weights.reduce((sum, [, weight]) => sum + weight, 0)).toFixed(2));
  return { ...input, total };
}

export function reviewViewerKeepWatching(input: { immediateEvent: boolean; clearFocalSubject: boolean; understandableWithoutText: boolean; meaningfulVisualChange: boolean; nextQuestion: boolean; feelsLikeVideo: boolean; wouldSwipeAway: boolean }): WouldAViewerKeepWatchingReport {
  const answers = { ...input }; const positive = Object.entries(input).filter(([key, value]) => key !== 'wouldSwipeAway' ? value : !value).filter(([, value]) => value).length; const score = Math.round((positive / 7) * 100); const evidence = Object.entries(input).filter(([, value]) => !value).map(([key]) => `Weak signal: ${key}`);
  return { score, answers, evidence, decision: score >= 78 ? 'KEEP_WATCHING' : score >= 56 ? 'BORDERLINE' : 'SWIPE_AWAY' };
}

export function recommendWinningFormat(results: Array<{ format: VisualFormatFamily; score: FormatProofScore; competitive: CompetitiveVisualReport; viewer: WouldAViewerKeepWatchingReport; gates: VisualFormatGateResult }>): { format: VisualFormatFamily | null; rationale: string[] } {
  const eligible = results.filter((item) => item.gates.status === 'PASS' && item.competitive.result !== 'BELOW_REFERENCE');
  if (!eligible.length) return { format: null, rationale: ['No format passed the visual-first gates.'] };
  const winner = [...eligible].sort((a, b) => (b.score.total + b.viewer.score / 20) - (a.score.total + a.viewer.score / 20))[0];
  return { format: winner.format, rationale: [`Highest combined format proof and viewer-retention score: ${winner.score.total}.`, `Competitive result: ${winner.competitive.result}.`, `Viewer decision: ${winner.viewer.decision}.`] };
}
