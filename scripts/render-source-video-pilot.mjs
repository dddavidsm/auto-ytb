import { FfmpegRenderer } from '../packages/runtime-node/index.mjs';
import { withArchetypeEditorialFinish } from '../packages/runtime-node/editorial-finish.mjs';

const manifestUri = 'file://C:\\Users\\david\\auto-ytb\\.data\\storage\\projects\\708059c9-f9fb-4d11-b3f1-43c97996ca81\\manifest-source-v2.json';
const raw = new FfmpegRenderer({ outputRoot: '.data/renders', ffmpeg: process.env.FFMPEG_BIN ?? 'ffmpeg' });
const renderer = withArchetypeEditorialFinish(raw, { ffmpeg: process.env.FFMPEG_BIN ?? 'ffmpeg' });
try {
  const result = await renderer.render({
    manifestUri,
  outputKey: 'projects/708059c9-f9fb-4d11-b3f1-43c97996ca81/final-v16.mp4',
  });
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
}
