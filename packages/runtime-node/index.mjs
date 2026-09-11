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
    child.on('close', (code) => code === 0 ? resolvePromise() : reject(new Error(`${command} exited ${code}: ${stderr.length > 6000 ? `${stderr.slice(0, 6000)}\n...` : stderr}`)));
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

  async renderProcedural({ scene, asset, beat, clip, work, index, width, height, duration }) {
    const titleFile = join(work, `procedural-title-${index}.txt`);
    const detailFile = join(work, `procedural-detail-${index}.txt`);
    const kindFile = join(work, `procedural-kind-${index}.txt`);
    const metricFile = join(work, `procedural-metric-${index}.txt`);
    const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
    const wrap = (value, max) => {
      const words = clean(value).split(' ').filter(Boolean);
      const lines = [];
      let line = '';
      for (const word of words) {
        if (!line) { line = word; continue; }
        if (`${line} ${word}`.length > max) { lines.push(line); line = word; }
        else line = `${line} ${word}`;
      }
      if (line) lines.push(line);
      return lines.slice(0, 3).join('\n');
    };
    const shotInBeat = Number(String(scene.id ?? '').match(/-s(\d+)$/)?.[1] ?? 1);
    const narrationWords = clean(beat?.narration).split(' ').filter(Boolean);
    const chunkSize = Math.max(4, Math.ceil(narrationWords.length / 3));
    const progression = narrationWords.slice(Math.min(narrationWords.length - 1, (shotInBeat - 1) * chunkSize), Math.min(narrationWords.length, shotInBeat * chunkSize)).join(' ');
    const title = shotInBeat === 1
      ? clean(beat?.onScreenText) || clean(asset?.metadata?.instruction) || clean(scene.instruction)
      : progression || clean(beat?.onScreenText) || clean(scene.instruction);
    const detail = shotInBeat === 1
      ? clean(beat?.visualIntent) || clean(scene.instruction)
      : `Progression ${shotInBeat} of 3: ${clean(beat?.visualIntent) || clean(scene.instruction)}`;
    const purpose = String(beat?.purpose ?? scene.kind).replaceAll('_', ' ').toUpperCase();
    const variant = (index + shotInBeat - 1) % 4;
    const metric = /million/i.test(`${beat?.narration} ${beat?.onScreenText}`) ? '3,000,000' : /thousand|1,000/i.test(`${beat?.narration} ${beat?.onScreenText}`) ? '1,000 / HR' : beat?.purpose === 'reveal' ? 'NOT READY' : beat?.purpose === 'payoff' ? 'NEXT\nHARNESS' : `${shotInBeat}/3`;
    await writeFile(titleFile, wrap(title, width >= 1000 ? 22 : 18));
    await writeFile(detailFile, wrap(detail, width >= 1000 ? 42 : 32));
    await writeFile(kindFile, `${purpose}  //  SHOT ${String(index + 1).padStart(2, '0')}  //  ${shotInBeat}/3`);
    await writeFile(metricFile, metric);
    const font = ffmpegFontOption();
    const fontPrefix = font ? `${font}:` : '';
    const fpath = (path) => escapeFfmpegFilterPath(path);
    const text = (path, options) => `drawtext=${fontPrefix}textfile='${fpath(path)}':${options}`;
    const accent = scene.kind === 'chart' ? '0xffc857' : scene.kind === 'source_card' ? '0x63e6be' : '0x6ea8fe';
    const softAccent = `${accent}@0.26`;
    const margin = Math.round(width * 0.075);
    const barH = Math.max(10, Math.round(height * 0.008));
    const titleSize = Math.max(42, Math.round(height * 0.034));
    const detailSize = Math.max(24, Math.round(height * 0.018));
    const filters = [
      `drawbox=x=0:y=0:w=iw:h=ih:color=0x070b12:t=fill`,
      `drawbox=x=0:y=0:w=iw*0.018:h=ih:color=${accent}@0.9:t=fill`,
      `drawbox=x=iw*0.055:y=ih*0.085:w=iw*0.89:h=ih*0.78:color=0x101a29@0.94:t=fill`,
      `drawbox=x=iw*0.055:y=ih*0.085:w=iw*0.89:h=ih*0.78:color=${softAccent}:t=6`,
      `drawbox=x=iw*0.075:y=ih*(0.285+0.012*sin(2*PI*t/${Math.max(0.2, duration)})):w=iw*0.85:h=${Math.max(5, Math.round(height * 0.003))}:color=${accent}@0.68:t=fill`,
      text(kindFile, `fontcolor=${accent}:fontsize=${Math.max(22, Math.round(height * 0.015))}:x=w*0.09:y=h*0.12`),
      text(titleFile, `fontcolor=white:fontsize=${titleSize}:line_spacing=12:x=w*0.09-min(w*0.035\\,w*0.035*t/0.35):y=h*0.17:shadowcolor=black@0.7:shadowx=3:shadowy=3`),
      text(detailFile, `fontcolor=0xdbe7f5@0.86:fontsize=${detailSize}:line_spacing=8:x=w*0.09:y=h*0.34`),
      `drawbox=x=iw*(0.08+0.82*(0.5+0.5*sin(2*PI*t/1.65))):y=ih*0.43:w=iw*0.018:h=ih*0.34:color=${accent}@0.55:t=fill`,
      `drawbox=x=iw*0.10:y=ih*(0.43+0.22*(0.5+0.5*sin(2*PI*t/2.2))):w=iw*0.80:h=ih*0.008:color=white@0.34:t=fill`,
      `drawbox=x=iw*(0.14+0.68*(0.5+0.5*sin(2*PI*t/2.70))):y=ih*(0.50+0.07*cos(2*PI*t/1.90)):w=iw*0.09:h=ih*0.08:color=${accent}@0.34:t=fill`,
      `drawbox=x=iw*0.12:y=ih*0.405:w=iw*0.76:h=ih*0.038:color=${accent}@0.10:t=fill:enable='between(t\\,0\\,1.15)'`,
      `drawbox=x=iw*0.12:y=ih*0.405:w=iw*0.76:h=ih*0.038:color=0xffc857@0.12:t=fill:enable='between(t\\,1.15\\,2.30)'`,
      `drawbox=x=iw*0.12:y=ih*0.405:w=iw*0.76:h=ih*0.038:color=0x63e6be@0.13:t=fill:enable='between(t\\,2.30\\,${Math.max(2.31, duration)})'`,
      `drawtext=${fontPrefix}text='01   SIGNAL':fontcolor=white@0.70:fontsize=${Math.max(20, Math.round(height * 0.013))}:x=w*0.16:y=h*0.414:enable='between(t\\,0\\,1.15)'`,
      `drawtext=${fontPrefix}text='02   TENSION':fontcolor=white@0.78:fontsize=${Math.max(20, Math.round(height * 0.013))}:x=w*0.16:y=h*0.414:enable='between(t\\,1.15\\,2.30)'`,
      `drawtext=${fontPrefix}text='03   RESULT':fontcolor=white@0.84:fontsize=${Math.max(20, Math.round(height * 0.013))}:x=w*0.16:y=h*0.414:enable='between(t\\,2.30\\,${Math.max(2.31, duration)})'`,
    ];
    if (scene.kind === 'chart') {
      filters.push(`drawbox=x=iw*0.12:y=ih*0.49:w=iw*0.76:h=ih*0.26:color=0x0b121e@0.92:t=fill`);
      for (let i = 0; i < 6; i += 1) {
        const x = 0.18 + i * 0.105;
        const h = 0.07 + i * 0.026;
        filters.push(`drawbox=x=iw*${x.toFixed(3)}:y=ih*0.70:h=ih*${h.toFixed(3)}*min(1\\,t/0.55):w=iw*0.058:color=${i === 5 ? accent : '0xb9c7d9'}@${(0.38 + i * 0.08).toFixed(2)}:t=fill`);
        filters.push(`drawbox=x=iw*${(x + 0.012).toFixed(3)}:y=ih*0.46:w=iw*0.034:h=ih*0.012:color=${accent}@0.8:t=fill`);
      }
      filters.push(`drawbox=x=iw*0.16:y=ih*0.76:w=iw*0.66:h=ih*0.004:color=0xb9c7d9@0.35:t=fill`);
    } else if (scene.kind === 'source_card') {
      filters.push(`drawbox=x=iw*0.12:y=ih*0.48:w=iw*0.76:h=ih*0.27:color=0xf4f7fb@0.98:t=fill`);
      filters.push(`drawbox=x=iw*0.12:y=ih*0.48:w=iw*0.76:h=ih*0.018:color=${accent}:t=fill`);
      filters.push(`drawbox=x=iw*0.17:y=ih*0.57:w=iw*0.48:h=ih*0.018:color=0x172234@0.7:t=fill`);
      filters.push(`drawbox=x=iw*0.17:y=ih*0.62:w=iw*0.60:h=ih*0.012:color=0x172234@0.32:t=fill`);
      filters.push(`drawbox=x=iw*0.17:y=ih*0.67:w=iw*0.34:h=ih*0.012:color=${accent}@0.65:t=fill`);
      filters.push(`drawbox=x=iw*0.75:y=ih*0.55:w=iw*0.075:h=ih*0.075:color=${accent}@0.22:t=fill`);
      filters.push(`drawbox=x=iw*0.775:y=ih*0.575:w=iw*0.025:h=ih*0.025:color=${accent}:t=fill`);
    } else if (variant === 1) {
      // Comparison beat: two states and an explicit consequence make the
      // narration understandable even with the sound off.
      filters.push(`drawbox=x=iw*0.11:y=ih*0.48:w=iw*0.34:h=ih*0.22:color=0x12243a@0.96:t=fill`);
      filters.push(`drawbox=x=iw*0.55:y=ih*0.48:w=iw*0.34:h=ih*0.22:color=0x261a1b@0.96:t=fill`);
      filters.push(`drawbox=x=iw*0.11:y=ih*0.48:w=iw*0.34:h=ih*0.012:color=${accent}:t=fill`);
      filters.push(`drawbox=x=iw*0.55:y=ih*0.48:w=iw*0.34:h=ih*0.012:color=0xff5964:t=fill`);
      filters.push(`drawtext=${fontPrefix}text='BEFORE':fontcolor=0xb9d8ff:fontsize=${Math.max(22, Math.round(height * 0.016))}:x=w*0.15:y=h*0.53`);
      filters.push(`drawtext=${fontPrefix}text='AFTER':fontcolor=0xffa7aa:fontsize=${Math.max(22, Math.round(height * 0.016))}:x=w*0.59:y=h*0.53`);
      filters.push(`drawbox=x=iw*0.16:y=ih*0.60:w=iw*0.23:h=ih*0.018:color=0x9fc5f5@0.78:t=fill`);
      filters.push(`drawbox=x=iw*0.16:y=ih*0.64:w=iw*0.17:h=ih*0.018:color=0x9fc5f5@0.48:t=fill`);
      filters.push(`drawbox=x=iw*0.60:y=ih*0.60:w=iw*0.16:h=ih*0.018:color=0xff5964@0.88:t=fill`);
      filters.push(`drawbox=x=iw*0.60:y=ih*0.64:w=iw*0.23:h=ih*0.018:color=0xff5964@0.46:t=fill`);
      filters.push(`drawbox=x=iw*0.45:y=ih*0.57:w=iw*0.10:h=ih*0.012:color=0xffc857@0.72:t=fill`);
      filters.push(`drawbox=x=iw*(0.46+0.035*sin(2*PI*t/${Math.max(0.2, duration)})):y=ih*0.565:w=iw*0.025:h=ih*0.025:color=0xffc857:t=fill`);
      filters.push(`drawtext=${fontPrefix}text='RESULT':fontcolor=0xffc857:fontsize=${Math.max(22, Math.round(height * 0.015))}:x=w*0.44:y=h*0.77`);
    } else if (variant === 2) {
      // Metric beat: turn the spoken number or verdict into a moving focal
      // point, then support it with a compact evidence strip.
      filters.push(`drawbox=x=iw*0.12:y=ih*0.46:w=iw*0.76:h=ih*0.29:color=0x0b121e@0.96:t=fill`);
      const metricSize = metric.includes('\n') ? Math.round(height * 0.050) : Math.max(72, Math.round(height * 0.070));
      filters.push(text(metricFile, `fontcolor=${accent}:fontsize=${metricSize}:line_spacing=6:x=(w-text_w)/2:y=h*0.50:shadowcolor=${accent}@0.45:shadowx=0:shadowy=0`));
      filters.push(`drawtext=${fontPrefix}text='LIVE SIGNAL':fontcolor=white@0.64:fontsize=${Math.max(20, Math.round(height * 0.014))}:x=w*0.17:y=h*0.48`);
      for (let i = 0; i < 7; i += 1) {
        const x = 0.16 + i * 0.095;
        const bar = 0.035 + ((i + shotInBeat) % 4) * 0.025;
        filters.push(`drawbox=x=iw*${x.toFixed(3)}:y=ih*0.69:h=ih*${bar.toFixed(3)}*min(1\\,t/0.5):w=iw*0.045:color=${i === 6 ? '0xffc857' : accent}@${(0.42 + i * 0.07).toFixed(2)}:t=fill`);
      }
      filters.push(`drawbox=x=iw*0.16:y=ih*0.76:w=iw*0.66:h=ih*0.006:color=white@0.24:t=fill`);
      filters.push(`drawbox=x=iw*(0.16+0.66*min(1\\,t/${Math.max(0.2, duration)})):y=ih*0.748:w=iw*0.018:h=ih*0.03:color=0xffc857:t=fill`);
    } else {
      // Network beat: animated routes and a highlighted endpoint communicate
      // causality. The phase shift makes adjacent network shots visibly move.
      const nodes = [[0.18,0.50],[0.39,0.58],[0.60,0.49],[0.78,0.61],[0.47,0.73]];
      for (const [from, to] of [[0, 1], [1, 2], [2, 3], [1, 4]]) {
        const [x1, y1] = nodes[from]; const [x2, y2] = nodes[to];
        filters.push(`drawbox=x=iw*${x1}:y=ih*${y1}:w=iw*${(x2 - x1).toFixed(3)}:h=${Math.max(4, Math.round(height * 0.004))}:color=${accent}@0.62:t=fill`);
      }
      for (let i = 0; i < nodes.length; i += 1) {
        const [x, y] = nodes[i];
        filters.push(`drawbox=x=iw*${x}-iw*0.025:y=ih*${y}-ih*0.025:w=iw*0.05:h=ih*0.05:color=0x0b121e:t=fill`);
        filters.push(`drawbox=x=iw*${x}-iw*0.014:y=ih*${y}-ih*0.014:w=iw*0.028:h=ih*0.028:color=${i === nodes.length - 1 ? '0xffc857' : accent}:t=fill`);
      }
      filters.push(`drawbox=x=iw*(0.18+0.60*min(1\\,t/${Math.max(0.2, duration)})):y=ih*(0.50+0.11*sin(PI*t/${Math.max(0.2, duration)})):w=iw*0.018:h=ih*0.018:color=white:t=fill`);
      filters.push(`drawbox=x=iw*0.14:y=ih*0.76:w=iw*0.22:h=ih*0.045:color=${accent}@0.18:t=fill`);
      filters.push(`drawbox=x=iw*0.40:y=ih*0.76:w=iw*0.22:h=ih*0.045:color=0xffc857@0.18:t=fill`);
      filters.push(`drawbox=x=iw*0.66:y=ih*0.76:w=iw*0.20:h=ih*0.045:color=0x63e6be@0.18:t=fill`);
      filters.push(`drawtext=${fontPrefix}text='SIGNAL':fontcolor=white@0.78:fontsize=${Math.max(20, Math.round(height * 0.014))}:x=w*0.17:y=h*0.775`);
      filters.push(`drawtext=${fontPrefix}text='CONFLICT':fontcolor=white@0.78:fontsize=${Math.max(20, Math.round(height * 0.014))}:x=w*0.43:y=h*0.775`);
      filters.push(`drawtext=${fontPrefix}text='RESULT':fontcolor=white@0.78:fontsize=${Math.max(20, Math.round(height * 0.014))}:x=w*0.69:y=h*0.775`);
    }
    // A broad scan window creates a readable, purposeful visual pulse instead
    // of leaving several narration seconds on an apparently static card.
    filters.push(`drawbox=x=iw*(0.10+0.68*(0.5+0.5*sin(2*PI*t/2.70))):y=ih*(0.47+0.04*cos(2*PI*t/1.90)):w=iw*0.22:h=ih*0.27:color=${accent}@0.14:t=fill`);
    filters.push(`drawbox=x=iw*(0.10+0.68*(0.5+0.5*sin(2*PI*t/2.70))):y=ih*0.47:w=iw*0.010:h=ih*0.27:color=white@0.42:t=fill`);
    filters.push(`drawbox=x=${margin}:y=ih-${margin}:w=(iw-${margin * 2})*min(1\\,t/${Math.max(0.2, duration)}):h=${barH}:color=${accent}:t=fill`);
    filters.push(`drawbox=x=${margin}:y=ih-${margin}:w=iw-${margin * 2}:h=${barH}:color=white@0.16:t=5`);
    filters.push(`drawbox=x=iw*0.90:y=ih*0.12:w=iw*0.035:h=ih*0.035:color=${accent}@0.85:t=fill`);
    await run(this.ffmpeg, ['-y','-f','lavfi','-i',`color=c=0x070b12:s=${width}x${height}:r=${this.fps}:d=${duration}`,'-vf',`${filters.join(',')},format=yuv420p`,'-an','-c:v','libx264','-preset','veryfast',clip]);
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
      const beat = (manifest.script?.beats ?? []).find((candidate) => scene.id === candidate.id || scene.id.startsWith(`${candidate.id}-s`));
      const duration = Math.max(0.2, Number(scene.durationSec));
      if (asset?.uri?.startsWith('procedural://')) {
        await this.renderProcedural({ scene, asset, beat, clip, work, index, width, height, duration });
        clips.push(clip);
        continue;
      }
      const source = asset ? await this.materialize(asset.uri, join(work, `asset-${index}`)) : null;
      if (source && mimeFor(source).startsWith('image/')) {
        const zoom = 1.12 + (index % 3) * 0.030;
        const scaledWidth = Math.ceil(width * zoom / 2) * 2;
        const scaledHeight = Math.ceil(height * zoom / 2) * 2;
        const phase = (index % 5) * 0.7;
        const motionX = `(in_w-out_w)*(0.5+0.32*sin(2*PI*t/1.7+${phase.toFixed(2)}))`;
        const motionY = `(in_h-out_h)*(0.5+0.24*cos(2*PI*t/2.1+${phase.toFixed(2)}))`;
        const accent = index % 3 === 0 ? '0x6ea8fe' : index % 3 === 1 ? '0xffc857' : '0x63e6be';
        const imageFilter = `scale=${scaledWidth}:${scaledHeight}:force_original_aspect_ratio=increase,crop=${width}:${height}:x='${motionX}':y='${motionY}',drawbox=x=0:y=0:w=iw*0.014:h=ih:color=${accent}@0.88:t=fill,drawbox=x=iw*0.07:y=ih*0.91:w=iw*0.86:h=ih*0.004:color=white@0.22:t=fill,format=yuv420p`;
        await run(this.ffmpeg, ['-y','-loop','1','-i',source,'-t',String(duration),'-vf',imageFilter,'-r',String(this.fps),'-an','-c:v','libx264','-preset','veryfast',clip]);
      } else if (source && mimeFor(source).startsWith('video/')) {
        const videoFilter = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}:(in_w-out_w)/2:(in_h-out_h)/2,format=yuv420p`;
        await run(this.ffmpeg, ['-y','-stream_loop','-1','-i',source,'-t',String(duration),'-vf',videoFilter,'-r',String(this.fps),'-an','-c:v','libx264','-preset','veryfast',clip]);
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
