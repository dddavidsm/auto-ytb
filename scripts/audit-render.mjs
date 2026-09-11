import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { alignmentToSubtitleCues } from '../packages/runtime-node/index.mjs';

function arg(name, fallback = '') {
  const prefix = '--' + name + '=';
  const hit = process.argv.find((value) => value.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

function runJson(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolvePromise(JSON.parse(stdout)) : reject(new Error(command + ' exited ' + code + ': ' + stderr.slice(-3000))));
  });
}

function rawFrames(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const chunks = [];
    let stderr = '';
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolvePromise(Buffer.concat(chunks)) : reject(new Error(command + ' exited ' + code + ': ' + stderr.slice(-3000))));
  });
}

const video = resolve(arg('video'));
const manifestPath = resolve(arg('manifest'));
const out = resolve(arg('out', '.data/audits/latest-render.json'));
if (!video || !manifestPath) throw new Error('Usage: node scripts/audit-render.mjs --video=<mp4> --manifest=<json> [--out=<json>]');

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const probe = await runJson('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size:stream=index,codec_type,codec_name,width,height,avg_frame_rate,sample_rate,channels', '-of', 'json', video]);
const durationSec = Number(probe.format?.duration ?? manifest.script?.targetDurationSec ?? 0);
const width = 64, height = 114, frameBytes = width * height;
const bytes = await rawFrames('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', video, '-vf', 'fps=1,scale=' + width + ':' + height + ':force_original_aspect_ratio=decrease,pad=' + width + ':' + height + ':(ow-iw)/2:(oh-ih)/2,format=gray', '-f', 'rawvideo', '-']);
const samples = [];
for (let offset = 0; offset + frameBytes <= bytes.length; offset += frameBytes) {
  const frame = bytes.subarray(offset, offset + frameBytes);
  let sum = 0;
  for (const value of frame) sum += value;
  samples.push({ meanLuma: sum / frame.length, frame });
}

const scenes = [...(manifest.scenes ?? [])].sort((a, b) => Number(a.startSec ?? 0) - Number(b.startSec ?? 0));
const cues = alignmentToSubtitleCues(manifest.voice?.alignment, {
  maxChars: manifest.captionPlan?.maxChars ?? 32,
  maxDurationSeconds: manifest.captionPlan?.maxDurationSeconds ?? 2.3,
});
const sceneAt = (time) => scenes.find((scene) => time >= Number(scene.startSec ?? 0) && time < Number(scene.startSec ?? 0) + Number(scene.durationSec ?? 0))
  ?? scenes.filter((scene) => Number(scene.startSec ?? 0) <= time).at(-1)
  ?? scenes[0];
const beatAt = (scene) => (manifest.script?.beats ?? []).find((beat) => scene?.id === beat.id || scene?.id?.startsWith(beat.id + '-s'));
const cueAt = (time) => cues.find((cue) => time >= Number(cue.start ?? 0) && time < Number(cue.end ?? 0));
const perSecond = samples.map(({ meanLuma, frame }, second) => {
  const previous = samples[second - 1]?.frame;
  let changeScore = 0;
  if (previous) {
    for (let index = 0; index < frame.length; index += 1) changeScore += Math.abs(frame[index] - previous[index]);
    changeScore /= frame.length;
  }
  const scene = sceneAt(second + 0.02);
  const beat = beatAt(scene);
  const cue = cueAt(second + 0.02);
  return {
    second,
    sceneIndex: Math.max(0, scenes.indexOf(scene)),
    sceneId: scene?.id ?? null,
    kind: scene?.kind ?? null,
    beatPurpose: beat?.purpose ?? null,
    captionActive: Boolean(cue),
    caption: cue?.text ?? null,
    meanLuma: Number(meanLuma.toFixed(2)),
    changeScore: Number(changeScore.toFixed(2)),
  };
});

const coveredSeconds = perSecond.filter((row) => row.captionActive).length;
const meaningfulChanges = perSecond.filter((row) => row.changeScore >= 4).length;
const blackSeconds = perSecond.filter((row) => row.meanLuma < 2).length;
let longestLowMotionRun = 0, currentLowMotionRun = 0;
for (const row of perSecond) {
  if (row.changeScore < 1.2) currentLowMotionRun += 1;
  else { longestLowMotionRun = Math.max(longestLowMotionRun, currentLowMotionRun); currentLowMotionRun = 0; }
}
longestLowMotionRun = Math.max(longestLowMotionRun, currentLowMotionRun);

const technical = probe.streams?.some((stream) => stream.codec_type === 'video' && stream.width === 1080 && stream.height === 1920)
  && probe.streams?.some((stream) => stream.codec_type === 'audio')
  && blackSeconds === 0;
const hookSeconds = perSecond.filter((row) => row.second < 4 && row.captionActive).length;
const score = {
  hook: hookSeconds >= 3 ? 20 : hookSeconds >= 2 ? 15 : hookSeconds >= 1 ? 8 : 0,
  captions: coveredSeconds / Math.max(1, perSecond.length) >= 0.95 ? 20 : Math.round(Math.min(20, (coveredSeconds / Math.max(1, perSecond.length)) * 20)),
  visualRhythm: Math.round(Math.min(20, (meaningfulChanges / Math.max(1, perSecond.length - 1)) * 28)),
  progression: scenes.length >= 14 && longestLowMotionRun <= 4 ? 20 : scenes.length >= 10 && longestLowMotionRun <= 7 ? 14 : 7,
  technical: technical ? 20 : 0,
};
const total = Object.values(score).reduce((sum, value) => sum + value, 0);
const report = {
  generatedAt: new Date().toISOString(),
  video,
  manifest: manifestPath,
  durationSec: Number(durationSec.toFixed(3)),
  probe,
  metrics: {
    sceneCount: scenes.length,
    cueCount: cues.length,
    coveredSeconds,
    sampledSeconds: perSecond.length,
    captionCoverage: Number((coveredSeconds / Math.max(1, perSecond.length)).toFixed(3)),
    meaningfulChanges,
    blackSeconds,
    longestLowMotionRun,
  },
  score: { ...score, total },
  perSecond,
};
await writeFile(out, JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ out, durationSec: report.durationSec, sceneCount: scenes.length, cueCount: cues.length, captionCoverage: report.metrics.captionCoverage, meaningfulChanges, longestLowMotionRun, blackSeconds, score: report.score }, null, 2));
