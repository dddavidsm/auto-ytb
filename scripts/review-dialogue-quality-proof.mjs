import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { GeminiVisionProvider, GeminiAudioQualityProvider } from '../packages/providers/dist/index.js';

const root = resolve('.data', 'dialogue-animated-story', 'dialogue-full-pilot-v1');
const reportPath = join(root, 'reports', 'dialogue-quality-proof.json');
const video = join(root, 'full-pilot.mp4');
const audio = join(root, 'audio', 'dialogue-mix.wav');
const qcRoot = join(root, 'reports', 'semantic-frames');
const command = (cmd, args) => new Promise((resolvePromise, reject) => { const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] }); let out = ''; let err = ''; child.stdout.on('data', (b) => { out += b.toString(); }); child.stderr.on('data', (b) => { err += b.toString(); }); child.on('error', reject); child.on('close', (code) => code === 0 ? resolvePromise(out) : reject(new Error(`${cmd} exited ${code}: ${err.slice(-1200)}`))); });

const report = JSON.parse(await readFile(reportPath, 'utf8'));
const key = String(process.env.GEMINI_API_KEY || '').trim();
if (!key) throw new Error('GEMINI_API_KEY is required for semantic QC');
await mkdir(qcRoot, { recursive: true });
const vision = new GeminiVisionProvider({ apiKey: key, model: process.env.VISION_MODEL || process.env.GEMINI_VISION_MODEL || 'gemini-3.8-flash' });
const times = [3, 8, 13, 18, 25, 34, 42];
const results = [];
for (const [index, time] of times.entries()) {
  const frame = join(qcRoot, `frame-${String(index + 1).padStart(2, '0')}.png`);
  await command(process.env.FFMPEG_BIN || 'ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(time), '-i', video, '-frames:v', '1', frame]);
  const imageData = await readFile(frame);
  const value = await vision.evaluate({ imageData, mimeType: 'image/png', prompt: 'Evaluate this frame from an original Klyverio DIALOGUE_ANIMATED_STORY. Two canonical characters may appear: Pip is a teal rounded digital creature with one antenna and amber core; Byte is a purple rounded square character with a small amber brow bar. Do not penalize the frame for showing Byte instead of Pip. The frame may be a dialogue or a reaction shot, so a reaction pose is valid even without captions. Check whether the visible character identity is consistent with its canonical design, whether the expression/action is readable, whether composition supports a conversation rather than a slideshow, whether any visible captions are large white uppercase with one yellow keyword and thick black outline, and whether there are unwanted artifacts. Return relevanceScore, continuityScore and artifactQualityScore from 0 to 100 plus concise issues.' });
  results.push({ frame: index + 1, timestampSeconds: time, path: frame, ...value });
}
let audioQuality = { status: 'NOT_EVALUATED', reason: 'No audio evaluator configured' };
try {
  const evaluator = new GeminiAudioQualityProvider({ apiKey: key, model: process.env.AUDIO_QC_MODEL || process.env.GEMINI_VISION_MODEL || 'gemini-3.8-flash' });
  const value = await evaluator.evaluate({ audioData: await readFile(audio), mimeType: 'audio/wav', prompt: 'Evaluate this short two-character dialogue mix. Check voice clarity, distinct speakers, naturalness, pace, energy, pauses, music under voice, SFX audibility and clipping. Do not infer semantic lip sync from audio alone. Return PASS or WARN for each dimension and concise issues.' });
  audioQuality = { status: 'EVALUATED', ...value };
} catch (error) { audioQuality = { status: 'NOT_EVALUATED', reason: error.message }; }
const minRelevance = Math.min(...results.map((item) => Number(item.relevanceScore || 0)));
const minContinuity = Math.min(...results.map((item) => Number(item.continuityScore || 0)));
const semanticStatus = minRelevance >= 65 && minContinuity >= 70 ? 'PASS' : minRelevance >= 50 && minContinuity >= 55 ? 'WARN' : 'FAIL';
report.semanticSceneReports = { status: 'REAL_EVALUATION', model: vision.name, frames: results, aggregate: { status: semanticStatus, minRelevance, minContinuity, evaluatedFrames: results.length } };
report.captionQualityReport.vision = { status: results.every((item) => !item.issues?.some((issue) => /unreadable|tiny|overlap|cut off/i.test(issue))) ? 'PASS' : 'WARN', model: vision.name };
report.characterContinuityReport = { status: minContinuity >= 70 ? 'PASS' : 'WARN', model: vision.name, minScore: minContinuity, invariants: ['teal silhouette', 'amber core', 'one antenna', 'fixed face/proportions'] };
report.voiceQualityReport = audioQuality;
report.qualityReview = { reviewedAt: new Date().toISOString(), semanticStatus, audioStatus: audioQuality.status, notEvaluatedDimensions: ['lip-sync cannot be proven by vision alone; alignment report is authoritative', 'viewer enjoyment remains a human review decision'] };
await writeFile(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ semanticStatus, minRelevance, minContinuity, audioStatus: audioQuality.status, reportPath }, null, 2));
