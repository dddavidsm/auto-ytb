import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const runId = `moss-tripo-rodin-phase2-${stamp}`;
const outDir = path.join(root, '.data', 'pro-series-rnd', runId);
const reportDir = path.join(outDir, 'reports');
await mkdir(reportDir, { recursive: true });

const report = {
  runId,
  generatedAt: new Date().toISOString(),
  scope: 'Provider bake-off after Meshy 6 Lite rejection; no Hero Scene and no commercial asset.',
  lineage: [
    'STYLE_PROOF_B',
    'MOSS_CANONICAL_REFERENCE_PACK_V1',
    'MESHY6LITE_RND_REJECTED_PIPELINE_FIXTURE',
    'TRIPO_RND_PREVIEW_ONLY',
    'RODIN_RND_PREVIEW_ONLY',
  ],
  meshy6Lite: {
    status: 'REJECTED_FOR_PRODUCTION',
    role: 'NEGATIVE_FIXTURE',
    export: 'AVAILABLE',
    failureReasons: [
      'downloaded GLB had no usable materials or textures',
      'identity/material match failed',
      'automatic skinning produced severe deformation',
      'no facial system or usable visemes',
      'motion reel failed temporal QC',
    ],
    artifact: '.data/pro-series-rnd/moss-meshy6lite-rnd-20260914170855/meshy6lite-rnd/MOSS_MESHY6LITE_RND_V1.glb',
  },
  tripo: {
    status: 'EXPORT_BLOCKED_FREE_PLAN',
    classification: 'TRIPO_RND_PREVIEW_ONLY',
    account: 'authenticated web session',
    plan: 'FREE',
    modelObserved: 'Tripo v3.1, max quality',
    sourceViews: ['01-front.png'],
    generation: 'COMPLETED',
    creditsBeforeObserved: 200,
    creditsAfterObserved: 145,
    observedCreditSpend: 55,
    preview: {
      triangles: 1895986,
      vertices: 967637,
      visualAssessment: 'recognizable red-panda direction with scarf; preview is not sufficient for Blender validation',
    },
    export: {
      glb: 'BLOCKED',
      fbx: 'BLOCKED',
      blocker: 'Export dialog offered subscription upgrade; no free downloadable package was exposed.',
    },
    resultUrl: 'https://studio.tripo3d.ai/es/workspace/generate/d6dadb2d-59f9-49a7-a214-7240db6eb50a',
  },
  rodin: {
    status: 'PREVIEW_ONLY_EXPORT_BLOCKED',
    classification: 'RODIN_RND_PREVIEW_ONLY',
    account: 'davidsanchezmora17@gmail.com authenticated web session',
    plan: 'FREE',
    walletBeforeObserved: 5,
    walletAfterObserved: 5,
    creditsSpent: 0,
    modelObserved: 'Gen-2.5 (0702), Medium',
    promptObserved: 'Cartoon red panda wearing a striped scarf.',
    generation: 'COMPLETED_PREVIEW',
    resultUrl: 'https://hyper3d.ai/workspace/rodin/80bf742f-8791-4ab7-a22d-215f0bf0e2e5',
    previewAssessment: 'preview is generic/cat-like and does not establish canonical Moss identity or riggability',
    export: {
      geometry: 'LOCKED',
      material: 'LOCKED',
      formats: ['.obj', '.fbx', '.glb', '.usdz', '.stl'],
      blocker: 'UI displayed Unlock: Geometry/Material and a download restriction; subscription was not activated.',
    },
    freeAction: 'Confirm 0.5 Credits was visible, but the observed wallet remained 5 and no export unlocked; no further credit action was taken.',
  },
  comparison: {
    winner: null,
    status: 'NO_EXPORTABLE_FREE_PIPELINE',
    rows: [
      { provider: 'MESHY6LITE', identity: 'FAIL', materials: 'FAIL', blenderExport: 'PASS', rigging: 'FAIL', skinning: 'FAIL', face: 'NOT_READY', license: 'RND/CC BY 4.0' },
      { provider: 'TRIPO', identity: 'PROMISING_PREVIEW', materials: 'NOT_VERIFIABLE', blenderExport: 'BLOCKED', rigging: 'NOT_EVALUATED', skinning: 'NOT_EVALUATED', face: 'NOT_EVALUATED', license: 'RND/free terms; not production master' },
      { provider: 'RODIN', identity: 'FAIL_OR_UNVERIFIED', materials: 'NOT_VERIFIABLE', blenderExport: 'BLOCKED', rigging: 'NOT_EVALUATED', skinning: 'NOT_EVALUATED', face: 'NOT_EVALUATED', license: 'Free preview; verify current terms before commercial use' },
    ],
  },
  blender: {
    status: 'NOT_RUN_FOR_TRIPO_OR_RODIN',
    reason: 'Neither provider exposed a legal downloadable GLB/FBX in the current free sessions.',
    heroReadiness: 'BLOCKED_EXPORT',
  },
  noPayment: true,
  noHeroScene: true,
  nextAction: 'Evaluate a provider with a genuinely exportable free/R&D tier or present the exact paid private-asset option for explicit approval; do not reuse either preview as a production master.',
};

const reportPath = path.join(reportDir, 'moss-tripo-rodin-phase2.json');
await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
await writeFile(path.join(reportDir, 'README.txt'), [
  'MOSS PHASE 2 — TRIPO FIRST / RODIN FALLBACK',
  '',
  'This is an evidence report, not a production asset.',
  'No subscription, purchase, export bypass, or Hero Scene was performed.',
  `Report: ${reportPath}`,
].join('\n'), 'utf8');

console.log(JSON.stringify({ runId, reportPath, status: report.comparison.status, heroReadiness: report.blender.heroReadiness }, null, 2));
