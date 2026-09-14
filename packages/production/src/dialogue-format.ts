export type DialogueFormatEvidence = {
  speakerCount?: number;
  speakingCharacterCount?: number;
  lipSync?: string;
  voiceDiversity?: string;
  motionCoverage?: number;
  staticImageCoverage?: number;
  cameraShotTypes?: string[];
  reactionShotCount?: number;
  captionStyle?: string;
  presentationLikeScore?: number;
  pipContinuity?: string;
};

export type DialogueFormatGate = {
  status: 'PASS' | 'FAIL';
  format: 'DIALOGUE_ANIMATED_STORY';
  blockers: string[];
  evidence: DialogueFormatEvidence;
};

const value = (input: unknown) => String(input ?? '').trim().toUpperCase();

/** Strictly prevents a documentary/slideshow render passing as dialogue animation. */
export function evaluateDialogueCharacterFormatGate(input: DialogueFormatEvidence): DialogueFormatGate {
  const blockers: string[] = [];
  if (Number(input.speakerCount ?? 0) < 2) blockers.push('requires at least two speakers');
  if (Number(input.speakingCharacterCount ?? 0) < 2) blockers.push('requires two visible speaking characters');
  if (!['PASS', 'REAL'].includes(value(input.lipSync))) blockers.push('real lip sync is missing');
  if (!['PASS', 'REAL'].includes(value(input.voiceDiversity))) blockers.push('distinct character voices are missing');
  if (Number(input.motionCoverage ?? 0) < 0.55) blockers.push('true character motion is below 55%');
  if (Number(input.staticImageCoverage ?? 1) > 0.25) blockers.push('static-image coverage is too high');
  const shots = new Set((input.cameraShotTypes ?? []).map(value));
  if (!['TWO_SHOT', 'SHOT_REVERSE_SHOT'].some((shot) => shots.has(shot))) blockers.push('dialogue camera grammar is missing');
  if (Number(input.reactionShotCount ?? 0) < 1) blockers.push('reaction shot is missing');
  if (!['BURNED_VIRAL', 'LARGE_BURNED'].includes(value(input.captionStyle))) blockers.push('competitive burned-in captions are missing');
  if (Number(input.presentationLikeScore ?? 1) > 0.22) blockers.push('presentation-like language is too prevalent');
  if (!['PASS', 'REAL'].includes(value(input.pipContinuity))) blockers.push('Pip identity lock is not proven');
  return { status: blockers.length ? 'FAIL' : 'PASS', format: 'DIALOGUE_ANIMATED_STORY', blockers, evidence: input };
}

export function buildDialogueFormatDNA(input: Partial<DialogueFormatEvidence> = {}) {
  return {
    formatFamily: 'DIALOGUE_ANIMATED_STORY',
    dialogueRatio: input.speakingCharacterCount && input.speakerCount ? Math.min(1, input.speakingCharacterCount / input.speakerCount) : 0,
    trueCharacterMotionRatio: Number(input.motionCoverage ?? 0),
    staticImageRatio: Number(input.staticImageCoverage ?? 0),
    cameraGrammar: input.cameraShotTypes ?? [],
    reactionShotRate: Number(input.reactionShotCount ?? 0),
    captionGrammar: input.captionStyle ?? 'UNKNOWN',
    presentationLikeScore: Number(input.presentationLikeScore ?? 1),
    identityLock: input.pipContinuity ?? 'UNKNOWN',
  };
}
