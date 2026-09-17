import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { NodeLocalObjectStore, FfmpegRenderer } from '../packages/runtime-node/index.mjs';
import { GeminiVideoProvider, GeminiVisionProvider } from '../packages/providers/dist/index.js';
import { SyntheticBrollEngine, buildVisualContinuityProfile, compileSyntheticShotPrompt, evaluateVisualRealityContinuity } from '../packages/production/dist/index.js';

const ROOT = resolve('.data/autonomous-production/visual-continuity-bridge-v1');
const REPORTS = join(ROOT, 'reports');
const MEDIA = join(ROOT, 'media');
const RENDER = join(ROOT, 'render');
const API_KEY = process.env.GEMINI_API_KEY;
const VIDEO_MODEL = process.env.GEMINI_VIDEO_MODEL || 'veo-3.1-fast-generate-preview';
const VISION_MODEL = process.env.GEMINI_VISION_MODEL || 'gemini-3.6-flash';
const reuseExisting = process.argv.includes('--reuse-existing');
const constrainedRetry = process.argv.includes('--constrained-retry');
const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const fileUri = (path) => `file://${resolve(path)}`;
const now = () => new Date().toISOString();
const sha256 = async (path) => createHash('sha256').update(await readFile(path)).digest('hex');
const writeJson = async (path, value) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); };

async function run(command, args, options = {}) {
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: options.quiet ? ['ignore', 'ignore', 'pipe'] : ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolvePromise({ stdout, stderr }) : reject(new Error(`${command} ${args.join(' ')} failed (${code}): ${stderr.slice(-1500)}`)));
  });
}

async function listMp4s(root) {
  const found = [];
  async function walk(dir) {
    if (!existsSync(dir)) return;
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (extname(entry.name).toLowerCase() === '.mp4') found.push(path);
    }
  }
  await walk(root);
  return found;
}

async function duration(path) {
  const result = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', path]);
  return Number(result.stdout.trim());
}

async function frame(path, time, out) {
  await mkdir(dirname(out), { recursive: true });
  await run('ffmpeg', ['-y', '-ss', String(time), '-i', path, '-frames:v', '1', '-vf', 'scale=640:-2', '-q:v', '3', out], { quiet: true });
  return out;
}

async function trim(source, out, seconds = 2.8, start = 0.15) {
  const sourceDuration = await duration(source);
  if (!Number.isFinite(sourceDuration) || sourceDuration < start + seconds + 0.05) throw new Error(`bridge source too short: ${source}`);
  await run('ffmpeg', ['-y', '-ss', String(start), '-i', source, '-t', String(seconds), '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', out], { quiet: true });
  return out;
}

function sourceProfile(path, id, position) {
  const label = clean(basename(path, '.mp4').replace(/[-_]/g, ' '));
  return { segmentId: id, cameraMovement: 'observed documentary movement', cameraDistance: position === 'first' ? 'medium' : 'close', motionLevel: 'HIGH', environment: ['real-world production environment'], location: [], semanticDescription: `real moving footage of ${label}` };
}

async function inspectFrames(paths, prompt) {
  const vision = new GeminiVisionProvider({ apiKey: API_KEY, model: VISION_MODEL });
  const observations = [];
  for (const path of paths) {
    try {
      observations.push({ frame: path, observation: await vision.evaluate({ prompt, imageData: await readFile(path), mimeType: 'image/jpeg' }) });
    } catch (error) {
      observations.push({ frame: path, observation: { observedMeaning: `vision inspection failed: ${error}`, relevanceScore: 0, continuityScore: 0, artifactQualityScore: 0, issues: ['VISION_INSPECTION_FAILED'] } });
    }
  }
  return observations;
}

async function persistNegativeFixture() {
  const rejection = { fixtureId: 'editorial-intelligence-v2', humanStatus: 'HUMAN_REJECTED_0_10', failureTags: ['GRAPHIC_DOMINANCE', 'VISUAL_GENRE_BREAK', 'CORRECT_BUT_BORING', 'NEGATIVE_TRAINING_EXAMPLE'], lesson: 'Correct explanatory graphics cannot compensate for loss of the established moving-footage visual language in FOOTAGE_PRO.', sourceVideo: 'https://drive.google.com/file/d/1urHw-UV64YZEOxZ7DursJZGiNlSy5MiO/view?usp=drivesdk', recordedAt: now(), positiveTrainingExample: false };
  await writeJson(join(REPORTS, 'NegativeFixtureGraphicDominance.json'), rejection);
  const historyPath = resolve('.data/production-memory/creative-history.json');
  let history = { productions: [], learning: [], rejections: [] };
  try { history = JSON.parse(await readFile(historyPath, 'utf8')); } catch {}
  history.rejections = Array.isArray(history.rejections) ? history.rejections : [];
  history.rejections = history.rejections.filter((item) => item.fixtureId !== rejection.fixtureId);
  history.rejections.push(rejection);
  await writeJson(historyPath, history);
  return rejection;
}

async function main() {
  await mkdir(REPORTS, { recursive: true }); await mkdir(MEDIA, { recursive: true });
  const rejection = await persistNegativeFixture();
  if (!API_KEY) {
    await writeJson(join(REPORTS, 'synthetic-bridge-report.json'), { status: 'BLOCKED', blocker: 'GEMINI_API_KEY_MISSING', rejection });
    throw new Error('SYNTHETIC_BRIDGE_BLOCKED: GEMINI_API_KEY is unavailable');
  }
  const candidates = (await listMp4s(resolve('.data'))).filter((path) => !/editorial-intelligence-v2[\\/]final[\\/]|archive-verify|video-v[12]|high.?div|cliff.?div|scuba|diver|nasa|moss|robohand|asphalt/i.test(path));
  const viable = [];
  for (const path of candidates) { try { if ((await duration(path)) >= 3.0) viable.push(path); } catch {} }
  if (viable.length < 2) throw new Error('SYNTHETIC_BRIDGE_BLOCKED: fewer than two generic real moving sources are available');
  const sourceA = viable[0]; const sourceB = sourceA;
  const sourceDuration = await duration(sourceA);
  const realA = await trim(sourceA, join(MEDIA, 'real-a.mp4'), 2.8, 0.15); const realB = await trim(sourceB, join(MEDIA, 'real-b.mp4'), 2.8, Math.max(0.15, sourceDuration - 2.95));
  const previous = sourceProfile(sourceA, 'real-a', 'first'); const next = sourceProfile(sourceB, 'real-b', 'next');
  const continuity = buildVisualContinuityProfile({ previous: [previous], next: [next], overall: [previous, next] });
  const sourceLabel = clean(basename(sourceA, '.mp4').replace(/[-_]/g, ' '));
  const processLabel = /glass|bottle/i.test(sourceLabel) ? 'glassworking' : sourceLabel || 'the same practical process';
  const action = constrainedRetry ? 'only the craftsperson hands gently rotate one finished clear glass bottle on the same worktable; the bottle remains one solid object throughout' : processLabel === 'glassworking' ? 'a craftsperson continues shaping heated glass with a hand tool as the glowing material rotates naturally' : 'the same material or mechanism continues moving with believable contact, weight, and momentum';
  const contract = SyntheticBrollEngine.buildContract({ subject: constrainedRetry ? 'close-up of hands rotating one finished clear glass bottle on a workshop table' : `a close physical detail of the same ${processLabel} process shown in the neighbouring real footage`, action, environment: 'the same practical workshop, tools, daylight, and background texture as the adjacent footage', shotPurpose: 'bridge a missing middle action without changing visual genre or process identity', cameraPosition: 'medium close-up at the same camera height as the adjacent footage', cameraMovement: continuity.cameraMovement === 'UNKNOWN' ? 'gentle handheld drift' : continuity.cameraMovement, visualEnergy: continuity.energy === 'UNKNOWN' ? 'medium documentary energy' : continuity.energy, previousShotContext: `real footage of ${sourceLabel} immediately before`, nextShotContext: `real footage of ${sourceLabel} immediately after` });
  const prompt = compileSyntheticShotPrompt(contract, continuity, ['no explanatory card', 'no diagram', 'no arrows', 'no UI', 'no title card', 'no glossy commercial lighting', ...(constrainedRetry ? ['no hot glass', 'no molten glass', 'no anvil', 'no hammer', 'no blacksmithing', 'no extra tools touching the bottle', 'no extra fingers', 'no object fusion'] : [])]);
  const justification = SyntheticBrollEngine.justify({ unitId: 'bridge-unit', visualGap: 'the middle physical action is not present in the two real source clips', whyRealFootageInsufficient: 'the controlled test intentionally has a real clip before and after but no usable middle detail', whyScriptShouldRemain: 'the bridge test evaluates visual continuity, not a factual claim', whySyntheticIsAppropriate: 'a generic physical insert can bridge the edit without impersonating a real event or named entity', providerChoice: `Gemini Veo ${VIDEO_MODEL}`, expectedQuality: 'HIGH', estimatedCost: { value: null, currency: 'USD', source: 'provider billing not exposed' }, alternativesConsidered: ['real footage only', 'graphic fallback', 'script rewrite'] });
  await writeJson(join(REPORTS, 'VisualContinuityProfile.json'), continuity);
  await writeJson(join(REPORTS, 'GenerationJustification.json'), justification);
  await writeJson(join(REPORTS, 'synthetic-shot-contract.json'), contract);
  await writeFile(join(REPORTS, 'synthetic-prompt.txt'), `${prompt}\n`, 'utf8');
  const store = new NodeLocalObjectStore(join(ROOT, 'storage'));
  const provider = new GeminiVideoProvider({ apiKey: API_KEY, store, model: VIDEO_MODEL, resolution: process.env.GEMINI_VIDEO_RESOLUTION || '720p', timeoutMs: 900000, pollMs: 10000 });
  const generatedLocal = join(MEDIA, 'synthetic-bridge.mp4');
  const generated = reuseExisting && existsSync(generatedLocal)
    ? { uri: fileUri(generatedLocal), provider: 'gemini-video', model: VIDEO_MODEL, costUsd: null, metadata: { reused: true } }
    : await provider.generate({ prompt, durationSeconds: 4, aspectRatio: '16:9' });
  if (!reuseExisting) {
    const generatedPath = generated.uri.replace(/^file:\/\//, '');
    await run('ffmpeg', ['-y', '-i', generatedPath, '-t', '2.8', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', generatedLocal], { quiet: true });
  }
  const manifest = { projectId: 'visual-continuity-bridge-v1', contentFormat: 'SHORT_HORIZONTAL', aspectRatio: '16:9', frame: { width: 1280, height: 720 }, script: { targetDurationSec: 8.4, beats: [] }, scenes: [{ id: 'real-a', startSec: 0, durationSec: 2.8, kind: 'video' }, { id: 'synthetic-bridge', startSec: 2.8, durationSec: 2.8, kind: 'video' }, { id: 'real-b', startSec: 5.6, durationSec: 2.8, kind: 'video' }], assets: [{ id: 'real-a-asset', sceneId: 'real-a', uri: fileUri(realA), mimeType: 'video/mp4', metadata: { clipStartSec: 0, clipEndSec: 2.8 }, evidenceRole: 'CONTEXTUAL_REAL', assetType: 'REAL_VIDEO' }, { id: 'synthetic-bridge-asset', sceneId: 'synthetic-bridge', uri: fileUri(generatedLocal), mimeType: 'video/mp4', metadata: { clipStartSec: 0, clipEndSec: 2.8 }, evidenceRole: 'SYNTHETIC_ILLUSTRATION', assetType: 'SYNTHETIC_VIDEO', provider: generated.provider, model: generated.model, prompt }, { id: 'real-b-asset', sceneId: 'real-b', uri: fileUri(realB), mimeType: 'video/mp4', metadata: { clipStartSec: 0, clipEndSec: 2.8 }, evidenceRole: 'CONTEXTUAL_REAL', assetType: 'REAL_VIDEO' }] };
  const manifestPath = join(ROOT, 'bridge-manifest.json'); await writeJson(manifestPath, manifest);
  const renderer = new FfmpegRenderer({ outputRoot: RENDER, width: 1280, height: 720, fps: 30 });
  const rendered = await renderer.render({ manifestUri: fileUri(manifestPath), outputKey: 'real-synthetic-real-bridge.mp4' });
  const output = rendered.uri.replace(/^file:\/\//, '');
  const renderedFrames = [];
  for (const [index, time] of [0.8, 3.15, 4.25, 5.35, 6.6].entries()) renderedFrames.push(await frame(output, time, join(REPORTS, `bridge-frame-${index}.jpg`)));
  const observations = await inspectFrames(renderedFrames, 'Inspect this frame from a real → synthetic → real documentary bridge test. Assess only visible facts: does it look like ordinary captured camera footage, does it preserve believable materials and physics, and does it create an obvious visual genre break compared with the other frames? Do not infer success from metadata.');
  const text = observations.map((item) => item.observation.observedMeaning).join(' ');
  const issueText = observations.flatMap((item) => item.observation.issues ?? []).join(' ');
  const syntheticText = observations.slice(1, 4).map((item) => item.observation.observedMeaning).join(' ');
  const sameProcess = /glass|bottle|workshop|artisan|apron|craft/i.test(text) && /glass|bottle|workshop|artisan|apron|craft/i.test(syntheticText);
  const artifactFree = !/cgi|cartoon|plastic|warped|morph|floating|flicker|impossible|graphic|diagram|nonsensical|anomal|inconsisten|anvil|hammer|blacksmith|fusion|grip anomaly|physical inconsistency/i.test(`${text} ${issueText}`);
  const style = SyntheticBrollEngine.evaluateCandidate({ framesObserved: observations.length === 5, photorealism: artifactFree && /glass|bottle|workshop|worker|artisan|photographic|realistic/i.test(syntheticText) ? 'STRONG' : 'WEAK', temporalRealism: artifactFree && sameProcess ? 'STRONG' : 'WEAK', styleMatch: artifactFree && sameProcess ? 'STRONG' : 'WEAK', physics: artifactFree && /hand|tool|glass|bottle|workshop|material/i.test(syntheticText) ? 'STRONG' : 'WEAK', evidence: observations.map((item) => ({ frame: item.frame, observedMeaning: item.observation.observedMeaning, issues: item.observation.issues })) });
  const transition = evaluateVisualRealityContinuity({ mode: 'HYBRID_EDITORIAL', transitions: [{ from: 'REAL_VIDEO', to: 'SYNTHETIC_VIDEO', hasEditorialReason: true, styleMatch: style.styleMatch, reason: 'specific missing middle action' }, { from: 'SYNTHETIC_VIDEO', to: 'REAL_VIDEO', hasEditorialReason: true, styleMatch: style.styleMatch, reason: 'return to observed process' }] });
  const report = { version: 1, status: style.score === 100 && transition.status === 'PASS' ? 'PASS' : 'REJECTED_BY_CONTINUITY_CRITIC', provider: generated.provider, model: generated.model, requestedDurationSeconds: 4, selectedDurationSeconds: 2.8, cost: { value: generated.costUsd ?? null, currency: 'USD', source: 'provider metadata' }, sources: { realA: { path: sourceA, sha256: await sha256(realA) }, realB: { path: sourceB, sha256: await sha256(realB) } }, synthetic: { path: generatedLocal, sha256: await sha256(generatedLocal), prompt, evidenceRole: 'SYNTHETIC_ILLUSTRATION', justification }, continuity, styleMatch: style, transitionReport: transition, rendered: { path: output, sha256: await sha256(output), durationSeconds: await duration(output), frames: renderedFrames }, reviewedAt: now() };
  await writeJson(join(REPORTS, 'synthetic-bridge-report.json'), report);
  console.log(JSON.stringify({ status: report.status, video: output, report: join(REPORTS, 'synthetic-bridge-report.json'), styleMatch: style, transition }, null, 2));
  if (report.status !== 'PASS') process.exitCode = 2;
}

main().catch(async (error) => { await writeJson(join(REPORTS, 'synthetic-bridge-report.json'), { status: 'ERROR', error: String(error), at: now() }).catch(() => {}); console.error(error.stack || error); process.exitCode = 1; });
