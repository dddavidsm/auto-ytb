import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { assessMossOpenSource3d, mossOpenSource3dProviders, parseNvidiaSmiMemory } from './lib/moss-open-source-3d.mjs';

function run(command, args = []) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', (error) => resolve({ code: 1, stdout, stderr: `${stderr}${error.message}` }));
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

const root = process.cwd();
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const runId = `moss-sf3d-preflight-${stamp}`;
const outDir = path.join(root, '.data', 'pro-series-rnd', runId, 'reports');
await mkdir(outDir, { recursive: true });

let detectedVramGb = null;
const smi = await run('nvidia-smi', ['--query-gpu=memory.total', '--format=csv,noheader,nounits']);
if (smi.code === 0) {
  const mib = smi.stdout.split(/\r?\n/).map((line) => Number.parseFloat(line.trim())).filter(Number.isFinite);
  if (mib.length) detectedVramGb = Math.max(...mib) / 1024;
  if (detectedVramGb == null) detectedVramGb = parseNvidiaSmiMemory(smi.stdout);
}

const pythonCommands = process.platform === 'win32' ? [['py', ['-3', '--version']], ['python', ['--version']]] : [['python3', ['--version']], ['python', ['--version']]];
let python = null;
for (const [command, args] of pythonCommands) {
  const probe = await run(command, args);
  if (probe.code === 0) {
    python = { command, version: `${probe.stdout}${probe.stderr}`.trim() };
    break;
  }
}

const licenseAccepted = process.env.SF3D_LICENSE_ACCEPTED === '1';
const commercialRegistrationRecorded = process.env.SF3D_COMMERCIAL_REGISTRATION_RECORDED === '1';
const region = process.env.MOSS_LICENSE_REGION || 'EU';
const assessment = assessMossOpenSource3d({
  region,
  platform: process.platform,
  vramGb: detectedVramGb,
  sf3dLicenseAccepted: licenseAccepted,
  sf3dCommercialRegistrationRecorded: commercialRegistrationRecorded,
});

const report = {
  runId,
  generatedAt: new Date().toISOString(),
  lineage: ['STYLE_PROOF_B', 'MOSS_CANONICAL_REFERENCE_PACK_V1', 'OPEN_SOURCE_3D_PROVIDER_PREFLIGHT'],
  provider: mossOpenSource3dProviders.SF3D,
  environment: {
    platform: process.platform,
    arch: process.arch,
    nvidiaSmi: { available: smi.code === 0, detectedVramGb, detail: smi.code === 0 ? smi.stdout.trim() : smi.stderr.trim() },
    python,
    huggingFaceTokenPresent: Boolean(process.env.HF_TOKEN || process.env.HUGGING_FACE_HUB_TOKEN),
  },
  legal: {
    region,
    licenseAccepted,
    commercialRegistrationRecorded,
    note: 'The script never accepts a gated model license or registers a commercial license on behalf of the user. R&D generation stays blocked until explicit acceptance is already recorded in the environment.',
  },
  assessment,
  runPlan: {
    sourceImage: process.env.MOSS_REFERENCE_FRONT || path.join(root, '.data', 'pro-series-rnd', process.env.MOSS_REFERENCE_RUN_ID || 'moss-canonical-reference-pack-20260914143349', 'canonical-references', '01-front.png'),
    sf3dHome: process.env.SF3D_HOME || path.join(root, '.tools', 'stable-fast-3d'),
    expectedOutput: path.join(root, '.data', 'pro-series-rnd', 'moss-sf3d-rnd-<timestamp>', 'sf3d-rnd', 'MOSS_SF3D_RND_V1.glb'),
    nextCommand: 'After the HF license has been accepted and SF3D is installed: set SF3D_LICENSE_ACCEPTED=1 and run the local SF3D generation, then pass the GLB to scripts/moss-local-glb-phase2.mjs.',
  },
  noPayment: true,
  noHeroScene: true,
};

const reportPath = path.join(outDir, 'moss-sf3d-preflight.json');
await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify({ reportPath, recommendation: assessment.recommendation, vramGb: detectedVramGb, python, licenseAccepted, hfTokenPresent: report.environment.huggingFaceTokenPresent, heroScene: assessment.heroScene }, null, 2));
