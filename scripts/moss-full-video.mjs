import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, dirname } from 'node:path';
import { spawn } from 'node:child_process';

const repoRoot = resolve('.');
const ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg';
const ffprobe = process.env.FFPROBE_BIN || 'ffprobe';
const apiKey = String(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
const model = String(process.env.GEMINI_VIDEO_MODEL || process.env.VIDEO_MODEL || 'veo-3.1-fast-generate-preview').trim();
const resolution = String(process.env.GEMINI_VIDEO_RESOLUTION || '720p').trim();
const apiBase = String(process.env.GEMINI_API_ENDPOINT || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const runId = `moss-full-video-${stamp}`;
const root = join(repoRoot, '.data', 'pro-series-rnd', runId);
const shotsDir = join(root, 'shots');
const normalizedDir = join(root, 'normalized-shots');
const reportDir = join(root, 'reports');
const refsDir = join(repoRoot, '.data', 'pro-series-rnd', 'moss-canonical-reference-pack-20260914143349', 'canonical-references');
const manifestPath = join(root, 'manifest.json');
const finalPath = join(root, 'MOSS_FULL_EPISODE_V1.mp4');
const costPerSecond = 0.10;

const storyBible = [
  'Moss is the exact same original young anthropomorphic red panda in every shot: warm red-orange fur, cream muzzle and chest, large expressive dark eyes, rounded ears, compact biped body, long ringed tail, and the same green-and-cream striped scarf. Preserve identical face, fur pattern, proportions, scarf and tail. Do not redesign Moss.',
  'High-end original family animation, lush moonlit woodland workshop, warm lantern fill, cool blue rim light, polished fur, readable silhouettes, cinematic staging, physical cause and effect, original characters only, no logos, no watermark, no readable text, no UI, no charts, no slideshow.',
].join(' ');

const scenes = [
  { id: 'shot-01', purpose: 'hook', dialogue: 'Moss: “Stop! That is the last moon acorn!”', prompt: `${storyBible} Open on a dynamic wide shot of Moss in a small forest workshop as a giant glowing acorn suddenly rolls off a workbench and crashes through the open door. Moss spins, eyes wide, then lunges into a run after it. The camera whip-pans from the acorn to Moss and pushes forward with the action. Clear spoken English dialogue from Moss, “Stop! That is the last moon acorn!”, with natural expressive delivery, footstep foley, rolling acorn sound and a musical sting. Show the physical event immediately, no title card.` },
  { id: 'shot-02', purpose: 'chase', dialogue: 'Moss: “I can catch it!” Owl: “Moss, the bridge!”', prompt: `${storyBible} Continue the same chase in the same moonlit forest. A small original tawny owl friend perched on a branch reacts as Moss runs downhill after the glowing acorn. Use a tracking medium shot, then a low angle as Moss leaps over a root; the owl flaps and calls a warning. Moss reaches forward with both paws, determined and breathless. Clear distinct dialogue: Moss says “I can catch it!” and the owl says “Moss, the bridge!” with different voices, expressive acting, running foley, wing flap and rising music. Keep Moss identical.` },
  { id: 'shot-03', purpose: 'obstacle', dialogue: 'Moss: “Easy… easy…”', prompt: `${storyBible} At a narrow wooden bridge over a dark stream, the glowing acorn rolls to the edge. Moss skids to a stop, carefully crawls onto the bridge and reaches with one paw; the bridge bends and a plank pops loose. Use an over-the-shoulder shot toward the acorn, a close-up of Moss switching from confidence to worry, then a small dolly-out revealing the drop below. Moss whispers “Easy… easy…” and freezes as the acorn bounces once. Physical prop interaction, believable body movement, tense forest ambience and a restrained musical build. No text.` },
  { id: 'shot-04', purpose: 'reversal', dialogue: 'Owl: “You said it was quiet!” Moss: “It was!”', prompt: `${storyBible} The acorn cracks open in Moss’s paws and releases a bright magical sprout that bursts upward, lighting the bridge and surrounding trees. Cut from a close-up of Moss’s stunned face to a reaction shot of the owl hovering backward in surprise, then a two-shot as Moss shields the owl from harmless sparkling leaves. The owl says “You said it was quiet!” and Moss answers “It was!” with clear distinct voices, perfectly timed facial reactions, body recoil and hand gestures. Dynamic camera tilt, magical particles, impact sound and a playful orchestral turn.` },
  { id: 'shot-05', purpose: 'payoff', dialogue: 'Moss: “Next time, we plant it first.”', prompt: `${storyBible} Payoff in a warm forest clearing: the tiny sprout has become a friendly glowing moon tree, and Moss and the owl stand beneath it, relieved and delighted. Begin on a medium shot of Moss touching the new leaves, cut to the owl’s amused reaction, then pull back to a wide reveal of fireflies and the workshop in the distance. Moss smiles and says “Next time, we plant it first.” The owl laughs softly. End on a joyful shared look and a gentle musical resolution with leaf rustle and soft magic chime. Preserve the exact same Moss and scarf. No title card.` },
];

function sha(value) { return createHash('sha256').update(value).digest('hex'); }
function fileUri(path) { return `file://${path.replaceAll('\\', '/')}`; }
function run(command, args, capture = false) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', capture ? 'pipe' : 'ignore', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolvePromise({ stdout, stderr }) : reject(new Error(`${command} exited ${code}: ${stderr.slice(-3000)}`)));
  });
}
async function jsonWrite(path, value) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); }
async function mediaInfo(path) {
  const result = await run(ffprobe, ['-v', 'error', '-show_entries', 'format=duration,size:stream=codec_name,codec_type,width,height,avg_frame_rate,channels', '-of', 'json', path], true);
  return JSON.parse(result.stdout);
}
async function imageReference(path) {
  const data = await readFile(path);
  return { image: { inlineData: { mimeType: 'image/png', data: Buffer.from(data).toString('base64') } }, referenceType: 'asset' };
}
async function request(url, init = {}) {
  const response = await fetch(url, { ...init, headers: { 'x-goog-api-key': apiKey, ...(init.headers || {}) } });
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 500) }; }
  if (!response.ok) { const error = new Error(`Gemini request failed ${response.status}`); error.status = response.status; error.body = body; throw error; }
  return body;
}
async function pollOperation(name) {
  const started = Date.now();
  while (Date.now() - started < 900000) {
    const operation = await request(`${apiBase}/${name}`);
    if (operation.done) return operation;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10000));
  }
  throw new Error(`Timed out polling ${name}`);
}
async function generateScene(scene, refs) {
  const requestHash = sha(`${model}|${resolution}|${scene.prompt}|${refs.map((item) => item.path).join('|')}`);
  const createBody = { instances: [{ prompt: scene.prompt, referenceImages: refs.map((item) => item.reference) }], parameters: { aspectRatio: '16:9', resolution, durationSeconds: 8 } };
  let operationName = null;
  let referenceMode = 'REFERENCE_IMAGES';
  let operation;
  try {
    operation = await request(`${apiBase}/models/${encodeURIComponent(model)}:predictLongRunning`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(createBody) });
    operationName = operation.name || null;
  } catch (error) {
    if (error.status !== 400) throw error;
    referenceMode = 'TEXT_ONLY_FALLBACK_AFTER_REFERENCE_REJECTION';
    operation = await request(`${apiBase}/models/${encodeURIComponent(model)}:predictLongRunning`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ instances: [{ prompt: scene.prompt }], parameters: { aspectRatio: '16:9', resolution, durationSeconds: 8 } }) });
    operationName = operation.name || null;
  }
  if (!operationName) throw new Error(`No operation name returned for ${scene.id}`);
  await jsonWrite(join(reportDir, `${scene.id}-submitted.json`), { sceneId: scene.id, requestHash, operationName, referenceMode, model, resolution, submittedAt: new Date().toISOString() });
  const completed = await pollOperation(operationName);
  if (completed.error) throw new Error(`Veo operation failed for ${scene.id}: ${JSON.stringify(completed.error).slice(0, 1200)}`);
  const videoUri = completed.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri
    || completed.response?.generateVideoResponse?.generatedVideos?.[0]?.video?.uri
    || completed.response?.generatedVideos?.[0]?.video?.uri
    || completed.response?.generatedVideoResponse?.generatedVideos?.[0]?.video?.uri;
  if (!videoUri) throw new Error(`No video URI returned for ${scene.id}; response=${JSON.stringify(completed).slice(0, 1800)}`);
  const response = await fetch(videoUri, { headers: { 'x-goog-api-key': apiKey } });
  if (!response.ok) throw new Error(`Video download failed ${response.status} for ${scene.id}`);
  const target = join(shotsDir, `${scene.id}.mp4`);
  await writeFile(target, Buffer.from(await response.arrayBuffer()));
  return { id: scene.id, purpose: scene.purpose, dialogue: scene.dialogue, requestHash, operationName, referenceMode, model, resolution, path: target, sourceUri: videoUri, estimatedCostUsd: 8 * costPerSecond, media: await mediaInfo(target) };
}

if (!apiKey) throw new Error('GEMINI_API_KEY/GOOGLE_API_KEY is not configured');
await Promise.all([mkdir(shotsDir, { recursive: true }), mkdir(normalizedDir, { recursive: true }), mkdir(reportDir, { recursive: true })]);
const refs = await Promise.all(['01-front.png', '03-three-quarter.png', '02-side.png'].map(async (name) => ({ path: join(refsDir, name), reference: await imageReference(join(refsDir, name)) })));
const preflight = { runId, currency: 'USD', hardMaxUsd: 5, model, resolution, sceneCount: scenes.length, estimatedVideoSeconds: scenes.length * 8, estimatedVideoCostUsd: Number((scenes.length * 8 * costPerSecond).toFixed(2)), references: refs.map((item) => item.path), note: 'One new full Moss episode requested by owner; reference-conditioned Veo attempted first, no subscriptions or new providers.' };
await jsonWrite(join(reportDir, 'cost-preflight.json'), preflight);
if (preflight.estimatedVideoCostUsd > preflight.hardMaxUsd) throw new Error('Preflight exceeds hard maximum');

const generated = [];
for (const scene of scenes) {
  console.log(`[moss-full-video] generating ${scene.id}`);
  const result = await generateScene(scene, refs);
  generated.push(result);
  await jsonWrite(manifestPath, { runId, status: 'IN_PROGRESS', preflight, scenes: generated });
  console.log(`[moss-full-video] complete ${scene.id}`);
}

const normalized = [];
for (const scene of generated) {
  const target = join(normalizedDir, `${scene.id}.mp4`);
  await run(ffmpeg, ['-y', '-i', scene.path, '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,format=yuv420p', '-r', '30', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', target]);
  normalized.push(target);
}
const concatList = join(root, 'concat.txt');
await writeFile(concatList, normalized.map((path) => `file '${path.replaceAll("'", "'\\''")}'`).join('\n') + '\n', 'utf8');
await run(ffmpeg, ['-y', '-f', 'concat', '-safe', '0', '-i', concatList, '-vf', 'scale=1920:1080:flags=lanczos,format=yuv420p', '-r', '30', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-movflags', '+faststart', finalPath]);
const finalMedia = await mediaInfo(finalPath);
const report = { runId, status: 'READY_FOR_REVIEW', format: 'MOSS_CHARACTER_STORY_VEO_MONTAGE', topic: 'Moss and the Runaway Acorn', visualDirection: 'Style Proof B expanded into a new multi-shot episode; not FastRender and not the Meshy/Rodin pipeline.', finalPath, finalMedia, scenes: generated, preflight, cost: { initialExternalUsd: preflight.estimatedVideoCostUsd, revisionUsd: 0, totalExternalUsd: preflight.estimatedVideoCostUsd, costPerGeneratedSecondUsd: costPerSecond }, qualityLimits: ['Veo clips were generated independently; temporal identity and acting require human review.', 'Final output is upscaled from the configured 720p generation resolution.', 'No YouTube publication attempted.'], lineage: { styleProofB: '.data/pro-series-rnd/pro-series-style-proofs-20260914123059/videos/style-proof-B.mp4', canonicalReferencePack: refs.map((item) => item.path) } };
await jsonWrite(manifestPath, report);
await jsonWrite(join(reportDir, 'moss-full-video-report.json'), report);
console.log(JSON.stringify({ runId, status: report.status, finalPath, durationSeconds: Number(finalMedia.format?.duration || 0), sizeBytes: Number(finalMedia.format?.size || 0), estimatedExternalCostUsd: report.cost.totalExternalUsd, referenceModes: generated.map((item) => ({ scene: item.id, mode: item.referenceMode })) }, null, 2));
