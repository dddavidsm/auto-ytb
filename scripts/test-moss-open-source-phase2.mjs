import assert from 'node:assert/strict';
import { assessMossOpenSource3d, mossOpenSource3dProviders, parseNvidiaSmiMemory } from './lib/moss-open-source-3d.mjs';

assert.equal(mossOpenSource3dProviders.SF3D.exportFormat, 'GLB');
assert.equal(mossOpenSource3dProviders.SF3D.minVramGb, 6);
assert.equal(mossOpenSource3dProviders.HUNYUAN3D21.status, 'BLOCKED_TERRITORY');

const eu = assessMossOpenSource3d({ region: 'ES', platform: 'win32', vramGb: 8, sf3dLicenseAccepted: false });
assert.equal(eu.rows.find((row) => row.provider === 'HUNYUAN3D21').territory, 'FAIL');
assert.equal(eu.rows.find((row) => row.provider === 'SF3D').hardware, 'PASS');
assert.equal(eu.rows.find((row) => row.provider === 'SF3D').rnd, 'BLOCKED');
assert.equal(eu.recommendation, 'SF3D_PREFLIGHT');
assert.equal(eu.heroScene, 'BLOCKED');

const accepted = assessMossOpenSource3d({ region: 'EU', platform: 'win32', vramGb: 12, sf3dLicenseAccepted: true });
assert.equal(accepted.recommendation, 'SF3D_RND_GENERATION');
assert.equal(accepted.rows.find((row) => row.provider === 'SF3D').rnd, 'READY');
assert.equal(accepted.productionMaster, 'BLOCKED');

const productionRecorded = assessMossOpenSource3d({ region: 'EU', platform: 'linux', vramGb: 24, sf3dLicenseAccepted: true, sf3dCommercialRegistrationRecorded: true });
assert.equal(productionRecorded.rows.find((row) => row.provider === 'SF3D').production, 'ELIGIBLE_FOR_PRODUCTION_REVIEW');
assert.equal(productionRecorded.productionMaster, 'REVIEW_REQUIRED');

const weakGpu = assessMossOpenSource3d({ region: 'EU', platform: 'win32', vramGb: 4, sf3dLicenseAccepted: true });
assert.equal(weakGpu.rows.find((row) => row.provider === 'SF3D').hardware, 'FAIL');
assert.equal(weakGpu.recommendation, 'NO_LOCAL_PROVIDER_READY');

assert.ok(parseNvidiaSmiMemory('8192 MiB') > 7.9);
assert.equal(parseNvidiaSmiMemory('not available'), null);

console.log('✓ Moss open-source 3D provider gates: SF3D preferred, Hunyuan blocked in EU, TRELLIS.2 secondary');
