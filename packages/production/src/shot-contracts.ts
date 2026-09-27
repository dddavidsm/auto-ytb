import type { Scene, ScriptBeat, SourceFootage, VideoScript } from './types.js';

export type BeatShotContract = {
  beatId: string;
  startSec: number;
  endSec: number;
  narration: string;
  storyPurpose: ScriptBeat['purpose'];
  requiredEntities: string[];
  requiredActions: string[];
  requiredContext: string[];
  visualIntent: string;
  minimumUsableDurationSec: number;
  critical: boolean;
  preferredQueries: string[];
  forbiddenConcepts: string[];
};

export type ShotCoverageRow = {
  beatId: string;
  contract: BeatShotContract;
  sceneIds: string[];
  sourceIds: string[];
  movingSourceCount: number;
  clearedSourceCount: number;
  usableDurationSec: number;
  semanticMatch: number;
  status: 'PASS' | 'REVIEW' | 'BLOCKED';
  reasons: string[];
};

export type ShotCoverageReport = {
  passed: boolean;
  beatCoverageRatio: number;
  timelineCoverageRatio: number;
  rows: ShotCoverageRow[];
  blockers: string[];
};

const STOP_WORDS = new Set('a about after again all also an and are as at be because before been being but by can could did do does for from had has have how i if in into is it its just may more most no not of on or our over so than that the their them there these they this through to under up us was we were what when where which who will with would you your'.split(' '));
const ACTION_WORDS = new Set('build built change changing connect connected convert create created cool cooling deliver drive generate move power produce store transform transmit use using turn run running grow expand'.split(' '));
const CONTEXT_WORDS = new Set('center centre facility farm grid plant system infrastructure network market city laboratory lab room factory field platform road ocean space home office region'.split(' '));

function words(value: unknown): string[] {
  return [...new Set(String(value ?? '').toLowerCase().replace(/[^a-z0-9áéíóúüñ]+/gi, ' ').split(/\s+/).filter((word) => word.length >= 4 && !STOP_WORDS.has(word)))];
}

function selectByLexicon(value: string, lexicon: Set<string>): string[] { return words(value).filter((word) => lexicon.has(word)); }
function queryTerms(value: string): string[] { return words(value).filter((word) => word.length >= 5).slice(0, 8); }
function beatSceneId(scene: Scene, beat: ScriptBeat): boolean { return scene.id === beat.id || scene.id.startsWith(`${beat.id}-s`); }

export function buildShotContracts(script: VideoScript): BeatShotContract[] {
  return script.beats.map((beat, index) => {
    const text = `${beat.narration} ${beat.visualIntent} ${beat.onScreenText ?? ''}`;
    const entities = queryTerms(beat.visualIntent || beat.narration).slice(0, 6);
    const actions = selectByLexicon(text, ACTION_WORDS);
    const context = selectByLexicon(text, CONTEXT_WORDS);
    const forbiddenConcepts = /no |without |never |avoid /i.test(text)
      ? text.split(/[.!?]/).filter((part) => /no |without |never |avoid /i.test(part)).flatMap((part) => queryTerms(part)).slice(0, 8)
      : [];
    return {
      beatId: beat.id,
      startSec: Number(beat.startSec ?? 0),
      endSec: Number(beat.startSec ?? 0) + Math.max(0.2, Number(beat.targetDurationSec ?? 0.2)),
      narration: beat.narration,
      storyPurpose: beat.purpose,
      requiredEntities: entities,
      requiredActions: actions,
      requiredContext: context,
      visualIntent: beat.visualIntent,
      minimumUsableDurationSec: Math.max(0.2, Math.min(8, Number(beat.targetDurationSec ?? 0.2) * 0.55)),
      critical: index === 0 || beat.purpose === 'evidence' || beat.purpose === 'reveal' || beat.purpose === 'payoff',
      preferredQueries: [`${queryTerms(beat.visualIntent).join(' ')} real moving footage`, `${queryTerms(`${beat.narration} ${context.join(' ')}`).join(' ')} documentary video`].filter((query) => query.trim().length > 8),
      forbiddenConcepts,
    };
  });
}

function sourceText(source: SourceFootage): string { return `${source.title ?? ''} ${source.sourceId ?? ''} ${source.license ?? ''}`.toLowerCase(); }
function semanticMatch(contract: BeatShotContract, source: SourceFootage): number {
  const terms = [...new Set([...contract.requiredEntities, ...contract.requiredActions, ...contract.requiredContext])];
  if (!terms.length) return 0.25;
  return Math.min(1, terms.filter((term) => sourceText(source).includes(term)).length / Math.max(2, Math.min(terms.length, 5)));
}

export function evaluateShotCoverage(input: { script: VideoScript; scenes: Scene[]; sourceFootage: SourceFootage[]; requireCleared?: boolean; minimumBeatCoverage?: number }): ShotCoverageReport {
  const contracts = buildShotContracts(input.script);
  const sources = new Map(input.sourceFootage.map((source) => [source.id, source]));
  const rows = contracts.map((contract) => {
    const beats = input.script.beats.filter((beat) => beat.id === contract.beatId);
    const scenes = input.scenes.filter((scene) => scene.kind === 'broll' && beats.some((beat) => beatSceneId(scene, beat)));
    const sourceIds = [...new Set(scenes.map((scene) => scene.sourceFootageId).filter((id): id is string => Boolean(id)))];
    const selected = sourceIds.map((id) => sources.get(id)).filter((source): source is SourceFootage => Boolean(source));
    const cleared = selected.filter((source) => source.rightsStatus === 'CLEARED');
    const usableDurationSec = selected.reduce((sum, source) => sum + Math.max(0, Number(source.endSec ?? 0) - Number(source.startSec ?? 0)), 0);
    const semantic = selected.length ? Math.max(...selected.map((source) => semanticMatch(contract, source))) : 0;
    const reasons: string[] = [];
    const hardReasons: string[] = [];
    if (!scenes.length) hardReasons.push('no moving-footage scene was planned for this beat');
    if (!selected.length) hardReasons.push('no source asset is attached to the planned scene');
    if (input.requireCleared !== false && cleared.length !== selected.length) hardReasons.push('one or more attached sources are not rights-cleared');
    if (selected.length && selected.every((source) => source.endSec != null && Number(source.endSec) - Number(source.startSec ?? 0) < contract.minimumUsableDurationSec)) hardReasons.push('attached source window is shorter than the shot contract');
    reasons.push(...hardReasons);
    if (contract.requiredEntities.length && selected.length && semantic < 0.15) reasons.push('source metadata does not semantically match the beat contract');
    const status: ShotCoverageRow['status'] = hardReasons.length ? 'BLOCKED' : reasons.length ? 'REVIEW' : 'PASS';
    return { beatId: contract.beatId, contract, sceneIds: scenes.map((scene) => scene.id), sourceIds, movingSourceCount: selected.length, clearedSourceCount: cleared.length, usableDurationSec, semanticMatch: Number(semantic.toFixed(3)), status, reasons };
  });
  const minimum = Math.max(0.5, Math.min(1, Number(input.minimumBeatCoverage ?? 1)));
  const coveredRows = rows.filter((row) => row.status !== 'BLOCKED').length;
  const timelineCoverageRatio = rows.length ? rows.filter((row) => row.status !== 'BLOCKED' && row.usableDurationSec >= row.contract.minimumUsableDurationSec).length / rows.length : 0;
  const blockers = rows.filter((row) => row.status === 'BLOCKED' || (row.contract.critical && row.status !== 'PASS')).map((row) => `${row.beatId}: ${row.reasons.join('; ')}`);
  const hardBlockers = rows.filter((row) => row.status === 'BLOCKED').map((row) => `${row.beatId}: ${row.reasons.join('; ')}`);
  return { passed: hardBlockers.length === 0 && (rows.length === 0 || coveredRows / rows.length >= minimum), beatCoverageRatio: rows.length ? Number((coveredRows / rows.length).toFixed(3)) : 0, timelineCoverageRatio: Number(timelineCoverageRatio.toFixed(3)), rows, blockers: hardBlockers };
}
