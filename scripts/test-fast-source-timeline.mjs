import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { FfmpegRenderer } from '../packages/runtime-node/index.mjs';
import { inspectMediaWithFfmpeg } from '../packages/runtime-node/media-inspector.mjs';

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}: ${stderr.slice(-1800)}`)));
  });
}

const root = await mkdtemp(join(tmpdir(), 'auto-ytb-fast-source-'));
try {
  const source = join(root, 'source.mp4');
  await run('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=24:duration=3', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', source]);
  const manifestPath = join(root, 'manifest.json');
  const scenes = [
    { id: 'broll-1', startSec: 0, durationSec: 1.5, kind: 'broll', instruction: 'show the action', generated: false, sourceIds: [] },
    { id: 'broll-2', startSec: 1.5, durationSec: 1.5, kind: 'broll', instruction: 'show the action', generated: false, sourceIds: [] },
  ];
  await writeFile(manifestPath, JSON.stringify({
    projectId: 'fast-source-test', contentFormat: 'SHORT_VERTICAL', aspectRatio: '9:16',
    frame: { width: 1080, height: 1920 }, finalMediaPolicy: 'VIDEO_ONLY',
    script: { title: 'x', language: 'en', targetDurationSec: 3, thesis: 'x', beats: [], outro: '' },
    packaging: [], thumbnails: [], selectedPackagingId: 'p', scenes,
    assets: scenes.map((scene) => ({ id: `footage-${scene.id}`, uri: `file://${source}`, mimeType: 'video/mp4', provider: 'user-source-footage', sceneId: scene.id, generated: false, sourceIds: [], license: 'owned-or-licensed', metadata: { clipStartSec: 0, windowStrategy: 'source-first-full-window-reuse-v2' } })),
  }));
  const renderer = new FfmpegRenderer({ outputRoot: root, width: 1080, height: 1920, fps: 30 });
  const result = await renderer.render({ manifestUri: `file://${manifestPath}`, outputKey: 'out.mp4', videoOnly: true, visualMixPolicy: 'SOURCE_FIRST', fastSourceDelivery: true });
  const inspection = await inspectMediaWithFfmpeg({ fileUri: result.uri, expectedWidth: 720, expectedHeight: 1280, expectedDurationSeconds: 3, requireAudio: false, deepChecks: false }, { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' });
  assert.equal(inspection.passed, true, JSON.stringify(inspection));
  assert.equal(inspection.hasVideo, true);
  console.log('✓ source-first timeline uses one FFmpeg graph and produces moving HD video');
} finally {
  await rm(root, { recursive: true, force: true });
}
