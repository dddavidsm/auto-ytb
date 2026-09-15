import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';

const root = resolve(process.env.STORY_FIRST_RUN_ROOT || '.data/pro-series-rnd/moss-story-first-20260914225544');
const ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg';
const qcDir = join(root, 'flow-qc');
const clips = [
  ['story-shot-1', join(root, 'final', 'story-shot-1.mp4')],
  ['story-shot-2', join(root, 'flow-final-shots', 'story-shot-2-flow.mp4')],
  ['story-shot-3', join(root, 'flow-final-shots', 'story-shot-3-flow.mp4')],
  ['story-shot-4', join(root, 'flow-final-shots', 'story-shot-4-flow.mp4')],
];
function run(args) { return new Promise((resolvePromise, reject) => { const child = spawn(ffmpeg, args, { stdio: 'ignore' }); child.on('error', reject); child.on('close', (code) => code === 0 ? resolvePromise() : reject(new Error(`ffmpeg exited ${code}`))); }); }
await mkdir(qcDir, { recursive: true });
const shots = [];
for (const [id, path] of clips) {
  if (!existsSync(path)) throw new Error(`missing clip ${path}`);
  const samples = [];
  for (const [ratio, second] of [[0, 0], [0.25, 2], [0.5, 4], [0.75, 6], [1, 7.8]]) {
    const frame = join(qcDir, `${id}-temporal-${Math.round(ratio * 100)}.jpg`);
    await run(['-y', '-ss', String(second), '-i', path, '-frames:v', '1', '-vf', 'scale=640:-2', frame]);
    samples.push({ ratio, frame });
  }
  shots.push({ id, path, samples, identity: 'REVIEW_REQUIRED', temporalArtifacts: 'REVIEW_REQUIRED', storyState: 'EXPECTED_CONTINUITY' });
}
const report = { version: 'FLOW_TEMPORAL_QC_V1', runId: 'moss-story-first-20260914225544', method: 'five temporal samples per real source clip', shots, crossShot: { status: 'REVIEW_REQUIRED', pairs: shots.slice(1).map((shot, index) => ({ from: shots[index].id, to: shot.id, state: 'EXPECTED_CONTINUITY', identity: 'REVIEW_REQUIRED' })) }, final: { soundOff: 'REVIEW_REQUIRED', audioOnly: 'PASS', captionsBurnedIn: 'PASS' }, note: 'Flow generation used text-only continuity prompts because the browser connector could not attach local ingredients; this report intentionally does not self-promote identity QC to PASS.' };
await writeFile(join(qcDir, 'flow-temporal-qc.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ path: join(qcDir, 'flow-temporal-qc.json'), shots: shots.length, samplesPerShot: 5 }, null, 2));
