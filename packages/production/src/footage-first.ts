export type FootageMode = 'FOOTAGE_PRO' | 'ARCHIVAL' | 'IMAGE_LED' | 'GENERATIVE' | 'HYBRID';
export type FootageRightsTier = 'PUBLISHABLE_CONFIRMED' | 'PUBLISHABLE_WITH_ATTRIBUTION' | 'TRANSFORMATIVE_USE_REVIEW' | 'REFERENCE_ONLY' | 'BLOCKED';

export type MovingVideoCandidate = {
  id: string;
  sourceUrl?: string;
  provider?: string;
  rightsTier: FootageRightsTier;
  durationSeconds: number;
  usableDurationSeconds?: number;
  width?: number;
  height?: number;
  entities?: string[];
  actions?: string[];
  sourceAudio?: boolean;
  visualFingerprint?: string;
  sourceKey?: string;
};

export type NativeVideoAvailabilityScore = {
  candidateCount: number;
  publishableCandidateCount: number;
  usableDurationSeconds: number;
  sourceCount: number;
  actionCount: number;
  sourceAudioCandidateCount: number;
  highResolutionCandidateCount: number;
  exactEntityCandidateCount: number;
  visualDiversity: number;
  score: number;
  grade: 'EXCELLENT' | 'GOOD' | 'MARGINAL' | 'POOR';
};

export type FootagePreflight = {
  mode: FootageMode;
  targetDurationSeconds: number;
  movingVideoRatio: number;
  stillImageRatio: number;
  nativeVideo: NativeVideoAvailabilityScore;
  uniqueVideoSegments: number;
  topicGreenlit: boolean;
  wordAlignmentAvailable: boolean;
  defaultMotionEffectDetected: boolean;
  passed: boolean;
  blockers: string[];
};

export type TopicGreenlightInput = { topic: string; hookStrength: number; viewerPromiseClarity: number; storyProgression: number; visualAction: number; thumbnailStrength: number; nativeVideo: NativeVideoAvailabilityScore; historicalSimilarity?: number; };
export type TopicGreenlightReport = { topic: string; passed: boolean; score: number; reasons: string[]; blockers: string[]; };

const publishable = new Set<FootageRightsTier>(['PUBLISHABLE_CONFIRMED', 'PUBLISHABLE_WITH_ATTRIBUTION']);
const clamp = (value: number) => Math.max(0, Math.min(100, value));

export function scoreNativeVideoAvailability(candidates: MovingVideoCandidate[], requiredEntities: string[] = []): NativeVideoAvailabilityScore {
  const usable = candidates.filter((item) => publishable.has(item.rightsTier) && Number(item.usableDurationSeconds ?? item.durationSeconds) > 0);
  const sources = new Set(usable.map((item) => item.sourceKey || item.provider || item.sourceUrl || item.id));
  const actions = new Set(usable.flatMap((item) => item.actions ?? []));
  const fingerprints = new Set(usable.map((item) => item.visualFingerprint || item.id));
  const exactEntityCandidateCount = usable.filter((item) => requiredEntities.length > 0 && requiredEntities.some((entity) => (item.entities ?? []).some((seen) => seen.toLowerCase() === entity.toLowerCase()))).length;
  const usableDurationSeconds = usable.reduce((sum, item) => sum + Number(item.usableDurationSeconds ?? item.durationSeconds), 0);
  const highResolutionCandidateCount = usable.filter((item) => Number(item.width ?? 0) >= 1280 && Number(item.height ?? 0) >= 720).length;
  const sourceAudioCandidateCount = usable.filter((item) => item.sourceAudio === true).length;
  const score = Math.round(clamp(
    Math.min(30, usable.length * 2) + Math.min(20, sources.size * 4) + Math.min(15, actions.size * 3) + Math.min(15, sourceAudioCandidateCount * 3) + Math.min(10, highResolutionCandidateCount) + Math.min(10, fingerprints.size),
  ));
  return { candidateCount: candidates.length, publishableCandidateCount: usable.length, usableDurationSeconds, sourceCount: sources.size, actionCount: actions.size, sourceAudioCandidateCount, highResolutionCandidateCount, exactEntityCandidateCount, visualDiversity: fingerprints.size, score, grade: score >= 75 ? 'EXCELLENT' : score >= 55 ? 'GOOD' : score >= 35 ? 'MARGINAL' : 'POOR' };
}

export function evaluateFootagePro(input: { mode: FootageMode; targetDurationSeconds: number; movingVideoSeconds: number; stillImageSeconds: number; candidates: MovingVideoCandidate[]; requiredEntities?: string[]; topicGreenlit: boolean; wordAlignmentAvailable: boolean; defaultMotionEffectDetected?: boolean; minimumCandidates?: number; }): FootagePreflight {
  const total = Math.max(0.001, input.movingVideoSeconds + input.stillImageSeconds);
  const movingVideoRatio = input.movingVideoSeconds / total;
  const nativeVideo = scoreNativeVideoAvailability(input.candidates, input.requiredEntities);
  const uniqueVideoSegments = new Set(input.candidates.map((item) => item.visualFingerprint || item.id)).size;
  const blockers: string[] = [];
  if (input.mode !== 'FOOTAGE_PRO') blockers.push('FOOTAGE_PRO is required for this validation');
  if (movingVideoRatio < 0.8) blockers.push(`moving-video ratio ${(movingVideoRatio * 100).toFixed(1)}% is below 80%`);
  if (nativeVideo.publishableCandidateCount < (input.minimumCandidates ?? 15)) blockers.push(`only ${nativeVideo.publishableCandidateCount} publishable moving candidates; need ${input.minimumCandidates ?? 15}`);
  if (nativeVideo.usableDurationSeconds < input.targetDurationSeconds * 1.8) blockers.push('usable moving footage does not provide enough editorial choice');
  if (!input.topicGreenlit) blockers.push('topic failed Creative Greenlight');
  if (!input.wordAlignmentAvailable) blockers.push('real word alignment is unavailable');
  if (input.defaultMotionEffectDetected) blockers.push('default fake motion effect detected');
  return { mode: input.mode, targetDurationSeconds: input.targetDurationSeconds, movingVideoRatio, stillImageRatio: 1 - movingVideoRatio, nativeVideo, uniqueVideoSegments, topicGreenlit: input.topicGreenlit, wordAlignmentAvailable: input.wordAlignmentAvailable, defaultMotionEffectDetected: Boolean(input.defaultMotionEffectDetected), passed: blockers.length === 0, blockers };
}

export function evaluateTopicGreenlight(input: TopicGreenlightInput): TopicGreenlightReport {
  const score = Math.round((input.hookStrength + input.viewerPromiseClarity + input.storyProgression + input.visualAction + input.thumbnailStrength + input.nativeVideo.score) / 6);
  const reasons: string[] = [];
  const blockers: string[] = [];
  if (input.hookStrength >= 70) reasons.push('hook has a clear click mechanism'); else blockers.push('hook is not strong enough');
  if (input.viewerPromiseClarity >= 70) reasons.push('viewer promise is immediately legible'); else blockers.push('viewer promise is vague');
  if (input.storyProgression >= 65) reasons.push('topic supports information or event progression'); else blockers.push('topic lacks progression');
  if (input.visualAction >= 70) reasons.push('visual world contains actions or change'); else blockers.push('visual world is too static');
  if (input.thumbnailStrength >= 65) reasons.push('thumbnail can communicate one visual idea'); else blockers.push('thumbnail promise is weak');
  if (input.nativeVideo.grade === 'POOR') blockers.push('native moving-video availability is poor');
  if (Number(input.historicalSimilarity ?? 0) >= 0.55) blockers.push('topic is too similar to recent rejected work');
  return { topic: input.topic, passed: blockers.length === 0 && score >= 68, score, reasons, blockers };
}

export type KaraokeWord = { word: string; startTime: number; endTime: number; confidence: number };
export type KaraokeChunk = { words: KaraokeWord[]; startTime: number; endTime: number };

export function validateWordAlignment(words: KaraokeWord[]): boolean {
  return words.length > 0 && words.every((word, index) => word.word.trim() && Number.isFinite(word.startTime) && Number.isFinite(word.endTime) && word.endTime > word.startTime && word.confidence >= 0 && word.confidence <= 1 && (index === 0 || word.startTime >= words[index - 1].startTime));
}

export function buildKaraokeChunks(words: KaraokeWord[], maxWords = 5): KaraokeChunk[] {
  if (!validateWordAlignment(words)) throw new Error('Invalid word alignment');
  const chunks: KaraokeChunk[] = [];
  for (let index = 0; index < words.length; index += maxWords) {
    const group = words.slice(index, index + maxWords);
    chunks.push({ words: group, startTime: group[0].startTime, endTime: group.at(-1)!.endTime });
  }
  return chunks;
}

export function activeKaraokeWord(chunk: KaraokeChunk, timestampSeconds: number): number {
  const index = chunk.words.findIndex((word) => timestampSeconds >= word.startTime && timestampSeconds < word.endTime);
  return index;
}

export function classifyCreativeHistory(score: number, tags: string[]) {
  return { humanScore: score, humanStatus: score <= 5 ? 'REJECTED' as const : 'REVIEWED' as const, positiveTrainingExample: score >= 7, tags, trainingRole: score <= 5 ? 'NEGATIVE_FIXTURE_ONLY' as const : 'CONTEXTUAL_TRAINING' as const };
}
