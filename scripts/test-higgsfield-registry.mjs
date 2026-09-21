import assert from 'node:assert/strict';
import { ProviderRouter, createDefaultProviderRegistry } from '@auto-ytb/providers';

{
  const registry = createDefaultProviderRegistry({
    HF_CREDENTIALS: 'id:secret',
    HIGGSFIELD_VIDEO_MODEL: 'bytedance/seedance-2.5/text-to-video',
  });
  const higgsfield = registry.get('higgsfield');
  assert.ok(higgsfield);
  assert.equal(higgsfield.credentialStatus, 'LIVE');
  assert.equal(higgsfield.maxDurationSeconds, 30);
  assert.deepEqual(higgsfield.resolutionSupport, ['480p', '720p']);
  assert.equal(higgsfield.referenceImageSupport, true);
  assert.equal(higgsfield.characterConsistencySupport, true);
  assert.equal(higgsfield.seedSupport, false);
  assert.ok(higgsfield.estimatedUnitCostUsd > 0, 'unknown Higgsfield pricing must never be represented as free');
  console.log('✓ Provider registry exposes Seedance 2.5 reference and character-consistency capabilities');
}

{
  const registry = createDefaultProviderRegistry({
    HF_CREDENTIALS: 'id:secret',
    HIGGSFIELD_VIDEO_MODEL: 'bytedance/seedance-2.5/text-to-video',
    HIGGSFIELD_USD_PER_SECOND: '0.2',
  });
  const router = new ProviderRouter(registry);
  const route = router.route({
    capability: 'VIDEO',
    preferredProvider: 'higgsfield',
    aspectRatio: '9:16',
    durationSeconds: 20,
    requireCharacterConsistency: true,
    budgetRemainingUsd: 10,
    qualityTarget: 85,
  });
  assert.equal(route?.provider, 'higgsfield');
  assert.equal(route?.model, 'bytedance/seedance-2.5/text-to-video');
  assert.equal(route?.estimatedUnitCostUsd, 0.2);
  console.log('✓ Provider router can select Higgsfield for long character-consistent vertical shots');
}

{
  const registry = createDefaultProviderRegistry({
    HF_CREDENTIALS: 'id:secret',
    HIGGSFIELD_VIDEO_MODEL: 'wan/v2.7/text-to-video',
  });
  const higgsfield = registry.get('higgsfield');
  assert.ok(higgsfield);
  assert.equal(higgsfield.maxDurationSeconds, 15);
  assert.equal(higgsfield.referenceImageSupport, false);
  assert.equal(higgsfield.characterConsistencySupport, false);
  assert.equal(higgsfield.seedSupport, true);
  assert.ok(higgsfield.estimatedUnitCostUsd > 0);
  console.log('✓ Wan 2.7 remains conservatively classified as text-only in routing metadata');
}

{
  const registry = createDefaultProviderRegistry({
    HIGGSFIELD_VIDEO_MODEL: 'bytedance/seedance-2.5/text-to-video',
  });
  assert.equal(registry.get('higgsfield')?.credentialStatus, 'NO_CREDENTIALS');
  const router = new ProviderRouter(registry);
  const route = router.route({
    capability: 'VIDEO',
    preferredProvider: 'higgsfield',
    aspectRatio: '9:16',
    durationSeconds: 20,
    requireCharacterConsistency: true,
  });
  assert.notEqual(route?.provider, 'higgsfield', 'ChatGPT/MCP connectivity must not be mistaken for a repository API credential');
  console.log('✓ Higgsfield remains unavailable to repository runtime without explicit server-side credentials');
}

console.log('Higgsfield registry regression suite passed.');
