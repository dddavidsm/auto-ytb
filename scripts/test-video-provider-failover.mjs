import assert from 'node:assert/strict';
import { FailoverGenerativeVideoProvider, isSafeVideoProviderFailoverError } from '@auto-ytb/providers';

function provider({ name, model, modes = ['TEXT_TO_VIDEO'], rate, generate, maxDurationSeconds = 30, references = false }) {
  const calls = [];
  return {
    name,
    calls,
    capability: {
      provider: name,
      model,
      modes,
      maxDurationSeconds,
      aspectRatios: ['16:9', '9:16'],
      resolutions: ['720p'],
      referenceImageSupport: references,
      firstLastFrameSupport: references,
      audioSupport: false,
      deterministicSeedSupport: false,
      estimatedUsdPerSecond: rate,
      credentialStatus: 'LIVE',
    },
    estimateCost(input) {
      return {
        estimatedUsd: rate == null ? null : Number((input.durationSeconds * rate).toFixed(4)),
        currency: 'USD',
        source: `${name}-fixture-price`,
      };
    },
    async generate(input) { return this.generateShot(input); },
    async generateShot(input) {
      calls.push(input);
      return generate(input, calls.length);
    },
  };
}

assert.equal(isSafeVideoProviderFailoverError(new Error('GEMINI_HTTP_429:RESOURCE_EXHAUSTED')), true);
assert.equal(isSafeVideoProviderFailoverError(new Error('provider quota exhausted')), true);
assert.equal(isSafeVideoProviderFailoverError(new Error('INVALID_ARGUMENT: prompt malformed')), false);
assert.equal(isSafeVideoProviderFailoverError(new Error('socket timeout after request submission')), false, 'ambiguous timeout must not risk a duplicate paid generation');
console.log('✓ failover classifier only treats availability/auth/quota failures as safe automatic failover');

{
  let clock = 1_000;
  const primary = provider({
    name: 'gemini', model: 'veo-fast', rate: 0.1,
    generate: (_input, call) => {
      if (call === 1) throw new Error('GEMINI_HTTP_429:RESOURCE_EXHAUSTED');
      return { id: `gemini-${call}`, uri: 'file:///gemini.mp4', mimeType: 'video/mp4', provider: 'gemini', model: 'veo-fast', costUsd: 0.4, metadata: { generatedDurationSeconds: 4 } };
    },
  });
  const secondary = provider({
    name: 'higgsfield', model: 'seedance-2.5', rate: 0.15,
    generate: () => ({ id: 'hf-1', uri: 'file:///hf.mp4', mimeType: 'video/mp4', provider: 'higgsfield', model: 'seedance-2.5', costUsd: 0.6, metadata: { generatedDurationSeconds: 4 } }),
  });
  const failover = new FailoverGenerativeVideoProvider({ providers: [primary, secondary], cooldownMs: 60_000, now: () => clock });
  const estimate = failover.estimateCost({ durationSeconds: 4, mode: 'TEXT_TO_VIDEO', resolution: '720p' });
  assert.equal(estimate.estimatedUsd, 0.6, 'reservation uses the most expensive compatible provider ceiling');
  const result = await failover.generateShot({ prompt: 'orange cat rescue', durationSeconds: 4, aspectRatio: '9:16', resolution: '720p', mode: 'TEXT_TO_VIDEO' });
  assert.equal(result.provider, 'higgsfield');
  assert.equal(result.costUsd, 0.6);
  assert.equal(result.metadata.failover.used, true);
  assert.equal(result.metadata.failover.attempts.length, 2);
  assert.equal(result.metadata.failover.attempts[0].outcome, 'FAILED_OVER');
  assert.equal(result.metadata.failover.attempts[1].outcome, 'SUCCEEDED');
  assert.equal(primary.calls.length, 1);
  assert.equal(secondary.calls.length, 1);
  assert.equal(failover.getHealthSnapshot().find((row) => row.provider === 'gemini').state, 'CIRCUIT_OPEN');

  await failover.generateShot({ prompt: 'next shot', durationSeconds: 4, aspectRatio: '9:16', resolution: '720p', mode: 'TEXT_TO_VIDEO' });
  assert.equal(primary.calls.length, 1, 'open circuit prevents repeated quota calls');
  assert.equal(secondary.calls.length, 2);

  clock += 60_001;
  const recovered = await failover.generateShot({ prompt: 'after cooldown', durationSeconds: 4, aspectRatio: '9:16', resolution: '720p', mode: 'TEXT_TO_VIDEO', metadata: { preferredProvider: 'gemini' } });
  assert.equal(recovered.provider, 'gemini');
  assert.equal(primary.calls.length, 2, 'provider is eligible again after cooldown');
  assert.equal(failover.getHealthSnapshot().find((row) => row.provider === 'gemini').state, 'READY');
  console.log('✓ quota failure falls over once, opens a circuit, and safely recovers after cooldown');
}

{
  const primary = provider({
    name: 'bad-request-provider', model: 'model-a', rate: 0.1,
    generate: () => { throw new Error('INVALID_ARGUMENT: malformed prompt'); },
  });
  const secondary = provider({
    name: 'should-not-run', model: 'model-b', rate: 0.1,
    generate: () => ({ id: 'unexpected', uri: 'file:///unexpected.mp4', mimeType: 'video/mp4', provider: 'should-not-run', metadata: {} }),
  });
  const failover = new FailoverGenerativeVideoProvider({ providers: [primary, secondary] });
  await assert.rejects(
    failover.generateShot({ prompt: 'bad request fixture', durationSeconds: 4, aspectRatio: '16:9', mode: 'TEXT_TO_VIDEO' }),
    /INVALID_ARGUMENT/,
  );
  assert.equal(secondary.calls.length, 0, 'content/request errors must be repaired, not duplicated across paid providers');
  console.log('✓ unsafe request errors do not trigger blind cross-provider duplication');
}

{
  const textOnly = provider({
    name: 'text-only', model: 'text-v1', rate: 0.1,
    modes: ['TEXT_TO_VIDEO'],
    generate: () => { throw new Error('text-only provider must not receive reference requests'); },
  });
  const reference = provider({
    name: 'reference-provider', model: 'ref-v1', rate: 0.2,
    modes: ['TEXT_TO_VIDEO', 'REFERENCE_TO_VIDEO'], references: true,
    generate: () => ({ id: 'ref-1', uri: 'file:///ref.mp4', mimeType: 'video/mp4', provider: 'reference-provider', model: 'ref-v1', metadata: { generatedDurationSeconds: 4 } }),
  });
  const failover = new FailoverGenerativeVideoProvider({ providers: [textOnly, reference] });
  const result = await failover.generateShot({ prompt: 'same recurring character', durationSeconds: 4, aspectRatio: '9:16', mode: 'REFERENCE_TO_VIDEO', referenceUris: ['https://assets.example/character.png'] });
  assert.equal(result.provider, 'reference-provider');
  assert.equal(textOnly.calls.length, 0);
  assert.equal(reference.calls.length, 1);
  console.log('✓ request capability filtering never sends reference-conditioned shots to text-only models');
}

{
  const unknownPrice = provider({
    name: 'unknown-price', model: 'mystery', rate: null,
    generate: () => ({ id: 'should-not-run', uri: 'file:///x.mp4', mimeType: 'video/mp4', provider: 'unknown-price', metadata: {} }),
  });
  const failover = new FailoverGenerativeVideoProvider({ providers: [unknownPrice] });
  assert.equal(failover.estimateCost({ durationSeconds: 4, mode: 'TEXT_TO_VIDEO' }).estimatedUsd, null);
  await assert.rejects(
    failover.generateShot({ prompt: 'priced generation required', durationSeconds: 4, aspectRatio: '16:9', mode: 'TEXT_TO_VIDEO' }),
    /VIDEO_PROVIDER_FAILOVER_PRICE_REQUIRED/,
  );
  assert.equal(unknownPrice.calls.length, 0, 'unknown price fails before a paid request');
  console.log('✓ unknown provider pricing fails closed before generation');
}

console.log('Video provider failover regression suite passed.');
