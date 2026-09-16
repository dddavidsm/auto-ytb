export type ReferenceMeasurement<T> = { value: T; provenance: 'MEASURED' | 'OBSERVED' | 'INFERRED' | 'UNKNOWN'; source?: string };
export type ReferenceStyleReport = {
  referenceId: string;
  durationSeconds: ReferenceMeasurement<number>;
  shotCount: ReferenceMeasurement<number>;
  medianShotDurationSeconds: ReferenceMeasurement<number>;
  visualChangeFrequencyPerMinute: ReferenceMeasurement<number>;
  footageRatio: ReferenceMeasurement<number>;
  imageRatio: ReferenceMeasurement<number>;
  captionChunkWords: ReferenceMeasurement<number>;
  sourceAudioMoments: ReferenceMeasurement<number>;
  openingDensity: ReferenceMeasurement<number>;
  unknownFields: string[];
};

export type ReferenceShotObservation = { startSeconds: number; endSeconds: number; visualKind: 'VIDEO' | 'IMAGE' | 'GRAPHIC' | 'UNKNOWN'; captions?: { wordCount?: number }; sourceAudio?: boolean };

const median = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b); if (!sorted.length) return 0; const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; };

export function analyzeReferenceStyle(referenceId: string, observations: ReferenceShotObservation[], durationSeconds?: number): ReferenceStyleReport {
  const valid = observations.filter((shot) => Number.isFinite(shot.startSeconds) && Number.isFinite(shot.endSeconds) && shot.endSeconds > shot.startSeconds);
  const duration = Number(durationSeconds ?? valid.at(-1)?.endSeconds ?? 0);
  const durations = valid.map((shot) => shot.endSeconds - shot.startSeconds);
  const videoSeconds = valid.filter((shot) => shot.visualKind === 'VIDEO').reduce((sum, shot) => sum + shot.endSeconds - shot.startSeconds, 0);
  const imageSeconds = valid.filter((shot) => shot.visualKind === 'IMAGE').reduce((sum, shot) => sum + shot.endSeconds - shot.startSeconds, 0);
  const captionCounts = valid.flatMap((shot) => Number.isFinite(shot.captions?.wordCount) ? [Number(shot.captions?.wordCount)] : []);
  const unknownFields: string[] = [];
  if (!valid.length) unknownFields.push('shotCount', 'medianShotDurationSeconds', 'visualChangeFrequencyPerMinute', 'footageRatio', 'imageRatio', 'captionChunkWords', 'sourceAudioMoments');
  if (!duration) unknownFields.push('durationSeconds', 'openingDensity');
  if (!captionCounts.length) unknownFields.push('captionChunkWords');
  return {
    referenceId,
    durationSeconds: { value: duration, provenance: duration ? 'MEASURED' : 'UNKNOWN' },
    shotCount: { value: valid.length, provenance: valid.length ? 'MEASURED' : 'UNKNOWN' },
    medianShotDurationSeconds: { value: median(durations), provenance: durations.length ? 'MEASURED' : 'UNKNOWN' },
    visualChangeFrequencyPerMinute: { value: duration ? valid.length / (duration / 60) : 0, provenance: valid.length && duration ? 'MEASURED' : 'UNKNOWN' },
    footageRatio: { value: duration ? videoSeconds / duration : 0, provenance: duration && valid.length ? 'MEASURED' : 'UNKNOWN' },
    imageRatio: { value: duration ? imageSeconds / duration : 0, provenance: duration && valid.length ? 'MEASURED' : 'UNKNOWN' },
    captionChunkWords: { value: median(captionCounts), provenance: captionCounts.length ? 'MEASURED' : 'UNKNOWN' },
    sourceAudioMoments: { value: valid.filter((shot) => shot.sourceAudio === true).length, provenance: valid.length ? 'OBSERVED' : 'UNKNOWN' },
    openingDensity: { value: valid.filter((shot) => shot.startSeconds < Math.min(30, duration)).length, provenance: duration && valid.length ? 'OBSERVED' : 'UNKNOWN' },
    unknownFields: [...new Set(unknownFields)],
  };
}
