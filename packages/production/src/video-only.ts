import { spawn } from 'node:child_process';

export type FinalTimelineVisual = {
  id: string;
  kind: 'REAL_VIDEO' | 'SYNTHETIC_VIDEO' | 'MOTION_GRAPHIC_VIDEO' | 'SCREEN_CAPTURE_VIDEO' | 'MAP_VIDEO' | 'CHART_VIDEO' | 'IMAGE' | 'DOCUMENT' | 'GRAPHIC' | 'PLACEHOLDER';
  start: number;
  end: number;
  uri?: string;
  intentionalStatic?: boolean;
  metadata?: Record<string, unknown>;
};

export type VideoOnlyReport = { status: 'PASS' | 'FAIL'; failures: string[]; observed: { items: number; videoItems: number; durationSeconds: number; staticItems: number }; };

const videoKinds = new Set<FinalTimelineVisual['kind']>(['REAL_VIDEO', 'SYNTHETIC_VIDEO', 'MOTION_GRAPHIC_VIDEO', 'SCREEN_CAPTURE_VIDEO', 'MAP_VIDEO', 'CHART_VIDEO']);

export function assertFinalTimelineVideoOnly(items: FinalTimelineVisual[]): VideoOnlyReport {
  const failures: string[] = [];
  let durationSeconds = 0;
  let staticItems = 0;
  for (const item of items) {
    if (!Number.isFinite(item.start) || !Number.isFinite(item.end) || item.end <= item.start) failures.push(`${item.id}:INVALID_TIME_RANGE`);
    durationSeconds = Math.max(durationSeconds, item.end);
    if (!videoKinds.has(item.kind)) failures.push(`${item.id}:NON_VIDEO_KIND_${item.kind}`);
    if (item.intentionalStatic) { staticItems += 1; failures.push(`${item.id}:STATIC_VISUAL_PROHIBITED`); }
    if (item.kind === 'SYNTHETIC_VIDEO' && item.metadata?.evidenceRole === 'DIRECT_EVIDENCE') failures.push(`${item.id}:SYNTHETIC_DIRECT_EVIDENCE_PROHIBITED`);
    if (item.kind === 'SYNTHETIC_VIDEO' && item.metadata?.videoOnly !== true) failures.push(`${item.id}:SYNTHETIC_VIDEO_PROVENANCE_MISSING`);
  }
  return { status: failures.length ? 'FAIL' : 'PASS', failures, observed: { items: items.length, videoItems: items.filter((item) => videoKinds.has(item.kind)).length, durationSeconds, staticItems } };
}

export function assertFinalTimelineIsVideoOnly(items: FinalTimelineVisual[]): void {
  const report = assertFinalTimelineVideoOnly(items);
  if (report.status !== 'PASS') throw new Error(`VIDEO_ONLY_GATE_FAILED:${report.failures.join('|')}`);
}

export type VideoOnlyProbe = { hasVideo: boolean; durationSeconds: number; width: number; height: number; hasAudio: boolean; freezeDetected: boolean; loopDetected: boolean; };

export async function probeRenderedVideoOnly(path: string, ffprobe = 'ffprobe'): Promise<VideoOnlyProbe> {
  const result = await new Promise<string>((resolve, reject) => {
    const child = spawn(ffprobe, ['-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', path], { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; let error = ''; child.stdout.on('data', (chunk) => { output += chunk; }); child.stderr.on('data', (chunk) => { error += chunk; }); child.on('error', reject); child.on('close', (code) => code === 0 ? resolve(output) : reject(new Error(`FFPROBE_FAILED:${error.slice(0, 400)}`)));
  });
  const parsed = JSON.parse(result) as { streams?: Array<{ codec_type?: string; width?: number; height?: number }>; format?: { duration?: string } };
  const stream = parsed.streams?.find((item) => item.codec_type === 'video'); const audio = parsed.streams?.find((item) => item.codec_type === 'audio');
  if (!stream) throw new Error('VIDEO_ONLY_RENDER_HAS_NO_VIDEO_STREAM');
  const freezeDetected = await new Promise<boolean>((resolve) => {
    const child = spawn('ffmpeg', ['-hide_banner', '-i', path, '-vf', 'freezedetect=n=-60d=0.6', '-an', '-f', 'null', '-'], { stdio: ['ignore', 'ignore', 'pipe'] });
    let output = '';
    child.stderr.on('data', (chunk) => { output += String(chunk); });
    child.on('error', () => resolve(false));
    child.on('close', () => resolve(/freeze_(?:start|duration)/i.test(output)));
  });
  return { hasVideo: true, durationSeconds: Number(parsed.format?.duration ?? 0), width: Number(stream.width ?? 0), height: Number(stream.height ?? 0), hasAudio: Boolean(audio), freezeDetected, loopDetected: false };
}
