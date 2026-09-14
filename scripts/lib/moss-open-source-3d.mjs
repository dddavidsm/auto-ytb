export const mossOpenSource3dProviders = Object.freeze({
  SF3D: Object.freeze({
    id: 'SF3D',
    name: 'Stable Fast 3D',
    upstream: 'Stability-AI/stable-fast-3d',
    inputMode: 'single-image',
    exportFormat: 'GLB',
    texture: true,
    pbr: true,
    uv: true,
    minVramGb: 6,
    windows: 'EXPERIMENTAL_SUPPORTED',
    linux: 'SUPPORTED',
    modelAccess: 'HUGGINGFACE_GATED_ACCEPTANCE_REQUIRED',
    license: 'Stability AI Community License',
    commercialRule: 'Free commercial use is available below USD 1M annual revenue, subject to the current Community License and commercial registration requirements.',
    rndClassification: 'RND_PROTOTYPE_ONLY_UNTIL_LICENSE_REGISTRATION_RECORDED',
    status: 'PREFERRED_NEXT_PROTOTYPE',
  }),
  TRELLIS2: Object.freeze({
    id: 'TRELLIS2',
    name: 'TRELLIS.2',
    upstream: 'microsoft/TRELLIS.2',
    inputMode: 'single-image',
    exportFormat: 'GLB',
    texture: true,
    pbr: true,
    uv: true,
    minVramGb: 24,
    windows: 'NOT_OFFICIALLY_SUPPORTED_NATIVE',
    linux: 'SUPPORTED',
    modelAccess: 'HUGGINGFACE_ACCESS_MAY_BE_REQUIRED',
    license: 'MIT core; third-party dependencies have separate licenses',
    commercialRule: 'Do not promote to production until dependency-level licensing is reviewed for the exact runtime used.',
    rndClassification: 'RND_PROTOTYPE_ONLY',
    status: 'SECONDARY_HIGH_VRAM_OPTION',
  }),
  HUNYUAN3D21: Object.freeze({
    id: 'HUNYUAN3D21',
    name: 'Hunyuan3D 2.1',
    upstream: 'Tencent-Hunyuan/Hunyuan3D-2.1',
    inputMode: 'image-to-3d',
    exportFormat: '3D asset',
    texture: true,
    pbr: true,
    uv: true,
    minVramGb: null,
    windows: 'UNASSESSED',
    linux: 'SUPPORTED',
    modelAccess: 'OPEN_WEIGHTS_WITH_COMMUNITY_LICENSE',
    license: 'Tencent Hunyuan 3D 2.1 Community License',
    commercialRule: 'License territory expressly excludes the European Union, United Kingdom and South Korea.',
    rndClassification: 'BLOCKED_IN_EU',
    status: 'BLOCKED_TERRITORY',
  }),
});

export function assessMossOpenSource3d({ region = 'EU', platform = process.platform, vramGb = null, sf3dLicenseAccepted = false, sf3dCommercialRegistrationRecorded = false } = {}) {
  const normalizedRegion = String(region || '').trim().toUpperCase();
  const normalizedPlatform = String(platform || '').trim().toLowerCase();
  const eu = normalizedRegion === 'EU' || normalizedRegion === 'EEA' || normalizedRegion === 'SPAIN' || normalizedRegion === 'ES';
  const vram = Number.isFinite(Number(vramGb)) ? Number(vramGb) : null;

  const rows = [];

  const sf3dHardware = vram == null ? 'UNKNOWN' : vram >= mossOpenSource3dProviders.SF3D.minVramGb ? 'PASS' : 'FAIL';
  const sf3dPlatform = normalizedPlatform === 'win32' ? 'EXPERIMENTAL' : normalizedPlatform === 'linux' ? 'PASS' : 'REVIEW';
  const sf3dReadyForRnd = sf3dHardware !== 'FAIL' && sf3dLicenseAccepted;
  rows.push({
    provider: 'SF3D',
    territory: 'PASS',
    hardware: sf3dHardware,
    platform: sf3dPlatform,
    licenseAcceptance: sf3dLicenseAccepted ? 'PASS' : 'BLOCKED_USER_ACCEPTANCE_REQUIRED',
    productionLicense: sf3dCommercialRegistrationRecorded ? 'RECORDED' : 'NOT_RECORDED',
    rnd: sf3dReadyForRnd ? 'READY' : 'BLOCKED',
    production: sf3dReadyForRnd && sf3dCommercialRegistrationRecorded ? 'ELIGIBLE_FOR_PRODUCTION_REVIEW' : 'BLOCKED',
  });

  const trellisHardware = vram == null ? 'UNKNOWN' : vram >= mossOpenSource3dProviders.TRELLIS2.minVramGb ? 'PASS' : 'FAIL';
  rows.push({
    provider: 'TRELLIS2',
    territory: 'PASS',
    hardware: trellisHardware,
    platform: normalizedPlatform === 'linux' ? 'PASS' : 'FAIL_OR_WSL_REQUIRED',
    licenseAcceptance: 'DEPENDENCY_REVIEW_REQUIRED',
    productionLicense: 'BLOCKED_PENDING_DEPENDENCY_REVIEW',
    rnd: trellisHardware === 'PASS' && normalizedPlatform === 'linux' ? 'READY_WITH_LICENSE_REVIEW' : 'BLOCKED',
    production: 'BLOCKED',
  });

  rows.push({
    provider: 'HUNYUAN3D21',
    territory: eu ? 'FAIL' : 'REVIEW',
    hardware: 'NOT_EVALUATED',
    platform: 'NOT_EVALUATED',
    licenseAcceptance: eu ? 'BLOCKED_TERRITORY' : 'REVIEW_REQUIRED',
    productionLicense: eu ? 'BLOCKED_TERRITORY' : 'REVIEW_REQUIRED',
    rnd: eu ? 'BLOCKED' : 'REVIEW_REQUIRED',
    production: eu ? 'BLOCKED' : 'REVIEW_REQUIRED',
  });

  const sf3d = rows.find((row) => row.provider === 'SF3D');
  const trellis = rows.find((row) => row.provider === 'TRELLIS2');
  let recommendation = 'SF3D_PREFLIGHT';
  let reason = 'SF3D has the lowest local hardware threshold and produces textured GLB assets directly.';
  if (sf3d.hardware === 'FAIL') {
    recommendation = trellis.hardware === 'PASS' && trellis.platform === 'PASS' ? 'TRELLIS2_RND_REVIEW' : 'NO_LOCAL_PROVIDER_READY';
    reason = recommendation === 'TRELLIS2_RND_REVIEW'
      ? 'SF3D VRAM requirement failed, while TRELLIS.2 hardware/platform appears viable for R&D subject to dependency licensing review.'
      : 'No evaluated local provider satisfies the observed hardware/platform gate.';
  } else if (sf3d.rnd === 'READY') {
    recommendation = 'SF3D_RND_GENERATION';
    reason = 'SF3D hardware is viable and the gated model license has been explicitly accepted.';
  }

  return {
    region: normalizedRegion,
    platform: normalizedPlatform,
    vramGb: vram,
    rows,
    recommendation,
    reason,
    heroScene: 'BLOCKED',
    productionMaster: sf3d.production === 'ELIGIBLE_FOR_PRODUCTION_REVIEW' ? 'REVIEW_REQUIRED' : 'BLOCKED',
  };
}

export function parseNvidiaSmiMemory(output = '') {
  const matches = String(output).match(/(\d+(?:\.\d+)?)\s*(?:MiB|MB)/gi) || [];
  if (!matches.length) return null;
  const mibValues = matches.map((value) => Number.parseFloat(value)).filter(Number.isFinite);
  if (!mibValues.length) return null;
  return Math.max(...mibValues) / 1024;
}
