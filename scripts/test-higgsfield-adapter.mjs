import assert from 'node:assert/strict';
import { HiggsfieldVideoProvider } from '@auto-ytb/providers';

const stored = [];
const store = {
  name: 'test-store',
  async put(input) {
    stored.push(input);
    return {
      uri: `file:///tmp/${input.key}`,
      bytes: typeof input.data === 'string' ? input.data.length : input.data.byteLength,
    };
  },
};

function completedFetch(assertCreate) {
  let createSeen = false;
  let downloadHeaders;
  const fetchFn = async (url, init = {}) => {
    const href = String(url);
    if (href.startsWith('https://api.higgsfield.ai/') && !href.includes('/requests/')) {
      createSeen = true;
      assert.equal(init.headers.authorization, 'Key id:secret');
      assertCreate(href, JSON.parse(init.body));
      return new Response(JSON.stringify({ request_id: 'hf-job-1', status: 'queued' }), { status: 200 });
    }
    if (href.endsWith('/requests/hf-job-1/status')) {
      assert.equal(init.headers.authorization, 'Key id:secret');
      return new Response(JSON.stringify({ request_id: 'hf-job-1', status: 'completed', video: 'https://cdn.example/hf.mp4' }), { status: 200 });
    }
    if (href === 'https://cdn.example/hf.mp4') {
      downloadHeaders = init.headers;
      return new Response(new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]), { status: 200 });
    }
    throw new Error(`unexpected Higgsfield URL: ${href}`);
  };
  return {
    fetchFn,
    assertions() {
      assert.equal(createSeen, true);
      assert.equal(downloadHeaders, undefined, 'credentials must never be forwarded to a third-party output CDN');
    },
  };
}

const capabilityProvider = new HiggsfieldVideoProvider({
  credentials: 'id:secret',
  model: 'bytedance/seedance-2.5/text-to-video',
  store,
  fetchFn: async () => { throw new Error('not called'); },
});
assert.deepEqual(capabilityProvider.capability.modes, ['TEXT_TO_VIDEO', 'IMAGE_TO_VIDEO', 'REFERENCE_TO_VIDEO', 'VIDEO_TO_VIDEO']);
assert.equal(capabilityProvider.capability.maxDurationSeconds, 30);
assert.equal(capabilityProvider.capability.referenceImageSupport, true);
assert.equal(capabilityProvider.capability.firstLastFrameSupport, true);
assert.deepEqual(capabilityProvider.capability.resolutions, ['480p', '720p']);
console.log('✓ Higgsfield Seedance 2.5 capability profile exposes multimode generation truthfully');

{
  const test = completedFetch((url, body) => {
    assert.equal(url, 'https://api.higgsfield.ai/bytedance/seedance-2.5/text-to-video');
    assert.equal(body.prompt, 'cinematic cat rescue');
    assert.equal(body.duration, 30, 'duration is bounded by the selected model profile');
    assert.equal(body.aspect_ratio, '9:16');
    assert.equal(body.output_format, 'mp4');
    assert.equal(body.generate_audio, false);
  });
  const provider = new HiggsfieldVideoProvider({ credentials: 'id:secret', model: 'bytedance/seedance-2.5/text-to-video', store, fetchFn: test.fetchFn, pollMs: 0 });
  const asset = await provider.generateShot({ prompt: 'cinematic cat rescue', durationSeconds: 42, aspectRatio: '9:16', mode: 'TEXT_TO_VIDEO' });
  assert.equal(asset.model, 'bytedance/seedance-2.5/text-to-video');
  assert.equal(asset.metadata.generatedDurationSeconds, 30);
  assert.equal(asset.metadata.referenceConditioned, false);
  test.assertions();
  console.log('✓ Higgsfield Seedance 2.5 text-to-video uses the official route and bounded parameters');
}

{
  const test = completedFetch((url, body) => {
    assert.equal(url, 'https://api.higgsfield.ai/bytedance/seedance-2.5/image-to-video');
    assert.equal(body.image_url, 'https://assets.example/cat-start.png');
    assert.equal(body.end_image_url, 'https://assets.example/cat-end.png');
    assert.equal(body.duration, 4);
    assert.equal(body.output_format, 'mp4');
  });
  const provider = new HiggsfieldVideoProvider({ credentials: 'id:secret', model: 'bytedance/seedance-2.5/text-to-video', store, fetchFn: test.fetchFn, pollMs: 0 });
  const asset = await provider.generateShot({
    prompt: 'same cat runs toward shelter',
    durationSeconds: 2,
    aspectRatio: '9:16',
    mode: 'IMAGE_TO_VIDEO',
    firstFrameUri: 'https://assets.example/cat-start.png',
    lastFrameUri: 'https://assets.example/cat-end.png',
  });
  assert.equal(asset.model, 'bytedance/seedance-2.5/image-to-video');
  assert.equal(asset.metadata.referenceConditioned, true);
  test.assertions();
  console.log('✓ Higgsfield image-to-video routes start/end frames without leaking credentials');
}

{
  const test = completedFetch((url, body) => {
    assert.equal(url, 'https://api.higgsfield.ai/bytedance/seedance-2.5/reference-to-video');
    assert.deepEqual(body.image_urls, ['https://assets.example/character.png', 'https://assets.example/world.png']);
    assert.deepEqual(body.video_urls, ['https://assets.example/motion.mp4']);
    assert.equal(body.aspect_ratio, '16:9');
  });
  const provider = new HiggsfieldVideoProvider({ credentials: 'id:secret', model: 'bytedance/seedance-2.5/text-to-video', store, fetchFn: test.fetchFn, pollMs: 0 });
  const asset = await provider.generateShot({
    prompt: 'preserve the same character and environment',
    durationSeconds: 8,
    aspectRatio: '16:9',
    mode: 'REFERENCE_TO_VIDEO',
    referenceUris: ['https://assets.example/character.png', 'https://assets.example/world.png'],
    inputVideoUri: 'https://assets.example/motion.mp4',
  });
  assert.equal(asset.model, 'bytedance/seedance-2.5/reference-to-video');
  assert.equal(asset.metadata.referenceCount, 3);
  test.assertions();
  console.log('✓ Higgsfield reference-to-video sends image and video conditioning to the dedicated route');
}

{
  const test = completedFetch((url, body) => {
    assert.equal(url, 'https://api.higgsfield.ai/bytedance/seedance-2.5/video-edit');
    assert.equal(body.video_url, 'https://assets.example/source.mp4');
    assert.equal(body.prompt, 'make the lighting match the neighboring documentary footage');
    assert.equal('duration' in body, false, 'video-edit follows source duration and must not invent a duration field');
  });
  const provider = new HiggsfieldVideoProvider({ credentials: 'id:secret', model: 'bytedance/seedance-2.5/text-to-video', store, fetchFn: test.fetchFn, pollMs: 0 });
  const asset = await provider.generateShot({
    prompt: 'make the lighting match the neighboring documentary footage',
    durationSeconds: 8,
    aspectRatio: '16:9',
    mode: 'VIDEO_TO_VIDEO',
    inputVideoUri: 'https://assets.example/source.mp4',
  });
  assert.equal(asset.model, 'bytedance/seedance-2.5/video-edit');
  test.assertions();
  console.log('✓ Higgsfield video-to-video uses Seedance 2.5 Video Edit instead of pretending it is text-to-video');
}

{
  const provider = new HiggsfieldVideoProvider({ credentials: 'id:secret', model: 'bytedance/seedance-2.5/text-to-video', store, fetchFn: async () => { throw new Error('network must not be reached'); } });
  await assert.rejects(
    provider.generateShot({
      prompt: 'reference test',
      durationSeconds: 5,
      aspectRatio: '16:9',
      mode: 'IMAGE_TO_VIDEO',
      firstFrameUri: 'file:///private/reference.png',
    }),
    /HIGGSFIELD_REMOTE_REFERENCE_REQUIRED:firstFrameUri/,
  );
  console.log('✓ Higgsfield rejects local-only references before a paid request can be submitted');
}

{
  const calls = [];
  const fetchFn = async (url, init = {}) => {
    calls.push(String(url));
    if (String(url).includes('/wan/v2.7/text-to-video')) {
      const body = JSON.parse(init.body);
      assert.equal(body.seed, 42);
      assert.equal(body.negative_prompt, 'morphing');
      return new Response(JSON.stringify({ video: 'https://cdn.example/wan.mp4', status: 'completed' }), { status: 200 });
    }
    if (String(url) === 'https://cdn.example/wan.mp4') return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    throw new Error(`unexpected ${url}`);
  };
  const provider = new HiggsfieldVideoProvider({ credentials: 'id:secret', model: 'wan/v2.7/text-to-video', store, fetchFn });
  assert.deepEqual(provider.capability.modes, ['TEXT_TO_VIDEO']);
  assert.equal(provider.capability.deterministicSeedSupport, true);
  const asset = await provider.generateShot({ prompt: 'realistic animal', durationSeconds: 7, aspectRatio: '16:9', seed: 42, negativePrompt: 'morphing' });
  assert.equal(asset.model, 'wan/v2.7/text-to-video');
  assert.equal(calls.length, 2);
  console.log('✓ Existing Wan 2.7 Higgsfield route remains backward-compatible');
}

console.log('Higgsfield adapter regression suite passed.');
