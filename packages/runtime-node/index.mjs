import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';

function fileUri(path) { return `file://${resolve(path)}`; }
function pathFromUri(uri) {
  if (uri.startsWith('file://')) return new URL(uri).pathname;
  if (isAbsolute(uri) || uri.startsWith('.')) return resolve(uri);
  return null;
}
async function run(command, args) {
  await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolvePromise() : reject(new Error(`${command} exited ${code}: ${stderr.slice(-2000)}`)));
  });
}

export class NodeLocalObjectStore {
  name = 'node-local-store';
  constructor(root = '.data/storage') { this.root = resolve(root); }
  async put(input) {
    const path = resolve(this.root, input.key);
    await mkdir(dirname(path), { recursive: true });
    const body = typeof input.data === 'string' ? input.data : Buffer.from(input.data);
    await writeFile(path, body);
    return { uri: fileUri(path), bytes: typeof body === 'string' ? Buffer.byteLength(body) : body.byteLength };
  }
}

export class NodeUploadAssetLoader {
  async load(uri) {
    const local = pathFromUri(uri);
    if (local) {
      const body = new Uint8Array(await readFile(local));
      return { body, size: body.byteLength, mimeType: mimeFor(local) };
    }
    if (/^https?:\/\//.test(uri)) {
      const response = await fetch(uri);
      if (!response.ok) throw new Error(`Cannot load upload asset ${response.status}`);
      const body = new Uint8Array(await response.arrayBuffer());
      return { body, size: body.byteLength, mimeType: response.headers.get('content-type') ?? 'video/mp4' };
    }
    throw new Error(`Unsupported upload asset URI: ${uri}`);
  }
}

function mimeFor(path) {
  const ext = extname(path).toLowerCase();
  if (ext === '.mp4' || ext === '.m4v') return 'video/mp4';
  if (ext === '.webm') return 'video/webm';
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.mp3') return 'audio/mpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

export class FfmpegRenderer {
  name = 'ffmpeg-local';
  constructor(options = {}) {
    this.ffmpeg = options.ffmpeg ?? 'ffmpeg';
    this.width = options.width ?? 1920;
    this.height = options.height ?? 1080;
    this.fps = options.fps ?? 30;
    this.outputRoot = resolve(options.outputRoot ?? '.data/renders');
  }

  async materialize(uri, destBase) {
    const local = pathFromUri(uri);
    if (local && existsSync(local)) return local;
    if (/^https?:\/\//.test(uri)) {
      const response = await fetch(uri);
      if (!response.ok) throw new Error(`Asset download failed ${response.status}: ${uri}`);
      const contentType = response.headers.get('content-type') ?? '';
      const ext = contentType.includes('png') ? '.png' : contentType.includes('jpeg') ? '.jpg' : contentType.includes('audio') ? '.wav' : '.mp4';
      const path = `${destBase}${ext}`;
      await writeFile(path, Buffer.from(await response.arrayBuffer()));
      return path;
    }
    return null;
  }

  async render(input) {
    const manifestPath = pathFromUri(input.manifestUri);
    if (!manifestPath) throw new Error('FfmpegRenderer requires a local/file:// manifest URI');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const width = Math.max(320, Number(manifest.frame?.width ?? this.width));
    const height = Math.max(320, Number(manifest.frame?.height ?? this.height));
    const work = join(tmpdir(), `auto-ytb-${manifest.projectId}-${Date.now()}`);
    await mkdir(work, { recursive: true });
    const clips = [];
    for (let index = 0; index < manifest.scenes.length; index += 1) {
      const scene = manifest.scenes[index];
      const clip = join(work, `scene-${String(index).padStart(4, '0')}.mp4`);
      const asset = manifest.assets.find((candidate) => candidate.sceneId === scene.id);
      const source = asset ? await this.materialize(asset.uri, join(work, `asset-${index}`)) : null;
      const duration = Math.max(0.2, Number(scene.durationSec));
      if (source && mimeFor(source).startsWith('image/')) {
        await run(this.ffmpeg, ['-y','-loop','1','-i',source,'-t',String(duration),'-vf',`scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`,'-r',String(this.fps),'-an','-c:v','libx264','-preset','veryfast',clip]);
      } else if (source && mimeFor(source).startsWith('video/')) {
        await run(this.ffmpeg, ['-y','-stream_loop','-1','-i',source,'-t',String(duration),'-vf',`scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`,'-r',String(this.fps),'-an','-c:v','libx264','-preset','veryfast',clip]);
      } else {
        const textFile = join(work, `scene-${index}.txt`);
        await writeFile(textFile, String(scene.instruction ?? '').slice(0, 240));
        const fontSize = Math.max(32, Math.round(Math.min(width,height) * 0.038));
        const filter = `drawtext=textfile='${textFile.replaceAll("'", "\\'")}':fontcolor=white:fontsize=${fontSize}:line_spacing=12:x=(w-text_w)/2:y=(h-text_h)/2,format=yuv420p`;
        await run(this.ffmpeg, ['-y','-f','lavfi','-i',`color=c=0x101114:s=${width}x${height}:r=${this.fps}:d=${duration}`,'-vf',filter,'-an','-c:v','libx264','-preset','veryfast',clip]);
      }
      clips.push(clip);
    }
    if (!clips.length) throw new Error('Manifest has no scenes');
    const concatList = join(work, 'concat.txt');
    await writeFile(concatList, clips.map((path) => `file '${path.replaceAll("'", "'\\''")}'`).join('\n'));
    const joined = join(work, 'joined.mp4');
    await run(this.ffmpeg, ['-y','-f','concat','-safe','0','-i',concatList,'-c','copy',joined]);

    const out = resolve(this.outputRoot, input.outputKey);
    await mkdir(dirname(out), { recursive: true });
    const voicePath = manifest.voice?.uri ? await this.materialize(manifest.voice.uri, join(work, 'voice')) : null;
    if (voicePath && mimeFor(voicePath).startsWith('audio/')) {
      await run(this.ffmpeg, ['-y','-i',joined,'-i',voicePath,'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','192k','-shortest',out]);
    } else {
      await copyFile(joined, out);
    }
    return { id:`render-${manifest.projectId}`, uri:fileUri(out), mimeType:'video/mp4', provider:this.name, durationSeconds:manifest.script?.targetDurationSec, costUsd:0, metadata:{width,height,contentFormat:manifest.contentFormat,aspectRatio:manifest.aspectRatio} };
  }
}

export class NodePostgresSqlClient {
  constructor(connectionString, options = {}) {
    this.connectionString = connectionString;
    this.options = options;
    this.poolPromise = null;
  }
  async pool() {
    if (!this.poolPromise) {
      this.poolPromise = import('pg').then(({ Pool }) => new Pool({ connectionString: this.connectionString, max: this.options.max ?? 8, ssl: this.options.ssl ?? undefined }));
    }
    return this.poolPromise;
  }
  async query(text, values = []) {
    const pool = await this.pool();
    const result = await pool.query(text, values);
    return { rows: result.rows };
  }
  async transaction(work) {
    const pool = await this.pool();
    const client = await pool.connect();
    try {
      await client.query('begin');
      const tx = { query: async (text, values = []) => { const result = await client.query(text, values); return { rows: result.rows }; } };
      const value = await work(tx);
      await client.query('commit');
      return value;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally { client.release(); }
  }
  async close() { if (this.poolPromise) await (await this.poolPromise).end(); }
}
