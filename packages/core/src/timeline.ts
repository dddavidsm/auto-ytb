export type NarrationSegment = { id: string; startSeconds: number; durationSeconds: number; text: string; beatId?: string };
export type TimelineScene = { id: string; startSeconds: number; durationSeconds: number; kind: string; narrationSegmentIds?: string[]; visualObjective?: string };
export type AudioCue = { id: string; kind: 'MUSIC' | 'SFX' | 'VOICE'; startSeconds: number; durationSeconds: number; gain?: number; source?: string };
export type CaptionCue = { id: string; startSeconds: number; endSeconds: number; text: string; narrationSegmentId?: string };
export type ProductionTimeline = { narration: NarrationSegment[]; scenes: TimelineScene[]; audio: AudioCue[]; captions: CaptionCue[] };

export type TimelineMismatch = { type: 'GAP' | 'OVERLAP' | 'VISUAL_MISMATCH' | 'EXCESS_STILL' | 'AUDIO_CLIPPING_PROXY'; startSeconds: number; endSeconds: number; ids: string[]; message: string; suggestedFix: 'EXTEND' | 'SPLIT' | 'SECONDARY_VISUAL' | 'RETIME' | 'REGENERATE' | 'BROLL' | 'DUCK_AUDIO' };
export type SynchronizationReport = { pass: boolean; sceneCoverage: number; narrationCoverage: number; timingGapSeconds: number; visualMismatch: number; excessStillDurationSeconds: number; overlaps: number; audioClippingProxy: number; mismatches: TimelineMismatch[]; recommendations: string[] };

const end = (start: number, duration: number) => start + Math.max(0, duration);
const overlap = (aStart: number, aEnd: number, bStart: number, bEnd: number) => Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
const round = (value: number) => Math.round(value * 100) / 100;

export function analyzeSynchronization(timeline: ProductionTimeline): SynchronizationReport {
  const narrationDuration = timeline.narration.reduce((max, item) => Math.max(max, end(item.startSeconds, item.durationSeconds)), 0);
  const sceneDuration = timeline.scenes.reduce((sum, item) => sum + Math.max(0, item.durationSeconds), 0);
  const coveredNarration = timeline.narration.reduce((sum, narration) => {
    const nEnd = end(narration.startSeconds, narration.durationSeconds);
    const covered = timeline.scenes.reduce((inner, scene) => inner + overlap(narration.startSeconds, nEnd, scene.startSeconds, end(scene.startSeconds, scene.durationSeconds)), 0);
    return sum + Math.min(narration.durationSeconds, covered);
  }, 0);
  const coveredScenes = timeline.scenes.reduce((sum, scene) => {
    const sceneEnd = end(scene.startSeconds, scene.durationSeconds);
    const covered = timeline.narration.reduce((inner, narration) => inner + overlap(scene.startSeconds, sceneEnd, narration.startSeconds, end(narration.startSeconds, narration.durationSeconds)), 0);
    return sum + Math.min(scene.durationSeconds, covered);
  }, 0);
  const mismatches: TimelineMismatch[] = [];
  for (const narration of timeline.narration) {
    const nEnd = end(narration.startSeconds, narration.durationSeconds);
    const covered = timeline.scenes.reduce((sum, scene) => sum + overlap(narration.startSeconds, nEnd, scene.startSeconds, end(scene.startSeconds, scene.durationSeconds)), 0);
    if (covered + 0.05 < narration.durationSeconds) mismatches.push({ type: 'GAP', startSeconds: round(narration.startSeconds + covered), endSeconds: round(nEnd), ids: [narration.id], message: `Narration ${narration.id} has ${round(narration.durationSeconds - covered)}s without visual coverage.`, suggestedFix: narration.durationSeconds - covered > 8 ? 'SECONDARY_VISUAL' : 'EXTEND' });
  }
  for (let index = 1; index < timeline.scenes.length; index += 1) {
    const previous = timeline.scenes[index - 1]!;
    const current = timeline.scenes[index]!;
    const previousEnd = end(previous.startSeconds, previous.durationSeconds);
    if (current.startSeconds < previousEnd - 0.05) mismatches.push({ type: 'OVERLAP', startSeconds: current.startSeconds, endSeconds: Math.min(previousEnd, end(current.startSeconds, current.durationSeconds)), ids: [previous.id, current.id], message: `Scenes ${previous.id} and ${current.id} overlap.`, suggestedFix: 'RETIME' });
  }
  for (const scene of timeline.scenes) {
    const sceneEnd = end(scene.startSeconds, scene.durationSeconds);
    const visualCovered = timeline.narration.reduce((sum, narration) => sum + overlap(scene.startSeconds, sceneEnd, narration.startSeconds, end(narration.startSeconds, narration.durationSeconds)), 0);
    if (!visualCovered) mismatches.push({ type: 'VISUAL_MISMATCH', startSeconds: scene.startSeconds, endSeconds: sceneEnd, ids: [scene.id], message: `Scene ${scene.id} is not attached to narration.`, suggestedFix: 'REGENERATE' });
    if (/still|image|ai_image|photo/i.test(scene.kind) && scene.durationSeconds > 8) mismatches.push({ type: 'EXCESS_STILL', startSeconds: scene.startSeconds, endSeconds: sceneEnd, ids: [scene.id], message: `Still scene ${scene.id} lasts ${round(scene.durationSeconds)}s.`, suggestedFix: 'SPLIT' });
  }
  const sortedAudio = [...timeline.audio].sort((a, b) => a.startSeconds - b.startSeconds);
  for (let index = 1; index < sortedAudio.length; index += 1) {
    const previous = sortedAudio[index - 1]!;
    const current = sortedAudio[index]!;
    if (current.kind !== 'VOICE' && previous.kind !== 'VOICE' && current.startSeconds < end(previous.startSeconds, previous.durationSeconds) && Number(current.gain ?? 1) + Number(previous.gain ?? 1) > 1.8) mismatches.push({ type: 'AUDIO_CLIPPING_PROXY', startSeconds: current.startSeconds, endSeconds: Math.min(end(previous.startSeconds, previous.durationSeconds), end(current.startSeconds, current.durationSeconds)), ids: [previous.id, current.id], message: 'Overlapping audio cues exceed the clipping proxy threshold.', suggestedFix: 'DUCK_AUDIO' });
  }
  const gapSeconds = mismatches.filter((item) => item.type === 'GAP').reduce((sum, item) => sum + item.endSeconds - item.startSeconds, 0);
  const stillSeconds = mismatches.filter((item) => item.type === 'EXCESS_STILL').reduce((sum, item) => sum + item.endSeconds - item.startSeconds, 0);
  const recommendations = [...new Set(mismatches.map((item) => `${item.suggestedFix}: ${item.message}`))];
  return { pass: mismatches.every((item) => !['GAP', 'OVERLAP', 'VISUAL_MISMATCH', 'AUDIO_CLIPPING_PROXY'].includes(item.type)), sceneCoverage: round(narrationDuration ? coveredScenes / narrationDuration : 1), narrationCoverage: round(narrationDuration ? coveredNarration / narrationDuration : 1), timingGapSeconds: round(gapSeconds), visualMismatch: mismatches.filter((item) => item.type === 'VISUAL_MISMATCH').length, excessStillDurationSeconds: round(stillSeconds), overlaps: mismatches.filter((item) => item.type === 'OVERLAP').length, audioClippingProxy: mismatches.filter((item) => item.type === 'AUDIO_CLIPPING_PROXY').length, mismatches, recommendations };
}

export function repairTimeline(timeline: ProductionTimeline): { timeline: ProductionTimeline; report: SynchronizationReport } {
  const next: ProductionTimeline = { narration: timeline.narration.map((item) => ({ ...item })), scenes: timeline.scenes.map((item) => ({ ...item })), audio: timeline.audio.map((item) => ({ ...item })), captions: timeline.captions.map((item) => ({ ...item })) };
  const additions: TimelineScene[] = [];
  for (const narration of next.narration) {
    const nEnd = end(narration.startSeconds, narration.durationSeconds);
    const covered = next.scenes.reduce((sum, scene) => sum + overlap(narration.startSeconds, nEnd, scene.startSeconds, end(scene.startSeconds, scene.durationSeconds)), 0);
    if (covered + 0.05 < narration.durationSeconds) {
      const start = narration.startSeconds + covered;
      additions.push({ id: `sync-secondary-${narration.id}`, startSeconds: round(start), durationSeconds: round(narration.durationSeconds - covered), kind: 'secondary_visual', narrationSegmentIds: [narration.id], visualObjective: 'secondary visual added to close narration coverage gap' });
    }
  }
  next.scenes.push(...additions);
  next.scenes.sort((a, b) => a.startSeconds - b.startSeconds);
  for (let index = 1; index < next.scenes.length; index += 1) {
    const previous = next.scenes[index - 1]!;
    const current = next.scenes[index]!;
    const previousEnd = end(previous.startSeconds, previous.durationSeconds);
    if (current.startSeconds < previousEnd) previous.durationSeconds = Math.max(0, round(current.startSeconds - previous.startSeconds));
  }
  return { timeline: next, report: analyzeSynchronization(next) };
}
