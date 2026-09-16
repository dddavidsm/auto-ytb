export type VisualIntent = {
  requiredEntities: string[];
  preferredEntities: string[];
  requiredActions: string[];
  preferredActions: string[];
  location?: string;
  shotPreferences: string[];
  semanticGoal: string;
  avoid: string[];
  queries: string[];
};

export type WordTiming = { word: string; startTime: number; endTime: number; confidence?: number | null };

export type NarrationUnit = {
  id: string;
  storyBeatId: string;
  text: string;
  startTime: number;
  endTime: number;
  words: WordTiming[];
  importance: 'CRITICAL' | 'HIGH' | 'NORMAL';
  visualIntent: VisualIntent;
  alignmentConfidence: number;
};

export type SegmentSemanticProfile = {
  segmentId: string;
  assetId: string;
  startTime: number;
  endTime: number;
  duration: number;
  representativeFrames: string[];
  entities: string[];
  people: string[];
  objects: string[];
  actions: string[];
  environment: string[];
  location: string[];
  visibleText: string[];
  cameraDistance: string;
  cameraMovement: string;
  motionLevel: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
  visualQuality: 'POOR' | 'FAIR' | 'GOOD' | 'EXCELLENT' | 'UNKNOWN';
  sourceAudioUseful: 'NONE' | 'AMBIENCE' | 'MECHANICAL' | 'DIALOGUE' | 'IMPACT' | 'MUSIC' | 'NOISY' | 'UNKNOWN';
  semanticDescription: string;
  confidence: number;
  provenance: { method: string; model?: string; sampledFrames: number; analyzedAt: string };
  usableStartTime?: number;
  usableEndTime?: number;
  actionOnsetTime?: number | null;
  actionPeakTime?: number | null;
  temporalConfidence?: number;
  temporalEvidence?: string;
  rightsTier?: string;
  sourceKey?: string;
  sourceUrl?: string;
};

export function segmentMediaRange(segment: SegmentSemanticProfile): { startTime: number; endTime: number; duration: number } {
  const startTime = Number.isFinite(segment.usableStartTime) ? Math.max(segment.startTime, Number(segment.usableStartTime)) : segment.startTime;
  const endTime = Number.isFinite(segment.usableEndTime) ? Math.min(segment.endTime, Number(segment.usableEndTime)) : segment.endTime;
  const safeEnd = endTime > startTime ? endTime : segment.endTime;
  return { startTime, endTime: safeEnd, duration: Math.max(0, safeEnd - startTime) };
}

export type MatchClassification = 'EXACT' | 'STRONG' | 'CONTEXTUAL' | 'WEAK' | 'WRONG';

export type MatchCandidate = {
  segment: SegmentSemanticProfile;
  classification: MatchClassification;
  score: number;
  confidence: number;
  components: {
    entityMatch: number;
    actionMatch: number;
    semanticMatch: number;
    temporalRelevance: number;
    locationMatch: number;
    shotUsability: number;
    motion: number;
    quality: number;
    sourceAudioValue: number;
    novelty: number;
    repetitionPenalty: number;
    sourceConcentrationPenalty: number;
    rights: number;
  };
  explanation: string[];
};

/** Parse ffmpeg showinfo scene timestamps into real shot boundaries. */
export function parseShotBoundaries(showInfo: string, duration: number, minimumShotSeconds = 0.8): Array<{ startTime: number; endTime: number; duration: number }> {
  const points = [...String(showInfo ?? '').matchAll(/pts_time:([0-9]+(?:\.[0-9]+)?)/g)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value > 0 && value < duration)
    .sort((a, b) => a - b);
  const boundaries = [0, ...points, Math.max(0, duration)]
    .filter((value, index, values) => index === 0 || value - values[index - 1] > 0.05);
  const shots: Array<{ startTime: number; endTime: number; duration: number }> = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const startTime = boundaries[index]; const endTime = boundaries[index + 1]; const shotDuration = endTime - startTime;
    if (shotDuration >= minimumShotSeconds) shots.push({ startTime, endTime, duration: shotDuration });
  }
  return shots.length ? shots : [{ startTime: 0, endTime: Math.max(0, duration), duration: Math.max(0, duration) }];
}

const tokenise = (value: unknown) => [...new Set(String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(/\s+/).filter((token) => token.length > 2 || ['m', 'km', 'h', 'g'].includes(token) || /^\d+$/.test(token)))];
const numberTens = new Set(['twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']);
const numberUnits = new Set(['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']);
const numberUnitValues: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const numberSmallValues: Record<string, number> = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
function fuzzyTokenMatch(expected: string, actual: string) {
  if (expected.length < 5 || actual.length < 4) return false;
  const previous = Array.from({ length: actual.length + 1 }, (_, index) => index);
  for (let row = 1; row <= expected.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= actual.length; column += 1) current[column] = Math.min(current[column - 1] + 1, previous[column] + 1, previous[column - 1] + (expected[row - 1] === actual[column - 1] ? 0 : 1));
    for (let column = 0; column <= actual.length; column += 1) previous[column] = current[column];
  }
  return previous[actual.length] <= Math.max(2, Math.floor(expected.length * 0.32));
}
const overlap = (requested: string[], observed: string[]) => {
  const observedTokens = new Set(observed.flatMap(tokenise));
  return requested.length ? requested.filter((item) => tokenise(item).some((token) => observedTokens.has(token))).length / requested.length : 0;
};
const qualityValue = (quality: SegmentSemanticProfile['visualQuality']) => ({ POOR: 0.15, FAIR: 0.45, GOOD: 0.75, EXCELLENT: 1, UNKNOWN: 0.35 }[quality]);
const motionValue = (motion: SegmentSemanticProfile['motionLevel']) => ({ NONE: 0, LOW: 0.25, MEDIUM: 0.6, HIGH: 1, UNKNOWN: 0.35 }[motion]);
const audioValue = (audio: SegmentSemanticProfile['sourceAudioUseful']) => ({ NONE: 0, AMBIENCE: 0.45, MECHANICAL: 0.8, DIALOGUE: 1, IMPACT: 0.8, MUSIC: 0.2, NOISY: 0.1, UNKNOWN: 0.25 }[audio]);

export function normalizeVisualIntent(value: unknown, fallbackEntities: string[] = []): VisualIntent {
  if (value && typeof value === 'object') {
    const raw = value as Record<string, unknown>;
    const list = (item: unknown) => Array.isArray(item) ? item.map(String).filter(Boolean) : [];
    return {
      requiredEntities: list(raw.requiredEntities).length ? list(raw.requiredEntities) : fallbackEntities,
      preferredEntities: list(raw.preferredEntities), requiredActions: list(raw.requiredActions), preferredActions: list(raw.preferredActions),
      location: raw.location ? String(raw.location) : undefined, shotPreferences: list(raw.shotPreferences), semanticGoal: String(raw.semanticGoal ?? ''), avoid: list(raw.avoid), queries: list(raw.queries),
    };
  }
  return { requiredEntities: fallbackEntities, preferredEntities: [], requiredActions: [], preferredActions: [], shotPreferences: [], semanticGoal: String(value ?? ''), avoid: [], queries: [] };
}

function tokenMatches(expected: string, actual: string) {
  const left = tokenise(expected); const right = new Set(tokenise(actual));
  return left.length > 0 && left.every((token) => {
    const numericMatch = numberTens.has(token) && [...right].some((candidate) => /^\d{2}$/.test(candidate) && candidate.startsWith(String(['twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'].indexOf(token) + 2)));
    const unitNumericMatch = numberUnits.has(token) && [...right].some((candidate) => /^\d$/.test(candidate) && Number(candidate) === numberUnitValues[token]);
    const smallNumericMatch = numberSmallValues[token] != null && [...right].some((candidate) => /^\d{1,2}$/.test(candidate) && Number(candidate) === numberSmallValues[token]);
    const prefixMatch = [...right].some((candidate) => token.length >= 5 && (candidate.startsWith(token) || token.startsWith(candidate) || fuzzyTokenMatch(token, candidate)));
    const abbreviationMatch = (token === 'meter' || token === 'meters') && right.has('m') || (token === 'kilometer' || token === 'kilometers') && right.has('km') || (token === 'mile' || token === 'miles') && right.has('mph') || token === 'grams' && right.has('g');
    return right.has(token) || numericMatch || unitNumericMatch || smallNumericMatch || prefixMatch || abbreviationMatch;
  });
}

function locatePhrase(phrase: string, words: WordTiming[], cursor: number) {
  const wanted = tokenise(phrase); const matches: WordTiming[] = []; let index = cursor; let unresolved = 0;
  for (let tokenIndex = 0; tokenIndex < wanted.length; tokenIndex += 1) {
    const token = wanted[tokenIndex];
    let found = -1;
    for (let candidate = index; candidate < Math.min(words.length, index + 12); candidate += 1) if (tokenMatches(token, words[candidate].word)) { found = candidate; break; }
    if (found < 0) {
      const nextKnown = wanted.slice(tokenIndex + 1).map((candidate) => words.slice(index, Math.min(words.length, index + 8)).findIndex((word) => tokenMatches(candidate, word.word))).findIndex((candidate) => candidate >= 0);
      if (nextKnown < 0 || !words[index]) throw new Error(`NARRATION_ALIGNMENT_BLOCKED: could not map phrase token '${token}' after word ${cursor}`);
      matches.push(words[index]); index += 1; unresolved += 1; continue;
    }
    // If the recognizer omitted the current function word (for example
    // "Once the diver" becoming "Once diver"), do not jump forward to a
    // later occurrence of that word and strand the concrete noun. Keep the
    // real cursor anchored so the next phrase token can match the observed
    // word.
    const nextWanted = wanted[tokenIndex + 1];
    if (found > index && nextWanted && tokenMatches(nextWanted, words[index].word)) {
      unresolved += 1;
      continue;
    }
    matches.push(words[found]); index = found + 1;
    const observedTokens = tokenise(words[found].word);
    while (observedTokens.includes(wanted[tokenIndex + 1] ?? '')) tokenIndex += 1;
    if (/\//.test(words[found].word) && /kilometer|mile|meter/i.test(token) && wanted[tokenIndex + 1] === 'per' && wanted[tokenIndex + 2] === 'hour') tokenIndex += 2;
    if (/^mph\.?$/i.test(words[found].word) && /mile/i.test(token) && wanted[tokenIndex + 1] === 'per' && wanted[tokenIndex + 2] === 'hour') tokenIndex += 2;
    // TTS frequently emits “27” where the script says “twenty-seven”. The
    // numeric token represents both written words, so consume the unit too.
    if (numberTens.has(token) && /^\d{2}$/.test(tokenise(words[found].word)[0] ?? '') && numberUnits.has(wanted[tokenIndex + 1] ?? '')) tokenIndex += 1;
  }
  return { matches, next: index, unresolved };
}

const splitPhrases = (text: string) => text.split(/(?<=[,;:])\s+|(?<=[.!?])\s+/).map((value) => value.trim()).filter(Boolean);

export function buildNarrationUnits(beats: Array<{ id: string; narration: string; importance?: string; visualIntent?: unknown; entities?: string[] }>, words: WordTiming[]): NarrationUnit[] {
  const units: NarrationUnit[] = []; let cursor = 0;
  for (const beat of beats) {
    const phrases = splitPhrases(beat.narration);
    for (const [index, text] of phrases.entries()) {
      const located = locatePhrase(text, words, cursor); cursor = located.next;
      const first = located.matches[0]; const last = located.matches.at(-1)!;
      const importance = String(beat.importance ?? '').toUpperCase() === 'CRITICAL' ? 'CRITICAL' : String(beat.importance ?? '').toUpperCase() === 'HIGH' ? 'HIGH' : 'NORMAL';
      units.push({ id: `${beat.id}-u${index + 1}`, storyBeatId: beat.id, text, startTime: first.startTime, endTime: last.endTime, words: located.matches, importance, visualIntent: normalizeVisualIntent(beat.visualIntent, beat.entities ?? []), alignmentConfidence: Math.max(0, located.matches.reduce((sum, word) => sum + Number(word.confidence ?? 0.7), 0) / located.matches.length - located.unresolved * 0.12) });
    }
  }
  return units;
}

export function matchSemanticFootage(unit: NarrationUnit, segments: SegmentSemanticProfile[], options: { usedSourceKeys?: string[]; usedFingerprints?: string[]; sourceCounts?: Record<string, number> } = {}): MatchCandidate[] {
  const usedSources = new Set(options.usedSourceKeys ?? []); const usedFingerprints = new Set(options.usedFingerprints ?? []); const counts = options.sourceCounts ?? {};
  const intent = unit.visualIntent;
  return segments.map((segment) => {
    const observed = [...segment.entities, ...segment.people, ...segment.objects, ...segment.actions, ...segment.environment, ...segment.location, segment.semanticDescription];
    const entityMatch = Math.max(overlap(intent.requiredEntities, [...segment.entities, ...segment.objects, segment.semanticDescription]), overlap(intent.preferredEntities, observed) * 0.7);
    const actionMatch = Math.max(overlap(intent.requiredActions, segment.actions), overlap(intent.preferredActions, segment.actions) * 0.7);
    const semanticMatch = overlap(tokenise(intent.semanticGoal), observed);
    const avoidMatch = overlap(intent.avoid, observed);
    const mediaRange = segmentMediaRange(segment);
    const usableDuration = mediaRange.duration || segment.duration;
    const temporalRelevance = Math.min(1, usableDuration / Math.max(0.8, unit.endTime - unit.startTime));
    const locationMatch = intent.location ? overlap([intent.location], segment.location.concat(segment.environment)) : 0.5;
    const shotUsability = Math.min(1, usableDuration >= Math.min(0.8, unit.endTime - unit.startTime) ? 1 : usableDuration / Math.max(0.8, unit.endTime - unit.startTime));
    const motion = motionValue(segment.motionLevel); const quality = qualityValue(segment.visualQuality); const sourceAudioValue = audioValue(segment.sourceAudioUseful);
    const novelty = usedSources.has(segment.sourceKey ?? '') || usedFingerprints.has(segment.segmentId) ? 0 : 1;
    const repetitionPenalty = usedFingerprints.has(segment.segmentId) ? 1 : 0;
    const sourceConcentrationPenalty = Math.min(1, Number(counts[segment.sourceKey ?? ''] ?? 0) / 3);
    const rights = /PUBLISHABLE|CLEARED|CC|PUBLIC/i.test(String(segment.rightsTier ?? '')) ? 1 : 0;
    const score = Math.round(100 * (entityMatch * 0.23 + actionMatch * 0.23 + semanticMatch * 0.16 + temporalRelevance * 0.06 + locationMatch * 0.04 + shotUsability * 0.06 + motion * 0.07 + quality * 0.06 + sourceAudioValue * 0.03 + novelty * 0.04 + rights * 0.02 - avoidMatch * 0.24 - repetitionPenalty * 0.06 - sourceConcentrationPenalty * 0.05));
    const wrong = rights === 0 || avoidMatch >= 0.25 || (intent.requiredEntities.length > 0 && entityMatch < 0.35) || (intent.requiredActions.length > 0 && actionMatch < 0.35);
    const classification: MatchClassification = wrong ? 'WRONG' : entityMatch >= 0.95 && actionMatch >= (intent.requiredActions.length ? 0.8 : 0.45) && semanticMatch >= 0.45 ? 'EXACT' : score >= 68 ? 'STRONG' : score >= 48 ? 'CONTEXTUAL' : 'WEAK';
    const explanation = [
      `${classification}: entity=${entityMatch.toFixed(2)}, action=${actionMatch.toFixed(2)}, semantic=${semanticMatch.toFixed(2)}, avoid=${avoidMatch.toFixed(2)}`,
      `motion=${segment.motionLevel}, quality=${segment.visualQuality}, source=${segment.sourceKey ?? 'unknown'}`,
      novelty ? 'new visual/source candidate' : 'repetition penalty applied',
    ];
    return { segment, classification, score, confidence: Math.max(0, Math.min(1, segment.confidence * (classification === 'WRONG' ? 0.4 : 0.75 + score / 400))), components: { entityMatch, actionMatch, semanticMatch, avoidMatch, temporalRelevance, locationMatch, shotUsability, motion, quality, sourceAudioValue, novelty, repetitionPenalty, sourceConcentrationPenalty, rights }, explanation };
  }).sort((a, b) => b.score - a.score);
}

export function coverageFromTimeline(units: NarrationUnit[], selected: Array<{ unitId: string; match: MatchCandidate }>) {
  const rows = units.map((unit) => { const item = selected.find((candidate) => candidate.unitId === unit.id); return { unitId: unit.id, narration: unit.text, startTime: unit.startTime, endTime: unit.endTime, visualIntent: unit.visualIntent, selectedSegmentId: item?.match.segment.segmentId ?? null, classification: item?.match.classification ?? 'WRONG', confidence: item?.match.confidence ?? 0, explanation: item?.match.explanation ?? ['No candidate selected'] }; });
  const count = (classification: MatchClassification) => rows.filter((row) => row.classification === classification).length / Math.max(1, rows.length);
  return { rows, ratios: { exact: count('EXACT'), strong: count('STRONG'), contextual: count('CONTEXTUAL'), weak: count('WEAK'), wrong: count('WRONG') } };
}

export function timelineMediaRatios(items: Array<{ startTime: number; endTime: number; visualType: 'REAL_VIDEO' | 'IMAGE' | 'DOCUMENT' | 'GRAPHIC' | 'GENERATED_VIDEO' }>) {
  const totals = { REAL_VIDEO: 0, IMAGE: 0, DOCUMENT: 0, GRAPHIC: 0, GENERATED_VIDEO: 0 };
  for (const item of items) totals[item.visualType] += Math.max(0, item.endTime - item.startTime);
  const total = Object.values(totals).reduce((sum, value) => sum + value, 0) || 1;
  return { seconds: totals, ratios: Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, value / total])) };
}

export function evaluateCreativeGreenlightEvidence(input: { promise: string; hook: { match: MatchCandidate | null; firstFrameEvidence: string }; units: NarrationUnit[]; coverage: ReturnType<typeof coverageFromTimeline>; semanticSegments: SegmentSemanticProfile[]; noveltySimilarity: number; thumbnailEvidence: string; }) {
  const dimensions = {
    viewerPromise: { value: input.promise ? 'INFERRED' : 'UNKNOWN', method: 'creative-brief', evidence: input.promise ? [input.promise] : [], confidence: input.promise ? 0.65 : 0 },
    hook: { value: input.hook.match?.classification ?? 'UNKNOWN', method: 'first-editorial-unit-vs-segment-match', evidence: input.hook.match?.explanation ?? [input.hook.firstFrameEvidence], confidence: input.hook.match?.confidence ?? 0 },
    storyProgression: { value: input.units.length >= 3 && new Set(input.units.map((unit) => unit.text)).size === input.units.length ? 'INFERRED' : 'WEAK', method: 'narration-unit-information-change', evidence: [`${input.units.length} non-duplicate narration units`], confidence: input.units.length >= 3 ? 0.62 : 0.35 },
    novelty: { value: input.noveltySimilarity < 0.35 ? 'STRONG' : input.noveltySimilarity < 0.55 ? 'MARGINAL' : 'REJECT', method: 'creative-history-token-overlap', evidence: [`maxSimilarity=${input.noveltySimilarity}`], confidence: 0.8 },
    visualAction: { value: input.semanticSegments.filter((segment) => segment.motionLevel === 'HIGH' || segment.actions.length > 0).length >= Math.max(1, Math.ceil(Math.min(10, input.units.length) * 0.3)) ? 'STRONG' : 'WEAK', method: 'multimodal-segment-profiles', evidence: [`actionfulSegments=${input.semanticSegments.filter((segment) => segment.actions.length > 0).length}`], confidence: 0.76 },
    mediaDepth: { value: input.coverage.ratios.exact + input.coverage.ratios.strong >= 0.8 ? 'STRONG' : 'REJECT', method: 'final-candidate-match-coverage', evidence: [input.coverage.ratios], confidence: 0.82 },
    payoff: { value: input.units.at(-1)?.importance === 'HIGH' || input.units.at(-1)?.importance === 'CRITICAL' ? 'INFERRED' : 'UNKNOWN', method: 'final-narration-unit-importance', evidence: input.units.at(-1) ? [input.units.at(-1)!.text] : [], confidence: input.units.at(-1) ? 0.5 : 0 },
    thumbnail: { value: input.thumbnailEvidence ? 'INFERRED' : 'UNKNOWN', method: 'thumbnail-director', evidence: input.thumbnailEvidence ? [input.thumbnailEvidence] : [], confidence: input.thumbnailEvidence ? 0.55 : 0 },
  };
  const blockers = Object.entries(dimensions).filter(([, dimension]) => dimension.value === 'REJECT' || dimension.value === 'UNKNOWN' || dimension.value === 'WEAK').map(([key, dimension]) => `${key}:${dimension.value}`);
  return { status: blockers.length === 0 ? 'PASS' : 'REJECT', dimensions, blockers };
}
