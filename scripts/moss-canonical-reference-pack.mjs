import { mkdir, copyFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { GeminiImageProvider, GeminiVisionProvider } from '../packages/providers/dist/index.js';
import { NodeLocalObjectStore } from '../packages/runtime-node/index.mjs';

const root = resolve('.');
const sourceRoot = join(root, '.data', 'pro-series-rnd', 'pro-series-style-proofs-20260914123059');
const runId = process.env.MOSS_REFERENCE_RUN_ID || `moss-canonical-reference-pack-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}`;
const outRoot = join(root, '.data', 'pro-series-rnd', runId);
const referenceRoot = join(outRoot, 'canonical-references');
const reportRoot = join(outRoot, 'reports');
const store = new NodeLocalObjectStore(join(outRoot, 'provider-cache'));
const apiKey = String(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
if (!apiKey) throw new Error('GEMINI_API_KEY or GOOGLE_API_KEY is required; no image generation started.');
const inputs = [
  join(sourceRoot, 'frames', 'style-proof-B-1s.png'),
  join(sourceRoot, 'frames', 'style-proof-B-6s.png'),
];
if (inputs.some((item) => !existsSync(item))) throw new Error(`Missing Style Proof B source: ${inputs.find((item) => !existsSync(item))}`);

const image = new GeminiImageProvider({ apiKey, store, model: process.env.IMAGE_MODEL || 'gemini-3.1-flash-image', imageSize: '1K' });
const vision = new GeminiVisionProvider({ apiKey, model: process.env.VISION_MODEL || process.env.GEMINI_VISION_MODEL || process.env.GEMINI_TEXT_MODEL || 'gemini-3.8-flash' });
const views = [
  ['01-front', 'front orthographic view'],
  ['02-side', 'clean left side orthographic view'],
  ['03-three-quarter', 'clean three-quarter front-left orthographic view'],
  ['04-back', 'clean rear orthographic view'],
];
const invariant = 'the exact same Moss from the supplied Style Proof B references: original red-panda-inspired anthropomorphic biped, warm russet/orange short fur, cream muzzle and chest marking, rounded ears, expressive dark eyes, compact biped proportions, blue-and-golden-yellow striped scarf, large ringed russet tail, family-animation 3D rendering. Preserve identity; do not invent a new character.';
const outputs = [];
await mkdir(referenceRoot, { recursive: true });
await mkdir(reportRoot, { recursive: true });
for (const [id, view] of views) {
  const prompt = [
    'PRODUCTION CHARACTER TURNAROUND REFERENCE. Derive the character identity only from the supplied references.',
    invariant,
    `Create a full-body ${view}. Neutral A-pose, both arms and hands/paws separated and visible, both legs and feet fully visible, tail fully visible.`,
    'No acorn, no props, no environment, no action, no motion blur, no dramatic perspective, no text, no logo, no watermark. Simple warm-gray studio background, soft even three-point studio lighting, neutral expression, camera at character chest height, near-orthographic lens, consistent scale and framing across all views. This is a geometry reference for a riggable biped, not a cinematic shot.',
  ].join(' ');
  const destination = join(referenceRoot, `${id}.png`);
  if (existsSync(destination)) {
    outputs.push({ id, path: destination, sourceUri: `file://${destination}`, provider: 'gemini-image', model: process.env.IMAGE_MODEL || 'gemini-3.1-flash-image', estimatedCostUsd: 0, referenceCount: inputs.length, prompt, reused: true });
  } else {
    const asset = await image.generate({ prompt, aspectRatio: '2:3', referenceUris: inputs });
    const source = fileURLToPath(asset.uri);
    await copyFile(source, destination);
    outputs.push({ id, path: destination, sourceUri: asset.uri, provider: asset.provider, model: asset.model, estimatedCostUsd: 0.04, referenceCount: asset.metadata?.referenceCount ?? 0, prompt });
  }
}

const qc = [];
for (const item of outputs) {
  const result = await vision.evaluate({
    prompt: `Compare this generated ${item.id} Moss turnaround view against the two supplied source references conceptually. Return JSON with observedMeaning, relevanceScore, continuityScore, artifactQualityScore (0-100) and issues. Judge strict identity continuity: red-panda-inspired biped silhouette, face/eyes/ears/muzzle, cream markings, russet fur, striped scarf, ringed tail, proportions, visible separated limbs, orthographic neutrality. Penalize any new character design, missing tail/scarf, fused limbs, props, dramatic perspective, text or watermark.`,
    imageData: await import('node:fs/promises').then(({ readFile }) => readFile(item.path)),
    mimeType: 'image/png',
  });
  qc.push({ id: item.id, ...result });
}

const attributes = ['face', 'eyes', 'ears', 'muzzle', 'fur pattern', 'chest marking', 'scarf', 'tail rings', 'body proportions', 'hands/paws', 'feet', 'art style'];
const materialIdentityIssue = /new character|wrong (?:species|fur|scarf|tail|face|proportion)|missing (?:tail|scarf|limb|ear|eye|muzzle)|fused (?:limb|leg|arm)|major (?:identity|silhouette|asymmetry)|unusable (?:hands|feet)|watermark|readable text/i;
const fail = qc.some((item) => item.continuityScore < 55 || item.artifactQualityScore < 65 || item.issues.some((issue) => materialIdentityIssue.test(issue)));
const report = {
  runId,
  generatedAt: new Date().toISOString(),
  status: fail ? 'REFERENCE_PACK_FAILED_DO_NOT_CALL_MESHY' : 'REFERENCE_PACK_PASS_READY_FOR_MESHY',
  sourceOfTruth: { styleProofB: join(sourceRoot, 'videos', 'style-proof-B.mp4'), frames: inputs, note: 'Style Proof B supplies identity evidence; generated views intentionally remove props/environment/action.' },
  invariant,
  requestedViews: views.map(([id, view]) => ({ id, view })),
  outputs: outputs.map(({ sourceUri, ...item }) => item),
  consistency: { attributes, perView: qc, gate: fail ? 'FAIL' : 'PASS', rule: 'Material identity drift blocks Meshy; orthographic/presentation imperfections are recorded as MINOR_DRIFT and do not block the prototype.' },
  cost: { estimatedUsd: Number((outputs.length * 0.04).toFixed(2)), actualKnownUsd: null, operation: 'Gemini reference-conditioned image generation', credits: 'Gemini API billing/usage; no Meshy credits consumed.' },
  lineage: ['STYLE_PROOF_B', 'MOSS_VISUAL_IDENTITY_V1', 'MOSS_CANONICAL_REFERENCE_PACK_V1'],
  meshy: { status: fail ? 'BLOCKED_BY_REFERENCE_QC' : 'NOT_STARTED', modelTarget: 'Meshy 7 - Flagship', creditsBefore: 100, creditsSpent: 0, creditsRemaining: 100, license: 'Free workspace default observed as CC BY 4.0; RND_PROTOTYPE_ONLY, not production IP master.' },
  nextAction: fail ? 'Regenerate only failed view(s) with the same reference set; do not call Meshy.' : 'Submit these four views once to Meshy Multi-Image-to-3D; keep output as RND_PROTOTYPE_ONLY pending license review.',
};
await writeFile(join(reportRoot, 'moss-canonical-reference-pack.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ runId, referenceRoot, status: report.status, views: outputs.map((item) => item.path), estimatedUsd: report.cost.estimatedUsd }, null, 2));
