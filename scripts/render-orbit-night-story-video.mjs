import { createLiveRuntime } from '../packages/runtime-node/factory.mjs';

const env = { ...process.env };
const runtime = createLiveRuntime(env);
const manifestUri = 'file://C:\\Users\\david\\auto-ytb\\.data\\storage\\projects\\e62a7d3d-9f44-4fd1-9e62-2b2fa6c5cf1c\\manifest-orbit-night-story-v1.json';
const result = await runtime.renderer.render({
  manifestUri,
  outputKey: 'projects/e62a7d3d-9f44-4fd1-9e62-2b2fa6c5cf1c/orbit-night-story-v1.mp4',
  format: 'SHORT_VERTICAL',
});
console.log(JSON.stringify(result, null, 2));
