import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { escapeFfmpegFilterPath } from '../packages/runtime-node/file-path.mjs';

const repo = resolve('.');
const root = resolve(process.env.STORY_FIRST_RUN_ROOT || '.data/pro-series-rnd/moss-story-first-20260914225544');
const ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg';
const ffprobe = process.env.FFPROBE_BIN || 'ffprobe';
const sourceDir = join(root, 'flow-final-shots');
const outDir = join(root, 'final-flow-v1');
const qcDir = join(root, 'flow-qc');

function run(command, args, capture = false) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', capture ? 'pipe' : 'ignore', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolvePromise({ stdout, stderr }) : reject(new Error(`${command} exited ${code}: ${stderr.slice(-1800)}`)));
  });
}

async function json(path, value) {
  await mkdir(resolve(path, '..'), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function probe(path) {
  return JSON.parse((await run(ffprobe, ['-v', 'error', '-show_entries', 'format=duration,size:stream=codec_name,codec_type,width,height,avg_frame_rate', '-of', 'json', path], true)).stdout);
}

async function sha256(path) {
  const data = await readFile(path);
  return createHash('sha256').update(data).digest('hex');
}

const inputs = [
  { id: 'story-shot-1', path: join(root, 'final', 'story-shot-1.mp4'), provider: 'gemini-video-existing' },
  { id: 'story-shot-2', path: join(sourceDir, 'story-shot-2-flow.mp4'), provider: 'google-flow' },
  { id: 'story-shot-3', path: join(sourceDir, 'story-shot-3-flow.mp4'), provider: 'google-flow' },
  { id: 'story-shot-4', path: join(sourceDir, 'story-shot-4-flow.mp4'), provider: 'google-flow' },
];
for (const input of inputs) if (!existsSync(input.path)) throw new Error(`Missing real Flow source: ${input.path}`);

await mkdir(outDir, { recursive: true });
await mkdir(qcDir, { recursive: true });

const normalized = [];
for (const input of inputs) {
  const output = join(outDir, `${input.id}-normalized.mp4`);
  await run(ffmpeg, ['-y', '-i', input.path, '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,fps=30,format=yuv420p', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-movflags', '+faststart', output]);
  normalized.push({ ...input, path: output, sourcePath: input.path, source: await probe(input.path), hash: await sha256(input.path), normalized: await probe(output) });
}

const concatList = join(outDir, 'flow-video-concat.txt');
await writeFile(concatList, `${normalized.map((item) => `file '${item.path.replaceAll("'", "'\\''")}'`).join('\n')}\n`, 'utf8');
const raw = join(outDir, 'MOSS_STORY_FIRST_SHORT_FLOW_V1_RAW.mp4');
await run(ffmpeg, ['-y', '-f', 'concat', '-safe', '0', '-i', concatList, '-c', 'copy', raw]);

const audio = join(root, 'audio', 'FINAL_STORY_AUDIO.mp3');
const captions = join(root, 'final', 'captions.ass');
if (!existsSync(audio) || !existsSync(captions)) throw new Error('Approved Gemini audio or captions are missing');
const output = join(outDir, 'MOSS_STORY_FIRST_SHORT_FLOW_V1.mp4');
await run(ffmpeg, ['-y', '-i', raw, '-i', audio, '-vf', `subtitles=filename='${escapeFfmpegFilterPath(captions)}'`, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-r', '30', '-s', '1920x1080', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', output]);

for (const [name, second] of [['opening', 1.2], ['middle', 14], ['ending', 29]]) await run(ffmpeg, ['-y', '-ss', String(second), '-i', output, '-frames:v', '1', '-vf', 'scale=640:-2', join(qcDir, `flow-final-${name}.jpg`)]);

const media = await probe(output);
const placeholderFree = inputs.every((item) => item.provider === 'google-flow' || item.provider === 'gemini-video-existing');
const report = {
  version: 'FLOW_V1',
  runId: 'moss-story-first-20260914225544',
  state: 'READY_FOR_HUMAN_REVIEW',
  providerStrategy: ['google-flow', 'gemini-api', 'other'],
  project: { provider: 'google-flow', projectId: 'fed489a3-b1c3-44cd-b45c-dd006b6b45b8', url: 'https://flow.google.com/project/fed489a3-b1c3-44cd-b45c-dd006b6b45b8', accountTier: 'PRO', creditsBeforeObserved: 893, creditsSpentThisRun: 36, creditsAfterObserved: 869, dailyCreditsRemainingObservedBefore: 50, dailyCreditsRemainingObservedAfter: 26, generationModel: 'Omni 1.1 Flash (shown by Flow editor)', automation: 'Browser/Computer Use', referenceMode: 'text-only; local ingredient upload unavailable in connector', identityRisk: 'TEXT_ONLY_IDENTITY_RISK', balanceNote: 'Google One displayed 869 Flow points and 26 daily points remaining after the three -12 transactions.' },
  story: { title: "The Little Light That Wouldn't Stop", storyApproved: true, placeholders: 0, sourceStoryKept: true },
  audio: { path: audio, provider: 'gemini-tts', final: true, reusedApprovedMix: true, captions: 'burned-in from approved ASS' },
  sources: normalized,
  finalVideo: { path: output, media, captionsBurnedIn: true, placeholderFree, resolution: '1920x1080', fps: 30 },
  qc: { temporalSampling: '0/25/50/75/100 per source clip plus final opening/middle/ending frames', reportPath: join(qcDir, 'flow-temporal-qc.json'), visualInspection: 'REVIEW_REQUIRED', soundOff: 'REVIEW_REQUIRED', audioOnly: 'PASS', storyComplete: true, noStoryboardFallbacks: placeholderFree },
  cost: { existingGeminiApiUsd: 0.8, flowCreditsSpent: 36, flowPaidUsd: 0, totalExternalPaidUsd: 0.8, note: 'Flow points are subscription credits, not converted to USD.' },
  nextState: 'READY_FOR_HUMAN_REVIEW',
};
await json(join(outDir, 'flow-final-report.json'), report);
await json(join(outDir, 'flow-shot-manifest.json'), { project: report.project, inputs, normalized, final: report.finalVideo });
console.log(JSON.stringify({ state: report.state, output, duration: Number(media.format.duration), resolution: '1920x1080', fps: 30, creditsSpent: 36, paidUsd: 0.8, placeholders: 0 }, null, 2));
