import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { escapeFfmpegFilterPath, ffmpegFontOption, pathFromUri } from './file-path.mjs';

function fileUri(path) { return `file://${resolve(path)}`; }
async function run(command, args) {
  await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolvePromise() : reject(new Error(`${command} exited ${code}: ${stderr.slice(-2000)}`)));
  });
}

function srtTime(seconds) {
  const ms = Math.max(0, Math.round(Number(seconds || 0) * 1000));
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const secs = Math.floor((ms % 60_000) / 1000);
  const millis = ms % 1000;
  return `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(secs).padStart(2,'0')},${String(millis).padStart(3,'0')}`;
}

export function alignmentToSubtitleCues(alignment, options = {}) {
  const chars = alignment?.characters ?? [];
  const starts = alignment?.characterStartTimesSeconds ?? [];
  const ends = alignment?.characterEndTimesSeconds ?? [];
  if (!chars.length || chars.length !== starts.length || chars.length !== ends.length) return [];
  const words = [];
  let text = '', start = null, end = null;
  const flush = () => {
    const clean = text.trim();
    if (clean && start != null && end != null) words.push({ text:clean, start:Number(start), end:Number(end) });
    text = ''; start = null; end = null;
  };
  for (let index = 0; index < chars.length; index += 1) {
    const char = String(chars[index] ?? '');
    if (/\s/.test(char)) { flush(); continue; }
    if (start == null) start = Number(starts[index] ?? 0);
    end = Number(ends[index] ?? starts[index] ?? 0);
    text += char;
  }
  flush();
  const maxChars = Math.max(18, Number(options.maxChars ?? 44));
  const maxDuration = Math.max(1.2, Number(options.maxDurationSeconds ?? 3.6));
  const cues = [];
  let current = null;
  for (const word of words) {
    if (!current) { current = { text:word.text, start:word.start, end:word.end }; continue; }
    const candidate = `${current.text} ${word.text}`;
    const duration = word.end - current.start;
    if (candidate.length > maxChars || duration > maxDuration) {
      cues.push(current);
      current = { text:word.text, start:word.start, end:word.end };
    } else {
      current.text = candidate;
      current.end = word.end;
    }
  }
  if (current) cues.push(current);
  return cues.filter((cue) => cue.end > cue.start && cue.text.trim());
}

export function subtitlesToSrt(cues) {
  return cues.map((cue,index)=>`${index+1}\n${srtTime(cue.start)} --> ${srtTime(cue.end)}\n${cue.text.trim()}\n`).join('\n');
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
  if (ext === '.srt') return 'application/x-subrip';
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
    this.targetLufs = Number.isFinite(Number(options.targetLufs)) ? Number(options.targetLufs) : -16;
    this.truePeakDb = Number.isFinite(Number(options.truePeakDb)) ? Number(options.truePeakDb) : -1.5;
    this.loudnessRange = Number.isFinite(Number(options.loudnessRange)) ? Number(options.loudnessRange) : 7;
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

  async renderProcedural({ scene, asset, clip, work, index, width, height, duration }) {
    const textFile = join(work, `procedural-${index}.txt`);
    const label = String(asset?.metadata?.instruction ?? scene.instruction ?? '').replace(/\s+/g,' ').slice(0,180);
    await writeFile(textFile, label);
    const fontSize = Math.max(28, Math.round(Math.min(width,height) * 0.034));
    const margin = Math.round(Math.min(width,height) * 0.07);
    const boxHeight = Math.round(height * 0.42);
    const font=ffmpegFontOption();
    const textFilter = `drawtext=${font?`${font}:`:''}textfile='${escapeFfmpegFilterPath(textFile)}':fontcolor=white:fontsize=${fontSize}:line_spacing=10:x=${margin}:y=h*0.16:box=1:boxcolor=0x0b0d12cc:boxborderw=20`;
    const progress = `drawbox=x=${margin}:y=ih-${margin}:w=(iw-${margin*2})*t/${Math.max(0.2,duration)}:h=${Math.max(8,Math.round(height*0.008))}:color=white@0.85:t=fill`;
    const baseBoxes = `drawbox=x=${margin}:y=ih*0.62:w=iw-${margin*2}:h=${boxHeight}:color=0x171a22@0.72:t=fill`;
    const chartBars = scene.kind === 'chart'
      ? [0.18,0.34,0.52,0.70].map((x,i)=>`drawbox=x=iw*${x}:y=ih*${0.80-i*0.06}:w=iw*0.08:h=ih*${0.12+i*0.06}:color=white@${0.42+i*0.12}:t=fill`).join(',')
      : `drawbox=x=iw*0.16:y=ih*0.72:w=iw*0.22:h=ih*0.035:color=white@0.45:t=fill,drawbox=x=iw*0.16:y=ih*0.78:w=iw*0.42:h=ih*0.022:color=white@0.28:t=fill,drawbox=x=iw*0.16:y=ih*0.83:w=iw*0.31:h=ih*0.022:color=white@0.22:t=fill`;
    const filter = `${baseBoxes},${chartBars},${textFilter},${progress},format=yuv420p`;
    await run(this.ffmpeg, ['-y','-f','lavfi','-i',`color=c=0x0b0d12:s=${width}x${height}:r=${this.fps}:d=${duration}`,'-vf',filter,'-an','-c:v','libx264','-preset','veryfast',clip]);
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
      const duration = Math.max(0.2, Number(scene.durationSec));
      if (asset?.uri?.startsWith('procedural://')) {
        await this.renderProcedural({ scene, asset, clip, work, index, width, height, duration });
        clips.push(clip);
        continue;
      }
      const source = asset ? await this.materialize(asset.uri, join(work, `asset-${index}`)) : null;
      if (source && mimeFor(source).startsWith('image/')) {
        await run(this.ffmpeg, ['-y','-loop','1','-i',source,'-t',String(duration),'-vf',`scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`,'-r',String(this.fps),'-an','-c:v','libx264','-preset','veryfast',clip]);
      } else if (source && mimeFor(source).startsWith('video/')) {
        await run(this.ffmpeg, ['-y','-stream_loop','-1','-i',source,'-t',String(duration),'-vf',`scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`,'-r',String(this.fps),'-an','-c:v','libx264','-preset','veryfast',clip]);
      } else {
        throw new Error(`Scene ${scene.id} has no renderable visual asset`);
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
    let subtitlesUri = null;
    const subtitleCues = alignmentToSubtitleCues(manifest.voice?.alignment, { maxChars:manifest.contentFormat==='SHORT_VERTICAL'?32:48, maxDurationSeconds:manifest.contentFormat==='SHORT_VERTICAL'?2.4:4.2 });
    if (subtitleCues.length) {
      const subtitlePath = out.replace(/\.[^.]+$/,'.srt');
      await writeFile(subtitlePath, subtitlesToSrt(subtitleCues), 'utf8');
      subtitlesUri = fileUri(subtitlePath);
    }
    if (voicePath && mimeFor(voicePath).startsWith('audio/')) {
      const musicPath = manifest.music?.uri ? await this.materialize(manifest.music.uri, join(work,'music')) : null;
      const loudnorm = `loudnorm=I=${this.targetLufs}:TP=${this.truePeakDb}:LRA=${this.loudnessRange}`;
      if (musicPath && mimeFor(musicPath).startsWith('audio/')) {
        await run(this.ffmpeg, ['-y','-i',joined,'-i',voicePath,'-stream_loop','-1','-i',musicPath,'-filter_complex',`[1:a]${loudnorm}[voice];[2:a]volume=${Number(manifest.music?.gain??0.18)}[music];[music][voice]sidechaincompress=threshold=0.025:ratio=10:attack=18:release=420[ducked];[voice][ducked]amix=inputs=2:duration=first:normalize=0[aout]`,'-map','0:v:0','-map','[aout]','-c:v','copy','-c:a','aac','-b:a','192k','-shortest',out]);
      } else {
        await run(this.ffmpeg, ['-y','-i',joined,'-i',voicePath,'-map','0:v:0','-map','1:a:0','-c:v','copy','-filter:a',loudnorm,'-c:a','aac','-b:a','192k','-shortest',out]);
      }
    } else {
      await copyFile(joined, out);
    }
    return { id:`render-${manifest.projectId}`, uri:fileUri(out), mimeType:'video/mp4', provider:this.name, durationSeconds:manifest.script?.targetDurationSec, costUsd:0, metadata:{width,height,contentFormat:manifest.contentFormat,aspectRatio:manifest.aspectRatio,subtitlesUri,subtitleCueCount:subtitleCues.length,audioMaster:{targetLufs:this.targetLufs,truePeakDb:this.truePeakDb,loudnessRange:this.loudnessRange,musicDucking:Boolean(manifest.music?.uri)}} };
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
