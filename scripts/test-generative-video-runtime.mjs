import assert from 'node:assert/strict';
import { createGenerativeVideoProviderRuntime, describeGenerativeVideoRuntime } from './generative-video-provider-runtime.mjs';

const store = {
  name: 'fixture-store',
  async put(input) {
    return { uri: `file:///tmp/${input.key}`, bytes: typeof input.data === 'string' ? input.data.length : input.data.byteLength };
  },
};

{
  const runtime = createGenerativeVideoProviderRuntime(store, {
    GEMINI_API_KEY: 'gemini-key',
    VIDEO_PROVIDER: 'auto',
  });
  assert.equal(runtime.name, 'gemini-video');
  assert.equal(describeGenerativeVideoRuntime(runtime).strategy, 'SINGLE_PROVIDER');
  console.log('✓ auto mode preserves Gemini as the single provider when no server-side Higgsfield credentials exist');
}

{
  const runtime = createGenerativeVideoProviderRuntime(store, {
    GEMINI_API_KEY: 'gemini-key',
    HF_CREDENTIALS: 'hf-id:hf-secret',
    HIGGSFIELD_VIDEO_MODEL: 'bytedance/seedance-2.5/text-to-video',
    VIDEO_PROVIDER: 'auto',
    VIDEO_PROVIDER_PRIORITY: 'higgsfield,gemini',
  });
  const summary = describeGenerativeVideoRuntime(runtime);
  assert.equal(runtime.name, 'video-provider-failover');
  assert.equal(summary.strategy, 'FAILOVER');
  assert.deepEqual(summary.members.map((item) => item.provider), ['higgsfield', 'gemini-video']);
  assert.equal(runtime.capability.modes.includes('REFERENCE_TO_VIDEO'), true);
  console.log('✓ auto mode composes legitimate Gemini + Higgsfield server credentials into failover in configured priority order');
}

{
  const runtime = createGenerativeVideoProviderRuntime(store, {
    GEMINI_API_KEY: 'gemini-key',
    HF_CREDENTIALS: 'hf-id:hf-secret',
    VIDEO_PROVIDER: 'gemini',
  });
  assert.equal(runtime.name, 'gemini-video', 'explicit provider selection remains single-provider unless failover is explicitly enabled');
  console.log('✓ explicit Gemini remains deterministic by default');
}

{
  const runtime = createGenerativeVideoProviderRuntime(store, {
    GEMINI_API_KEY: 'gemini-key',
    HF_CREDENTIALS: 'hf-id:hf-secret',
    VIDEO_PROVIDER: 'gemini',
    VIDEO_PROVIDER_FAILOVER_ENABLED: 'true',
  });
  assert.equal(runtime.name, 'video-provider-failover');
  assert.deepEqual(describeGenerativeVideoRuntime(runtime).members.map((item) => item.provider), ['gemini-video', 'higgsfield']);
  console.log('✓ explicit Gemini can opt into Higgsfield fallback without changing the primary provider');
}

{
  assert.throws(
    () => createGenerativeVideoProviderRuntime(store, { VIDEO_PROVIDER: 'auto' }),
    /NO_GENERATIVE_VIDEO_PROVIDER_READY:GEMINI_API_KEY_OR_HIGGSFIELD_SERVER_CREDENTIALS/,
  );
  console.log('✓ a ChatGPT/MCP connection alone cannot masquerade as a repository runtime credential');
}

{
  assert.throws(
    () => createGenerativeVideoProviderRuntime(store, { GEMINI_API_KEY: 'gemini-key', VIDEO_PROVIDER: 'higgsfield' }),
    /NO_GENERATIVE_VIDEO_PROVIDER_READY:HF_CREDENTIALS_OR_HF_API_KEY_ID_SECRET/,
  );
  console.log('✓ explicit Higgsfield fails closed when server-side credentials are missing');
}

{
  const runtime = createGenerativeVideoProviderRuntime(store, {
    GEMINI_API_KEY: 'gemini-key',
    VIDEO_PROVIDER: 'higgsfield',
    VIDEO_PROVIDER_FAILOVER_ENABLED: 'true',
  });
  assert.equal(runtime.name, 'gemini-video');
  console.log('✓ explicit Higgsfield may fall back to a configured Gemini provider only when failover is explicitly enabled');
}

console.log('Generative video runtime selection regression suite passed.');
