import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { assessMossPhase2Readiness } from '../packages/production/dist/index.js';
import { BlenderProvider } from '../packages/providers/dist/index.js';

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

async function encode(pattern, output, fps) {
  const result = await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-framerate', String(fps), '-i', pattern, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output]);
  return result.code === 0 ? { status: 'PASS', output } : { status: 'FAILED', error: result.stderr.slice(-2000) };
}

const root = process.cwd();
const glbPath = process.env.MOSS_LOCAL_GLB;
if (!glbPath) throw new Error('MOSS_LOCAL_GLB is required and must point to a legally obtained local GLB.');
if (!existsSync(glbPath)) throw new Error(`MOSS_LOCAL_GLB does not exist: ${glbPath}`);

const provider = process.env.MOSS_3D_PROVIDER || 'LOCAL_UNKNOWN';
const assetClassification = process.env.MOSS_ASSET_CLASSIFICATION || 'RND_PROTOTYPE_ONLY';
const license = process.env.MOSS_3D_LICENSE || 'UNRECORDED';
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const runId = `moss-local-glb-${provider.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${stamp}`;
const outDir = process.env.MOSS_LOCAL_GLB_RUN_DIR || path.join(root, '.data', 'pro-series-rnd', runId);
const reportDir = path.join(outDir, 'reports');
await mkdir(reportDir, { recursive: true });

const blenderPath = process.env.BLENDER_BIN || (process.platform === 'win32' ? 'C:\\Users\\david\\AppData\\Local\\Programs\\Blender Foundation\\Blender 5.2\\blender.exe' : 'blender');
const blender = new BlenderProvider(blenderPath);
const blenderProbe = await blender.probe();
if (!blenderProbe.available) throw new Error(`Blender unavailable: ${blenderProbe.detail || blenderPath}`);

const validationScript = path.join(root, 'scripts', 'blender-moss-validation.py');
const startedAt = Date.now();
const blenderRun = await run(blenderPath, ['-b', '--python', validationScript, '--', '--glb', path.resolve(glbPath), '--out', outDir]);
if (blenderRun.code !== 0) throw new Error(`Blender validation failed (${blenderRun.code}): ${blenderRun.stderr.slice(-6000)}`);

const blenderReport = JSON.parse(await readFile(path.join(reportDir, 'blender-moss-validation.json'), 'utf8'));
const geometryPass = blenderReport.modelQuality?.geometryStatus === 'PASS';
const materialPass = blenderReport.modelQuality?.materialStatus === 'PASS';
const texturePass = blenderReport.modelQuality?.textureStatus === 'PASS';
const modelQuality = geometryPass && materialPass && texturePass ? 'PASS' : 'FAIL';

const turntable = await encode(path.join(outDir, 'turntable', 'frames', 'frame-%04d.png'), path.join(outDir, 'turntable', 'moss-turntable-1080p.mp4'), 12);
let motionEncoded = { status: 'BLOCKED' };
if (blenderReport.motionReel?.status === 'CREATED') {
  motionEncoded = await encode(path.join(outDir, 'motion-reel-rnd', 'frame-%04d.png'), path.join(outDir, 'motion-reel-rnd', 'MOSS_MOTION_REEL_RND.mp4'), 30);
}

const rigPass = blenderReport.rig?.status === 'PASS' && blenderReport.rig?.automaticWeights === true;
const skinningPass = blenderReport.skinning?.status === 'PASS';
const facialReady = blenderReport.face?.status === 'READY';
const motionPass = motionEncoded.status === 'PASS' && skinningPass;
const readiness = assessMossPhase2Readiness({
  referencePack: 'PASS',
  modelExportAvailable: true,
  modelQuality,
  rig: rigPass ? 'PASS' : 'FAIL',
  skinning: skinningPass ? 'PASS' : 'NOT_EVALUATED',
  facial: facialReady ? 'READY' : 'NOT_STARTED',
  motion: motionPass ? 'PASS' : 'NOT_STARTED',
});

const report = {
  runId,
  generatedAt: new Date().toISOString(),
  elapsedMs: Date.now() - startedAt,
  lineage: ['STYLE_PROOF_B', 'MOSS_CANONICAL_REFERENCE_PACK_V1', `${provider}_RND_V1`, 'MOSS_BLENDER_VALIDATION'],
  sourceAsset: { provider, path: path.resolve(glbPath), license, assetClassification },
  blender: { executable: blenderPath, probe: blenderProbe, import: 'PASS', validation: blenderReport, turntable },
  modelQuality: { status: modelQuality, geometryPass, materialPass, texturePass, meshStats: blenderReport.meshStats },
  rig: blenderReport.rig,
  skinning: blenderReport.skinning,
  tail: blenderReport.tail,
  scarf: blenderReport.scarf,
  facial: blenderReport.face,
  motionReel: { source: blenderReport.motionReel, encoded: motionEncoded, accepted: motionPass },
  readiness,
  heroReadiness: readiness.state,
  noHeroScene: readiness.state !== 'READY_FOR_HERO',
  productionMaster: assetClassification === 'PRODUCTION_IP_MASTER' && readiness.state === 'READY_FOR_HERO' ? 'CANDIDATE_REQUIRES_HUMAN_REVIEW' : 'BLOCKED',
  nextAction: readiness.state === 'READY_FOR_HERO' ? 'Perform final human identity/deformation review before any Hero Scene.' : 'Fix the exact readiness blockers; do not promote this GLB or generate Hero Scene yet.',
};

const reportPath = path.join(reportDir, 'moss-local-glb-phase2.json');
await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ reportPath, provider, modelQuality, rig: rigPass ? 'PASS' : 'FAIL', skinning: skinningPass ? 'PASS' : 'FAIL_OR_NOT_EVALUATED', facial: facialReady ? 'READY' : 'NOT_READY', motion: motionPass ? 'PASS' : 'BLOCKED', readiness: readiness.state, blockers: readiness.blockers }, null, 2));
