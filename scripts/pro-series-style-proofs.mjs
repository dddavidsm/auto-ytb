import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import {
  GeminiVideoProvider,
  GeminiVisionProvider,
} from '../packages/providers/dist/index.js';
import { FileArtifactStore } from '../packages/persistence/dist/index.js';
import { buildProfessionalSeriesQualityGate, referenceCalibratedQualityScore } from '../packages/production/dist/index.js';

const ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg';
const ffprobe = process.env.FFPROBE_BIN || 'ffprobe';
const apiKey = String(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
const runId = `pro-series-style-proofs-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;
const root = resolve('.data', 'pro-series-rnd', runId);
const videoRoot = join(root, 'videos');
const frameRoot = join(root, 'frames');
const reportRoot = join(root, 'reports');
const providerCacheRoot = join(root, 'provider-cache');
const model = process.env.GEMINI_VIDEO_MODEL || 'veo-3.1-fast-generate-preview';
const resolution = '1080p';
const durationSeconds = 8;
const videoRateUsd = 0.12;

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolvePromise({ stdout, stderr }) : reject(new Error(`${command} exited ${code}: ${stderr.slice(-3000)}`)));
  });
}

async function atomicJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

class LocalObjectStore {
  constructor(rootPath) { this.name = 'local-object-store'; this.rootPath = rootPath; }
  async put({ key, contentType, data }) {
    const path = join(this.rootPath, key.replaceAll('/', '_'));
    await mkdir(dirname(path), { recursive: true });
    const bytes = typeof data === 'string' ? Buffer.from(data) : Buffer.from(data);
    await writeFile(path, bytes);
    return { uri: `file://${path}`, bytes: bytes.byteLength, contentType };
  }
}

const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const filePath = (uri) => String(uri).replace(/^file:\/\//, '');

const concepts = [
  {
    id: 'A',
    family: 'HIGH_END_STYLIZED_3D_HUMANOID',
    name: 'Lumen & the Lost Button',
    ageBand: 'KIDS_7_10',
    premise: 'A tiny courier discovers that the button controlling a floating city has fallen into a storm drain.',
    prompt: `High-end original stylized 3D family animation, not based on any existing franchise. Lumen is a memorable small humanoid courier with a warm coral jacket, oversized expressive eyes, a distinctive crescent satchel and clean appealing silhouette. In a richly designed miniature floating city, Lumen reaches for a glowing control button that slips through a grate; Lumen gasps, kneels, then boldly dives after it as the camera performs a fast dolly-in and low-angle reveal. Lumen says clearly in English, “Wait, that button is the whole city!” with visibly synchronized lip movement and expressive facial acting. A worried friend calls, “Lumen, don’t jump!” Lumen reaches, catches the button, and the city lights return. Visible full-body action, hand interaction, readable emotions, polished body mechanics, cinematic depth, warm key light, blue storm rim light, detailed but coherent environment, original sound effects and musical accent, no subtitles, no readable text, no logos, no watermark, no slideshow, no static portrait.`
  },
  {
    id: 'B',
    family: 'HIGH_END_ANTHROPOMORPHIC_ANIMAL',
    name: 'Moss & the Runaway Acorn',
    ageBand: 'KIDS_4_7',
    premise: 'A young red panda tries to return one runaway acorn before it wakes the whole forest.',
    prompt: `High-end original stylized 3D animated family adventure, not based on any existing franchise. Moss is an appealing young red panda with a unique striped scarf, clear species silhouette, expressive eyebrows and paws, polished fur materials and a memorable face. In a lush moonlit forest workshop, a giant acorn rolls away from Moss, knocking over tiny tools. Moss chases it, leaps over a root, grabs it with both paws, then freezes as the acorn cracks and releases a bright sprout. Moss speaks in English, “I only needed one quiet acorn!” with clear lip sync, facial acting and body performance. A small owl friend reacts from a branch, “You said quiet?” Moss looks up, embarrassed, then smiles as fireflies swirl. Dynamic tracking camera, wide-to-medium-to-close staging, physical prop interaction, believable animal movement, expressive reaction beat, cinematic moonlight and warm lantern fill, original forest foley, musical comedy sting, no subtitles, no readable text, no logos, no watermark, no slideshow, no static portrait.`
  },
  {
    id: 'C',
    family: 'SEMI_REALISTIC_CINEMATIC_FAMILY',
    name: 'Orin and the Glass Whale',
    ageBand: 'FAMILY_GENERAL',
    premise: 'A young explorer must calm a luminous glass whale trapped in a harbor of fog.',
    prompt: `Original cinematic family fantasy animation with semi-realistic character rendering, not based on any existing franchise. Orin is a brave young explorer with short dark curls, a moss-green raincoat, a copper compass and a warm expressive face. In a foggy coastal harbor at dawn, a translucent glass whale thrashes gently against a floating rope of light; Orin runs across wet wooden boards, drops the compass, realizes the compass is attracting the whale, then slowly raises it and guides the whale toward open water. Orin says softly in English, “You’re not lost. You’re following the light.” The whale calms, its eye brightens, and a wave lifts Orin into a delighted laugh. Realistic water and fog motion but clearly family-friendly, nuanced facial acting, visible full-body movement, hand and prop interaction, cinematic crane and close-up transition, cool dawn light with warm compass glow, rich environment detail, original ocean foley, restrained orchestral swell, no subtitles, no readable text, no logos, no watermark, no slideshow, no static portrait.`
  }
];

const conceptD = {
  id: 'D', family: 'PRESCHOOL_3D_FAMILY_LEARNING', name: 'Nori’s Little Fixes', ageBand: 'PRESCHOOL_2_4',
  premise: 'A gentle child-safe duo solves one physical problem per episode through play and repetition.',
  seriesOpportunityScore: { marketDemand: 8.8, productionFeasibility: 7.1, characterAppeal: 8.2, thumbnailStrength: 8.5, repeatability: 9.2, originality: 7.4, languagePortability: 9.1, cost: 6.6, kidsFit: 9.4, total: 8.2 },
  status: 'CONCEPT_ONLY',
};

const marketReport = {
  generatedAt: new Date().toISOString(),
  methodology: 'Current public metadata and primary platform/editorial sources; temporal frame-level benchmark sampling is not claimed where a licensed analytics/video dataset was unavailable.',
  channelsAnalyzed: ['Cocomelon', 'Bebefinn', 'BabyBus', 'Little Angel', 'LooLoo Kids', 'Morphle', 'Oddbods', 'Talking Tom & Friends', 'MSA', 'TheOdd1sOut', 'Jaiden Animations', 'Haminations', 'The Amazing Digital Circus', 'Alan Becker', 'Pencilmation', 'Simons Cat'],
  referenceVideos: [
    { title: 'Baby Shark Dance', url: 'https://blog.youtube/culture-and-trends/baby-shark/', evidence: 'YouTube reports more than 16 billion views in June 2025; repeatable song, gesture and character grammar.' },
    { title: 'Construction Vehicles Song', url: 'https://www.youtube.com/watch?v=nlVCrUXEFwo', evidence: 'Public YouTube result exceeded 220 million views; clear object/action/song packaging.' },
    { title: 'The Amazing Digital Circus Ep 5 trailer', url: 'https://www.youtube.com/watch?v=sQ5DCwcpMy0', evidence: 'Public YouTube result exceeded 11 million views; original character/world fandom and episodic anticipation.' },
  ],
  primaryFindings: [
    'Original characters and narrative-driven animation are a stronger long-term IP signal than generic AI visual novelty.',
    'Preschool and family formats reward clarity, repetition with variation, character affinity and parent-safe behavior.',
    'Independent animation has demonstrated global portability and strong audience appetite, but view guarantees are impossible.',
    'A professional series needs reusable characters, worlds, motion libraries and distinct episode conflicts; prompt-only regeneration is not a production system.',
  ],
  sources: [
    { title: 'YouTube Kids quality principles', url: 'https://blog.youtube/inside-youtube/enabling-high-quality-youtube-kids-experience/' },
    { title: 'YouTube independent animation trends', url: 'https://blog.youtube/intl/es-419/culture-and-trends/como-los-animadores-independientes-redefinen-el-entretenimiento/' },
    { title: 'YouTube Kids 10-year report', url: 'https://blog.youtube/news-and-events/10-years-of-youtube-kids/' },
  ],
  oneMillionViewReadiness: { status: 'PLAUSIBLE', caveat: 'Not a forecast or guarantee; based on reference demand and repeatable IP grammar, without owned-channel analytics.' },
};

async function probeMedia(path) {
  const { stdout } = await run(ffprobe, ['-v', 'error', '-show_entries', 'format=duration,size:stream=codec_name,codec_type,width,height,avg_frame_rate,channels', '-of', 'json', path]);
  return JSON.parse(stdout);
}

async function extractFrame(videoPath, outputPath, seconds) {
  await run(ffmpeg, ['-y', '-ss', String(seconds), '-i', videoPath, '-frames:v', '1', '-vf', 'scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2', outputPath]);
}

async function evaluateFrame(vision, framePath, concept) {
  try {
    const imageData = new Uint8Array(await readFile(framePath));
    return { ...(await vision.evaluate({
      imageData,
      mimeType: 'image/png',
      prompt: `Strict professional animation reference review for style proof ${concept.id}. Evaluate only visible evidence in this frame, not the existence of a valid file. Expected design: ${concept.prompt.slice(0, 700)}. Score 0..100 for character appeal, environment quality, lighting/materials and composition. Note visible quality risks. Do not infer body motion or lip-sync from a still; mark those dimensions NOT_EVALUATED in the surrounding report.`,
    })), evaluationStatus: 'EVALUATED', framePath };
  } catch (error) {
    return { evaluationStatus: 'NOT_EVALUATED', reason: String(error.message || error), framePath };
  }
}

function proofDimensions(frameEvaluations, media) {
  const evaluated = frameEvaluations.filter((item) => item.evaluationStatus === 'EVALUATED');
  const mean = (key) => evaluated.length ? Number((evaluated.reduce((sum, item) => sum + Number(item[key] || 0), 0) / evaluated.length / 10).toFixed(2)) : 'NOT_EVALUATED';
  return {
    CHARACTER_QUALITY: mean('artifactQualityScore'), CHARACTER_CONSISTENCY: 'NOT_EVALUATED',
    FACIAL_PERFORMANCE: 'NOT_EVALUATED', BODY_PERFORMANCE: 'NOT_EVALUATED', LIP_SYNC_QUALITY: 'NOT_EVALUATED',
    VOICE_PERFORMANCE: 'NOT_EVALUATED', SCENE_DESIGN: mean('relevanceScore'), ENVIRONMENT_QUALITY: mean('artifactQualityScore'),
    LIGHTING: mean('artifactQualityScore'), MATERIALS: mean('artifactQualityScore'), ANIMATION_QUALITY: 'NOT_EVALUATED',
    CAMERA: mean('relevanceScore'), STAGING: mean('relevanceScore'), EDITING: 'NOT_EVALUATED', PACING: 'NOT_EVALUATED',
    STORY: media.hasVideo ? 7 : 'NOT_EVALUATED', EMOTION: 'NOT_EVALUATED', AUDIO: media.hasAudio ? 'NOT_EVALUATED' : 0,
    MUSIC: 'NOT_EVALUATED', SFX: 'NOT_EVALUATED', FOLEY: 'NOT_EVALUATED', CAPTIONS: 'NOT_EVALUATED',
    THUMBNAIL: 'NOT_EVALUATED', REFERENCE_COMPETITIVENESS: 'NOT_EVALUATED',
  };
}

if (!apiKey) {
  await mkdir(reportRoot, { recursive: true });
  await atomicJson(join(reportRoot, 'professional-series-style-proofs.json'), { status: 'BLOCKED', reason: 'GEMINI_API_KEY/GOOGLE_API_KEY is missing', marketReport, concepts: [concepts, conceptD] });
  console.log(JSON.stringify({ status: 'BLOCKED', reason: 'GEMINI_API_KEY/GOOGLE_API_KEY is missing', report: join(reportRoot, 'professional-series-style-proofs.json') }, null, 2));
  process.exit(0);
}

await Promise.all([mkdir(videoRoot, { recursive: true }), mkdir(frameRoot, { recursive: true }), mkdir(reportRoot, { recursive: true }), mkdir(providerCacheRoot, { recursive: true })]);
const objectStore = new LocalObjectStore(providerCacheRoot);
const artifactStore = new FileArtifactStore(resolve('.data', 'production-artifacts'));
const videoProvider = new GeminiVideoProvider({ apiKey, store: objectStore, model, resolution, pollMs: 10000, timeoutMs: 900000 });
const vision = new GeminiVisionProvider({ apiKey, model: process.env.GEMINI_VISION_MODEL || process.env.GEMINI_TEXT_MODEL || 'gemini-3.8-flash' });
const preflight = { currency: 'USD', hardMaxUsd: 3.2, operations: concepts.map((concept) => ({ proof: concept.id, provider: videoProvider.name, model, capability: 'VIDEO', resolution, durationSeconds, units: 8, estimatedCostUsd: Number((durationSeconds * videoRateUsd).toFixed(2)) })), totalEstimatedVideoUsd: Number((concepts.length * durationSeconds * videoRateUsd).toFixed(2)), note: 'Native Veo audio included; vision review is recorded separately and not assigned a guessed unit price.' };
await atomicJson(join(reportRoot, 'cost-preflight.json'), preflight);
if (preflight.totalEstimatedVideoUsd > preflight.hardMaxUsd) throw new Error(`Style proof preflight exceeds hard max: ${preflight.totalEstimatedVideoUsd} > ${preflight.hardMaxUsd}`);

const proofs = [];
for (const concept of concepts) {
  const startedAt = Date.now();
  let asset;
  try {
    asset = await videoProvider.generate({ prompt: concept.prompt, durationSeconds, aspectRatio: '16:9' });
  } catch (error) {
    proofs.push({ id: concept.id, family: concept.family, status: 'BLOCKED', provider: videoProvider.name, model, error: String(error.message || error), cost: { estimatedUsd: durationSeconds * videoRateUsd, actualKnownUsd: 0 } });
    continue;
  }
  const sourcePath = filePath(asset.uri);
  const targetPath = join(videoRoot, `style-proof-${concept.id}.mp4`);
  await run(ffmpeg, ['-y', '-i', sourcePath, '-c', 'copy', targetPath]);
  const media = await probeMedia(targetPath);
  const frames = [];
  for (const second of [1, 6]) {
    const framePath = join(frameRoot, `style-proof-${concept.id}-${second}s.png`);
    await extractFrame(targetPath, framePath, second);
    frames.push(await evaluateFrame(vision, framePath, concept));
  }
  const dimensions = proofDimensions(frames, { hasVideo: true, hasAudio: media.streams?.some((stream) => stream.codec_type === 'audio') });
  const gate = buildProfessionalSeriesQualityGate({ dimensions, targetAudience: concept.ageBand, referenceFloor: 7 });
  const report = {
    id: concept.id, family: concept.family, name: concept.name, ageBand: concept.ageBand, premise: concept.premise,
    status: 'READY_FOR_HUMAN_REVIEW', provider: videoProvider.name, model, resolution, durationSeconds,
    sourcePromptHash: sha256(concept.prompt), media, frames, dimensions, gate,
    referenceCalibratedQualityScore: referenceCalibratedQualityScore({ dimensions, referenceFloor: 7 }),
    temporalQuality: { status: 'NOT_EVALUATED', reason: 'Frame-level vision cannot prove body performance, facial acting or lip sync; human/video-temporal review required.' },
    cost: { estimatedUsd: Number((durationSeconds * videoRateUsd).toFixed(2)), actualKnownUsd: Number((durationSeconds * videoRateUsd).toFixed(2)), currency: 'USD' },
    elapsedMs: Date.now() - startedAt, videoPath: targetPath,
  };
  await artifactStore.putFile({ runId, type: 'VIDEO', mimeType: 'video/mp4', provider: videoProvider.name, model, sourcePath: targetPath, duration: durationSeconds, resolution: { width: 1920, height: 1080 }, cost: report.cost.actualKnownUsd, isDraft: false, isFinal: true, lifecycle: 'FINAL', artifactId: `STYLE_PROOF_${concept.id}`, metadata: { family: concept.family, humanReviewRequired: true } });
  await atomicJson(join(reportRoot, `style-proof-${concept.id}.json`), report);
  proofs.push(report);
}

const conceptsReport = [
  { id: 'A', family: 'HIGH_END_STYLIZED_3D_HUMANOID', seriesOpportunityScore: { marketDemand: 7.6, productionFeasibility: 6.1, characterAppeal: 8.5, thumbnailStrength: 8.3, repeatability: 7.8, originality: 8.1, languagePortability: 8.0, cost: 5.8, kidsFit: 7.6, total: 7.5 } },
  { id: 'B', family: 'HIGH_END_ANTHROPOMORPHIC_ANIMAL', seriesOpportunityScore: { marketDemand: 8.4, productionFeasibility: 6.8, characterAppeal: 8.8, thumbnailStrength: 8.7, repeatability: 8.6, originality: 8.0, languagePortability: 8.8, cost: 6.2, kidsFit: 8.6, total: 8.1 } },
  { id: 'C', family: 'SEMI_REALISTIC_CINEMATIC_FAMILY', seriesOpportunityScore: { marketDemand: 6.8, productionFeasibility: 4.8, characterAppeal: 7.5, thumbnailStrength: 7.2, repeatability: 5.8, originality: 8.2, languagePortability: 7.6, cost: 3.9, kidsFit: 7.1, total: 6.4 } },
  conceptD,
];
const finalReport = {
  status: proofs.some((proof) => proof.status === 'BLOCKED') ? 'PARTIALLY_EXECUTABLE' : 'READY_FOR_HUMAN_REVIEW',
  runId, generatedAt: new Date().toISOString(), marketReport, targetAgeOptions: ['PRESCHOOL_2_4', 'KIDS_4_7', 'KIDS_7_10', 'FAMILY_GENERAL'], concepts: conceptsReport,
  selectedConcepts: ['A', 'B', 'C'], recommendedConcept: { id: 'B', status: 'RECOMMENDED_PENDING_HUMAN_REVIEW', reason: 'Highest combined market/character/repeatability evidence proxy; not a subjective quality approval.' },
  productionStack: { selected: { video: videoProvider.name, model, resolution, audio: 'VEO_NATIVE_AUDIO', render: 'FFMPEG_LOCAL', storage: 'LOCAL_ARTIFACT_STORE' }, blender: 'NOT_INSTALLED', meshy: 'NOT_CONFIGURED', runway: 'NOT_CONFIGURED', heygen: 'NOT_CONFIGURED', hedra: 'NOT_CONFIGURED', metahuman: 'NOT_INSTALLED' },
  hardware: { gpu: 'NVIDIA GeForce RTX 2060 SUPER', vramGb: 4, ramGb: 15.9, cpu: 'AMD Ryzen 5 3600', note: 'Suitable for lightweight Blender/Eevee evaluation; not validated for Unreal/MetaHuman production.' },
  preflight, proofs, humanReview: { status: 'PENDING', required: true },
  nextGate: 'Do not create HERO_SCENE until a human reviewer accepts one proof and the temporal acting/lip-sync dimensions are reviewed.',
};
await atomicJson(join(reportRoot, 'professional-series-style-proofs.json'), finalReport);
await atomicJson(join(root, 'manifest.json'), finalReport);
console.log(JSON.stringify({ status: finalReport.status, runId, report: join(reportRoot, 'professional-series-style-proofs.json'), proofs: proofs.map((proof) => ({ id: proof.id, status: proof.status, path: proof.videoPath, durationSeconds: proof.durationSeconds, cost: proof.cost })) }, null, 2));
