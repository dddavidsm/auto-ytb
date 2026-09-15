import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';

const root = process.argv[2] ?? '.data/pro-series-rnd/moss-story-first-20260914225544/director-brain/runway-continuity';
const output = path.join(root, 'MOSS_CHARACTER_SCENE_PROOF_V1_480P.mp4');
const upscale = path.join(root, 'MOSS_CHARACTER_SCENE_PROOF_V1_1080P_UPSCALED.mp4');
const a = path.join(root, 'WAN3_A_TO_B_480P_4S.mp4');
const dialogue = path.join(root, 'WAN3_DIALOGUE_B_480P_4S.mp4');
const c = path.join(root, 'WAN3_B_TO_C_480P_4S.mp4');

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let error = '';
    child.stderr.on('data', (chunk) => { error += String(chunk); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(error.slice(-3000))));
  });
}

await mkdir(root, { recursive: true });
await run([
  '-y', '-i', a, '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-i', dialogue, '-i', c,
  '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
  '-filter_complex',
  '[0:v]fps=30,scale=854:480:force_original_aspect_ratio=decrease,pad=854:480:(ow-iw)/2:(oh-ih)/2,format=yuv420p[v0];' +
  '[1:a]atrim=duration=4,asetpts=N/SR/TB[a0];' +
  '[2:v]fps=30,scale=854:480:force_original_aspect_ratio=decrease,pad=854:480:(ow-iw)/2:(oh-ih)/2,format=yuv420p[v1];' +
  '[2:a]aresample=48000,atrim=duration=4,asetpts=N/SR/TB[a1];' +
  '[3:v]fps=30,scale=854:480:force_original_aspect_ratio=decrease,pad=854:480:(ow-iw)/2:(oh-ih)/2,format=yuv420p[v2];' +
  '[4:a]atrim=duration=4,asetpts=N/SR/TB[a2];' +
  '[v0][a0][v1][a1][v2][a2]concat=n=3:v=1:a=1[outv][outa]',
  '-map', '[outv]', '-map', '[outa]', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', output,
]);
await run(['-y', '-i', output, '-vf', 'scale=1920:1080:flags=lanczos', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-c:a', 'copy', '-movflags', '+faststart', upscale]);

const report = {
  schemaVersion: 1,
  runId: 'MOSS_CHARACTER_SCENE_PROOF_V1',
  status: 'TECHNICAL_EVIDENCE_ONLY',
  humanReviewStatus: 'READY_FOR_HUMAN_REVIEW',
  purpose: 'Validate Runway WAN3 first/last state grounding plus a same-state native-audio acting shot before story production.',
  sequence: [
    { id: 'A_TO_B', file: path.basename(a), startState: 'Moss standing without lantern', endState: 'Moss standing while holding the same lantern', audio: false },
    { id: 'DIALOGUE_B', file: path.basename(dialogue), startState: 'Moss holding the lantern in the workshop', endState: 'same physical state with short native-audio speech', audio: true },
    { id: 'B_TO_C', file: path.basename(c), startState: 'same lantern-held state', endState: 'Moss turns and raises the lantern slightly', audio: false },
  ],
  outputs: { source480p: path.basename(output), presentation1080pUpscaled: path.basename(upscale) },
  durationSeconds: 12,
  sourceResolution: '854x480 / 30fps',
  presentationResolution: '1920x1080 upscale / 30fps',
  generatedCredits: 60,
  failedNoChargeAttempts: 1,
  knownLimitations: [
    'This is a production-grammar proof, not a story short.',
    'Native generated dialogue is present in the middle shot; phoneme-level lip-sync still needs human listening review.',
    'The last transition includes a subtle environment/composition change and must not be treated as series lock without review.',
    'No music, captions, or publication packaging are included.',
  ],
  gate: { fullShort: 'BLOCKED_UNTIL_HUMAN_REVIEW', publicPublication: 'BLOCKED', next: 'Human review of identity, state continuity, physics, audio and lip-sync.' },
  createdAt: new Date().toISOString(),
};
await writeFile(path.join(root, 'MOSS_CHARACTER_SCENE_PROOF_V1.report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
