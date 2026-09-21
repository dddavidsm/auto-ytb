import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluateGeneratedClipQuality } from '../packages/production/dist/index.js';

const execFileAsync = promisify(execFile);
const BLOCKING_ISSUE = /^(?:SUBJECT_MISMATCH|ACTION_MISMATCH|OBJECT_MISMATCH|OBJECT_PERSISTENCE|CAUSE_RESULT_MISMATCH|CHARACTER_DRIFT|WORLD_DRIFT|ANATOMY|PHYSICS|TEMPORAL_INCOHERENCE|MORPHING|ARTIFACT|STYLE_MISMATCH|MOTION_WEAK|TEXT_ARTIFACT)(?::|$)/i;

function localPath(uri) {
  if (String(uri).startsWith('file://')) return fileURLToPath(uri);
  if (/^https?:\/\//i.test(String(uri))) throw new Error('SEMANTIC_QC_LOCAL_VIDEO_REQUIRED');
  return resolve(String(uri));
}

function strength(score, issues = [], issuePatterns = []) {
  if (issues.some((issue) => issuePatterns.some((pattern) => pattern.test(issue)))) return 'WEAK';
  const value = Number(score);
  if (value >= 85) return 'STRONG';
  if (value >= 70) return 'MEDIUM';
  return 'WEAK';
}

export function buildTemporalSemanticPrompt({ shot, characters = [], world = null }) {
  const contract = shot.semanticContract ?? {};
  const characterRules = characters.length
    ? characters.map((character) => `${character.characterId}: ${character.visualDescription}; immutable=${character.immutableTraits?.join(', ') || 'n/a'}; proportions=${character.proportions}; eyes=${character.eyes}; accessories=${character.accessories?.join(', ') || 'none'}`).join(' | ')
    : 'No recurring registered character.';
  const worldRules = world
    ? `${world.worldId}: ${world.visualIdentity}; architecture=${world.architecture}; layout=${world.layout}; lighting=${world.lighting}`
    : 'No persistent registered world.';
  return [
    'You are the strict temporal visual quality gate for an AI-generated production shot.',
    'The supplied image is a chronological contact sheet sampled left-to-right from one video clip. Judge the whole sequence, not a single attractive frame.',
    'Use relevanceScore for whether the exact requested subject/action/object/cause/result are visibly demonstrated across the sequence.',
    'Use continuityScore for identity, geometry, world/style consistency, object persistence and temporal continuity across panels.',
    'Use artifactQualityScore for anatomy, contact, physics, morphing, impossible geometry, visual artifacts and production realism.',
    'Return only material blocker issue codes when present. Allowed prefixes: SUBJECT_MISMATCH, ACTION_MISMATCH, OBJECT_MISMATCH, OBJECT_PERSISTENCE, CAUSE_RESULT_MISMATCH, CHARACTER_DRIFT, WORLD_DRIFT, ANATOMY, PHYSICS, TEMPORAL_INCOHERENCE, MORPHING, ARTIFACT, STYLE_MISMATCH, MOTION_WEAK, TEXT_ARTIFACT. Use an empty issues array when there is no material defect.',
    `Shot purpose: ${shot.narrativePurpose}.`,
    `Primary subject: ${shot.primarySubject}.`,
    `Required action: ${contract.action ?? shot.action}.`,
    `Required object: ${contract.object ?? 'none specified'}.`,
    `Cause: ${contract.cause ?? 'none specified'}. Result: ${contract.result ?? 'none specified'}. Emotion: ${contract.emotion ?? shot.emotion ?? 'natural'}.`,
    `Visual description: ${shot.visualDescription}.`,
    `Target framing/camera/motion: ${shot.framing}; ${shot.camera}; ${shot.motion}.`,
    `Realism/style target: ${shot.realismTarget}; ${shot.styleTarget}.`,
    `Character identity rules: ${characterRules}`,
    `World identity rules: ${worldRules}`,
    'A high score requires visible evidence. Do not infer an action merely because the subject is present. If the requested interaction is not visually demonstrated, emit ACTION_MISMATCH or OBJECT_MISMATCH and score relevance below 70.',
  ].join('\n');
}

export async function extractTemporalContactSheet({ videoUri, durationSeconds, outputPath, frameCount = 4, ffmpeg = 'ffmpeg' }) {
  const source = localPath(videoUri);
  const target = resolve(outputPath);
  await mkdir(dirname(target), { recursive: true });
  const duration = Math.max(0.5, Number(durationSeconds || 0));
  const count = Math.max(3, Math.min(6, Math.floor(frameCount)));
  const fps = Math.max(0.05, count / duration);
  const filter = `fps=${fps.toFixed(6)},scale=320:-2:flags=lanczos,tile=${count}x1:padding=4:margin=4:color=black`;
  await execFileAsync(ffmpeg, ['-y', '-i', source, '-vf', filter, '-frames:v', '1', '-q:v', '3', target], { windowsHide: true });
  return { imageData: new Uint8Array(await readFile(target)), mimeType: 'image/jpeg', outputPath: target, frameCount: count };
}

export function mapVisionEvaluationToGeneratedClipQuality({ evaluation, shot, world = null, technicalValidity = true, technicalIssues = [], method = 'temporal-contact-sheet-vision' }) {
  const issues = [...new Set([...(technicalIssues ?? []), ...(evaluation.issues ?? []).filter((issue) => BLOCKING_ISSUE.test(String(issue)))].map(String))];
  const relevance = Number(evaluation.relevanceScore ?? 0);
  const continuity = Number(evaluation.continuityScore ?? 0);
  const artifact = Number(evaluation.artifactQualityScore ?? 0);
  const hasCharacter = Boolean(shot.characterIds?.length);
  const hasWorld = Boolean(world || shot.worldId);
  return evaluateGeneratedClipQuality({
    technicalValidity,
    subjectCorrectness: strength(relevance, issues, [/^SUBJECT_MISMATCH/i]),
    actionCorrectness: strength(relevance, issues, [/^ACTION_MISMATCH/i, /^OBJECT_/i, /^CAUSE_RESULT_MISMATCH/i]),
    characterIdentity: hasCharacter ? strength(continuity, issues, [/^CHARACTER_DRIFT/i]) : 'NOT_APPLICABLE',
    worldIdentity: hasWorld ? strength(continuity, issues, [/^WORLD_DRIFT/i]) : 'NOT_APPLICABLE',
    temporalCoherence: strength(Math.min(continuity, artifact), issues, [/^TEMPORAL_INCOHERENCE/i, /^MORPHING/i, /^OBJECT_PERSISTENCE/i]),
    physics: strength(artifact, issues, [/^PHYSICS/i, /^ANATOMY/i, /^OBJECT_PERSISTENCE/i]),
    styleMatch: strength(continuity, issues, [/^STYLE_MISMATCH/i]),
    motion: strength(Math.min(continuity, artifact), issues, [/^MOTION_WEAK/i, /^TEMPORAL_INCOHERENCE/i]),
    artifactIssues: issues,
    method,
    qualityFloor: shot.qualityFloor,
  });
}

export async function evaluateGeneratedClipSemanticQc({ asset, shot, characters = [], world = null, visionProvider, workDir, technicalValidity = true, technicalIssues = [], extractContactSheet = extractTemporalContactSheet }) {
  if (!visionProvider) throw new Error('SEMANTIC_VIDEO_QC_PROVIDER_REQUIRED');
  if (!asset?.uri || !asset?.mimeType?.startsWith('video/')) throw new Error('SEMANTIC_VIDEO_QC_VIDEO_REQUIRED');
  const contactSheet = await extractContactSheet({
    videoUri: asset.uri,
    durationSeconds: Number(asset.metadata?.generatedDurationSeconds ?? shot.desiredDurationSeconds),
    outputPath: resolve(workDir, `${shot.shotId}-temporal-qc.jpg`),
    frameCount: 4,
  });
  const prompt = buildTemporalSemanticPrompt({ shot, characters, world });
  const evaluation = await visionProvider.evaluate({ prompt, imageData: contactSheet.imageData, mimeType: contactSheet.mimeType });
  const quality = mapVisionEvaluationToGeneratedClipQuality({ evaluation, shot, world, technicalValidity, technicalIssues });
  return {
    quality,
    evidence: {
      provider: visionProvider.name,
      contactSheetPath: contactSheet.outputPath,
      sampledFrames: contactSheet.frameCount,
      observedMeaning: evaluation.observedMeaning,
      relevanceScore: evaluation.relevanceScore,
      continuityScore: evaluation.continuityScore,
      artifactQualityScore: evaluation.artifactQualityScore,
      issues: evaluation.issues ?? [],
      usage: evaluation.usage ?? null,
      method: quality.method,
    },
  };
}
