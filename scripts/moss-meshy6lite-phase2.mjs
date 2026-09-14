import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { assessMossPhase2Readiness } from '../packages/production/dist/index.js';
import { BlenderProvider } from '../packages/providers/dist/index.js';

const repoRoot = process.cwd();
const runDir = process.env.MOSS_MESHY6LITE_DIR || path.join(repoRoot, '.data', 'pro-series-rnd', 'moss-meshy6lite-rnd-20260914170855');
const glbPath = path.join(runDir, 'meshy6lite-rnd', 'MOSS_MESHY6LITE_RND_V1.glb');
const outDir = runDir;
const blenderPath = process.env.BLENDER_BIN || 'C:\\Users\\david\\AppData\\Local\\Programs\\Blender Foundation\\Blender 5.2\\blender.exe';
const scriptPath = path.join(repoRoot, 'scripts', 'blender-moss-validation.py');
const reportPath = path.join(outDir, 'reports', 'moss-meshy6lite-phase2.json');

if (!existsSync(glbPath)) throw new Error(`Meshy 6 Lite GLB not found: ${glbPath}`);
await mkdir(path.join(outDir, 'reports'), { recursive: true });

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

const blender = new BlenderProvider(blenderPath);
const blenderProbe = await blender.probe();
if (!blenderProbe.available) throw new Error(`Blender unavailable: ${blenderProbe.detail || blenderPath}`);

const startedAt = Date.now();
if (process.env.MOSS_REUSE_BLENDER_REPORT !== '1') {
  const blenderRun = await run(blenderPath, ['-b', '--python', scriptPath, '--', '--glb', glbPath, '--out', outDir]);
  if (blenderRun.code !== 0) {
    const tail = blenderRun.stderr.slice(-6000);
    throw new Error(`Blender validation failed (${blenderRun.code}): ${tail}`);
  }
}

const blenderReportPath = path.join(outDir, 'reports', 'blender-moss-validation.json');
const blenderReport = JSON.parse(await readFile(blenderReportPath, 'utf8'));
const rigReview = {
  ...blenderReport.rig,
  status: 'PROTOTYPE',
  validation: 'STRUCTURE_CREATED_AUTOMATIC_WEIGHTS_UNVALIDATED',
};
const skinningReview = {
  ...blenderReport.skinning,
  status: 'FAIL',
  review: 'FAIL_VISUAL_DEFORMATION',
  issue: 'Pose renders show severe torso/limb stretching and separation; automatic weights are not production-safe.',
};
const motionReview = {
  ...blenderReport.motionReel,
  status: 'CREATED_BUT_REJECTED',
  issue: 'Motion preview is preserved as a negative R&D artifact because the underlying skinning visibly collapses.',
};

async function encode(pattern, output, fps, extra = []) {
  const result = await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-framerate', String(fps), '-i', pattern, ...extra, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output]);
  if (result.code !== 0) return { status: 'FAILED', error: result.stderr.slice(-2000) };
  return { status: 'PASS', output };
}

const turntable = await encode(path.join(outDir, 'turntable', 'frames', 'frame-%04d.png'), path.join(outDir, 'turntable', 'moss-turntable-1080p.mp4'), 12);
let motionReel = { status: 'BLOCKED_SKINNING' };
if (blenderReport.motionReel.status === 'CREATED') {
  motionReel = await encode(path.join(outDir, 'motion-reel-rnd', 'frame-%04d.png'), path.join(outDir, 'motion-reel-rnd', 'MOSS_MOTION_REEL_V1.mp4'), 30);
}

const readiness = assessMossPhase2Readiness({
  referencePack: 'PASS',
  modelExportAvailable: true,
  modelQuality: blenderReport.modelQuality?.geometryStatus === 'PASS' && blenderReport.modelQuality?.materialStatus === 'PASS' && blenderReport.modelQuality?.textureStatus === 'PASS' ? 'PASS' : 'FAIL',
  rig: rigReview.status === 'PASS' && rigReview.automaticWeights ? 'PASS' : 'FAIL',
  skinning: skinningReview.status === 'PASS' ? 'PASS' : 'NOT_EVALUATED',
  facial: blenderReport.face.status === 'READY' ? 'READY' : 'NOT_STARTED',
  motion: motionReel.status === 'PASS' ? 'PASS' : 'NOT_STARTED',
});

const report = {
  runId: path.basename(runDir),
  generatedAt: new Date().toISOString(),
  elapsedMs: Date.now() - startedAt,
  status: readiness.state,
  license: { status: 'RND_PROTOTYPE_ONLY', source: 'Meshy Free', terms: 'CC BY 4.0', commercialMaster: false },
  lineage: ['STYLE_PROOF_B', 'MOSS_VISUAL_IDENTITY_V1', 'MOSS_CANONICAL_REFERENCE_PACK_V1', 'MOSS_MESHY6LITE_RND_V1', 'MOSS_BLENDER_RND_V1', 'MOSS_RIG_PROTOTYPE_V1'],
  sourceReferencePack: path.join(repoRoot, '.data', 'pro-series-rnd', 'moss-canonical-reference-pack-20260914143349', 'canonical-references'),
  meshy: {
    plan: 'FREE', model: 'Meshy 6 Lite', mode: 'single-image Image-to-3D', sourceView: path.join(repoRoot, '.data', 'pro-series-rnd', 'moss-canonical-reference-pack-20260914143349', 'canonical-references', '01-front.png'),
    uploadedDerivative: path.join(repoRoot, '.data', 'pro-series-rnd', 'moss-canonical-reference-pack-20260914143349', 'canonical-references', '01-front-upload-256.jpg'),
    generationStatus: 'COMPLETED', creditsBeforeObserved: 100, creditsSpentObserved: 10, creditsAfterObserved: 90, freeDownloadsBeforeObserved: 10, freeDownloadsAfterObserved: 9, texture: { requestedInUi: true, importedMaterials: 0, importedImages: 0, status: 'NOT_PRESENT_IN_DOWNLOADED_GLB' }, resolution: 'STANDARD', license: 'CC BY 4.0', assetClassification: 'RND_PROTOTYPE_ONLY', modelStatsObserved: { triangles: 69574, vertices: 34783 }, download: { status: 'PASS', format: 'GLB', path: glbPath }, rigUi: { status: 'AVAILABLE_MANUAL_MARKER_FLOW', note: 'Meshy Animate opened the Rig Model wizard; it required manual joint markers. No Meshy rig generation was submitted.' }, mesh7: { status: 'PRESERVED', note: 'Meshy 7 visual prototype remains separate and was not downloaded or modified.' },
  },
  blender: { executable: blenderPath, probe: blenderProbe, import: 'PASS', derivativeBlend: blenderReport.blendFile, normalization: blenderReport.normalization, model: blenderReport.meshStats, turntable, validation: blenderReport },
  rig: rigReview,
  tail: { ...blenderReport.tail, status: 'PROTOTYPE_UNVALIDATED', issue: 'Tail bones exist, but skinning deformation must be repaired before tail motion can pass.' },
  scarf: blenderReport.scarf,
  skinning: skinningReview,
  facial: blenderReport.face,
  visemes: { status: 'NOT_READY', reason: blenderReport.face.status === 'NOT_READY' ? 'No facial shape keys were present in the Meshy 6 Lite export.' : 'No viseme mapping was authored in this R&D pass.', required: ['REST', 'MBP', 'A', 'E', 'I', 'O', 'U', 'FV', 'L', 'WQ', 'SZ'] },
  motionReel: { ...motionReview, encoded: motionReel },
  modelQuality: { ...blenderReport.modelQuality, status: readiness.blockers.includes('3D model quality is not approved') ? 'FAIL' : 'PASS', criteria: ['identity', 'silhouette', 'limb separation', 'tail', 'scarf', 'mesh defects', 'texture/material inspection'], stills: blenderReport.stills },
  temporalMotionQc: { status: 'FAIL', samples: ['start', '25%', '50%', '75%', 'end'], note: 'Frame review found severe deformation in the generated motion preview; no semantic quality is inferred from file validity.' },
  readiness,
  noHeroScene: true,
  nextAction: readiness.state === 'READY_FOR_HERO' ? 'Proceed to a controlled Hero Scene review.' : 'Resolve the listed model/rig/face/motion blockers before Hero Scene.',
};
await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ reportPath, status: report.status, elapsedMs: report.elapsedMs, model: report.blender.model, turntable: report.blender.turntable, rig: report.rig.status, skinning: report.skinning.status, facial: report.facial.status, motionReel: report.motionReel.encoded.status, blockers: report.readiness.blockers }, null, 2));
