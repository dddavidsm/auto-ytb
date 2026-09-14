import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { assessMossPhase2Readiness, mossMasterDesign } from '../packages/production/dist/index.js';
import { BlenderProvider } from '../packages/providers/dist/index.js';

const repoRoot = process.cwd();
const canonicalRunId = process.env.MOSS_REFERENCE_RUN_ID || 'moss-canonical-reference-pack-20260914143349';
const canonicalDir = path.join(repoRoot, '.data', 'pro-series-rnd', canonicalRunId);
const canonicalReportPath = path.join(canonicalDir, 'reports', 'moss-canonical-reference-pack.json');
const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const outDir = path.join(repoRoot, '.data', 'pro-series-rnd', `moss-meshy-prototype-${timestamp}`);
const reportDir = path.join(outDir, 'reports');
await mkdir(reportDir, { recursive: true });

const canonical = JSON.parse(await readFile(canonicalReportPath, 'utf8'));
const blenderPath = process.env.BLENDER_BIN || 'blender';
const blender = new BlenderProvider(blenderPath);
const blenderProbe = await blender.probe();
const readiness = assessMossPhase2Readiness({
  referencePack: canonical.status === 'REFERENCE_PACK_PASS_READY_FOR_MESHY' ? 'PASS' : 'FAIL',
  modelExportAvailable: false,
  modelQuality: 'NOT_EVALUATED',
  rig: 'NOT_STARTED',
  skinning: 'NOT_EVALUATED',
  facial: 'NOT_STARTED',
  motion: 'NOT_STARTED',
});

const report = {
  runId: `moss-meshy-prototype-${timestamp}`,
  generatedAt: new Date().toISOString(),
  status: readiness.state,
  lineage: ['STYLE_PROOF_B', 'MOSS_VISUAL_IDENTITY_V1', 'MOSS_CANONICAL_REFERENCE_PACK_V1', 'MOSS_3D_PROTOTYPE_V1'],
  sourceReferencePack: canonicalReportPath,
  meshy: {
    account: 'authenticated workspace',
    plan: 'FREE',
    model: 'Meshy 7 - Flagship',
    mode: 'single-image Image-to-3D; Multi-Image is premium-gated',
    sourceView: canonical.outputs.find((item) => item.id === '01-front')?.path || null,
    texture: true,
    resolution: 'STANDARD',
    license: 'CC BY 4.0',
    assetClassification: 'RND_PROTOTYPE_ONLY',
    creditsBeforeObserved: 100,
    estimatedCredits: 30,
    creditsAfterObserved: 100,
    creditLedgerNote: 'The Meshy UI still displayed 100 credits after completion; exact debit is not exposed by the UI.',
    modelStatsObserved: { tris: 1979766, vertices: 1030449 },
    generationStatus: 'COMPLETED_IN_WEB_VIEWER',
    exportStatus: 'BLOCKED_PREMIUM_DOWNLOAD',
    exportBlocker: 'Meshy free workspace requires Premium for model downloads; no plan was purchased.',
  },
  blender: {
    executable: blenderPath,
    probe: blenderProbe,
    validationStatus: 'BLOCKED_NO_LOCAL_GLB_OR_FBX',
    turntable: 'NOT_CREATED',
  },
  mossMaster: { ...mossMasterDesign, modelUri: 'MESHY_WEB_VIEWER_ONLY_RND_PROTOTYPE' },
  modelQuality: { status: 'NOT_EVALUATED', reason: 'The web viewer preview is visible, but Blender renders and mesh inspection require a downloadable GLB/FBX.' },
  rig: { status: 'NOT_STARTED', reason: 'Rigging is intentionally blocked until local model validation passes.' },
  skinning: { status: 'NOT_EVALUATED' },
  tailRig: { status: 'NOT_STARTED' },
  scarfStrategy: 'Separate or skinned deterministic mesh to be decided after GLB inspection.',
  facialStrategy: { status: 'NOT_STARTED', candidates: ['Blender shape keys', 'bone-based facial rig', 'provider facial performance'] },
  motionReel: { status: 'NOT_CREATED', reason: 'No riggable local asset.' },
  readiness,
  noHeroScene: true,
  nextAction: 'Obtain a downloadable Meshy export under a licensed plan or use a locally authored/licensed model; then run Blender validation before rigging.',
};
const reportPath = path.join(reportDir, 'moss-meshy-prototype-phase2.json');
await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ runId: report.runId, status: report.status, reportPath, blender: blenderProbe, meshStats: report.meshy.modelStatsObserved, exportStatus: report.meshy.exportStatus, creditsAfterObserved: report.meshy.creditsAfterObserved }, null, 2));
