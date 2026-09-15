import { readFile } from 'node:fs/promises';
import type { BinaryAsset, ObjectStore, VideoProvider } from './types.js';

export type RunwayContinuityMode = 'WAN3_FIRST_LAST' | 'SEEDANCE25_EXTEND' | 'ACT_TWO_PERFORMANCE';
export type RunwayResolution = '480p' | '720p' | '1080p';

export type RunwayContinuityInput = {
  mode: RunwayContinuityMode;
  prompt: string;
  durationSeconds: number;
  aspectRatio?: string;
  resolution?: RunwayResolution;
  firstFrameUri?: string;
  lastFrameUri?: string;
  promptVideoUri?: string;
  characterUri?: string;
  characterType?: 'image' | 'video';
  performanceVideoUri?: string;
  inputVideoDurationSeconds?: number;
  bodyControl?: boolean;
  expressionIntensity?: number;
  seed?: number;
  audio?: boolean;
};

type RunwayTask = { id: string; status?: string; output?: string[]; failure?: string; failureCode?: string };
type UploadResponse = { uploadUrl: string; fields: Record<string, string>; runwayUri: string };

const CREDIT_USD = 0.01;
const WAN_RATE: Record<RunwayResolution, number> = { '480p': 5, '720p': 10, '1080p': 20 };
const SEEDANCE_RATE: Record<RunwayResolution, { output: number; input: number }> = {
  '480p': { output: 20, input: 10 },
  '720p': { output: 30, input: 15 },
  '1080p': { output: 68, input: 34 },
};

function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function fetchWithRetry(fetchFn: typeof fetch, url: string, init: RequestInit, attempts = 4): Promise<Response> {
  let last: Error | undefined;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchFn(url, init);
      if (response.ok || ![429, 500, 502, 503, 504].includes(response.status)) return response;
      last = new Error(`HTTP ${response.status}: ${(await response.clone().text()).slice(0, 500)}`);
    } catch (error) { last = error instanceof Error ? error : new Error(String(error)); }
    if (attempt < attempts - 1) await sleep(Math.min(8000, 500 * 2 ** attempt));
  }
  throw last ?? new Error('Runway request failed');
}

function integerDuration(seconds: number, min: number, max: number): number {
  if (!Number.isFinite(seconds)) throw new Error('Runway duration must be finite');
  return Math.max(min, Math.min(max, Math.round(seconds)));
}

function wanRatio(resolution: RunwayResolution): string { return `auto_${resolution}`; }
function seedanceRatio(aspectRatio = '16:9', resolution: RunwayResolution = '480p'): string {
  if (resolution === '480p' && aspectRatio === '16:9') return '854:480';
  if (resolution === '720p' && aspectRatio === '16:9') return '1280:720';
  if (resolution === '1080p' && aspectRatio === '16:9') return '1920:1080';
  return aspectRatio;
}

export function estimateRunwayContinuityCost(input: RunwayContinuityInput, creditUsd = CREDIT_USD) {
  const resolution = input.resolution ?? '480p';
  const outputSeconds = integerDuration(input.durationSeconds, input.mode === 'SEEDANCE25_EXTEND' ? 4 : 2, 30);
  let credits: number;
  if (input.mode === 'WAN3_FIRST_LAST') credits = outputSeconds * WAN_RATE[resolution];
  else if (input.mode === 'SEEDANCE25_EXTEND') {
    const inputSeconds = Math.max(0, Number(input.inputVideoDurationSeconds ?? 0));
    credits = Math.max(80, Math.ceil(outputSeconds * SEEDANCE_RATE[resolution].output + inputSeconds * SEEDANCE_RATE[resolution].input));
  } else credits = outputSeconds * 5;
  return { credits, estimatedUsd: Number((credits * creditUsd).toFixed(2)), resolution, outputSeconds, source: 'runway-dev-official-pricing' };
}

export function buildRunwayContinuityPayload(input: RunwayContinuityInput): { path: string; body: Record<string, unknown>; model: string } {
  const resolution = input.resolution ?? '480p';
  if (!input.prompt.trim()) throw new Error('Runway continuity prompt is required');
  if (input.mode === 'WAN3_FIRST_LAST') {
    if (!input.firstFrameUri || !input.lastFrameUri) throw new Error('WAN3_FIRST_LAST requires firstFrameUri and lastFrameUri');
    return {
      path: '/v1/image_to_video', model: 'wan3',
      body: {
        model: 'wan3', promptText: input.prompt,
        promptImage: [{ uri: input.firstFrameUri, position: 'first' }, { uri: input.lastFrameUri, position: 'last' }],
        ratio: wanRatio(resolution), duration: integerDuration(input.durationSeconds, 2, 30), audio: input.audio ?? false,
        ...(input.seed == null ? {} : { seed: input.seed }),
      },
    };
  }
  if (input.mode === 'SEEDANCE25_EXTEND') {
    if (!input.promptVideoUri) throw new Error('SEEDANCE25_EXTEND requires promptVideoUri');
    return {
      path: '/v1/video_to_video', model: 'seedance2_5',
      body: {
        model: 'seedance2_5', promptVideo: input.promptVideoUri, promptText: input.prompt,
        mode: 'extend', duration: integerDuration(input.durationSeconds, 4, 30), audio: input.audio ?? false,
        ...(input.seed == null ? {} : { seed: input.seed }),
      },
    };
  }
  if (!input.characterUri || !input.performanceVideoUri) throw new Error('ACT_TWO_PERFORMANCE requires characterUri and performanceVideoUri');
  return {
    path: '/v1/character_performance', model: 'act_two',
    body: {
      model: 'act_two', character: { type: input.characterType ?? 'image', uri: input.characterUri },
      reference: { type: 'video', uri: input.performanceVideoUri }, bodyControl: input.bodyControl ?? true,
      expressionIntensity: Math.max(1, Math.min(5, Math.round(input.expressionIntensity ?? 3))), ratio: input.aspectRatio === '9:16' ? '720:1280' : '1280:720',
      ...(input.seed == null ? {} : { seed: input.seed }),
    },
  };
}

export class RunwayVideoProvider implements VideoProvider {
  readonly name = 'runway';
  constructor(private readonly options: { apiKey: string; store: ObjectStore; apiVersion?: string; endpoint?: string; pollMs?: number; timeoutMs?: number; fetchFn?: typeof fetch }) {}

  private base(): string { return this.options.endpoint ?? 'https://api.dev.runwayml.com'; }
  private headers(): Record<string, string> { return { authorization: `Bearer ${this.options.apiKey}`, 'content-type': 'application/json', 'x-runway-version': this.options.apiVersion ?? '2024-11-06' }; }
  private async create(path: string, body: Record<string, unknown>): Promise<RunwayTask> {
    const response = await fetchWithRetry(this.options.fetchFn ?? fetch, `${this.base()}${path}`, { method: 'POST', headers: this.headers(), body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`Runway create failed ${response.status}: ${(await response.text()).slice(0, 500)}`);
    return response.json() as Promise<RunwayTask>;
  }
  private async wait(id: string): Promise<RunwayTask> {
    const started = Date.now();
    while (Date.now() - started < (this.options.timeoutMs ?? 600_000)) {
      const response = await fetchWithRetry(this.options.fetchFn ?? fetch, `${this.base()}/v1/tasks/${encodeURIComponent(id)}`, { headers: this.headers() });
      if (!response.ok) throw new Error(`Runway task read failed ${response.status}: ${(await response.text()).slice(0, 500)}`);
      const task = await response.json() as RunwayTask;
      if (task.status === 'SUCCEEDED') return task;
      if (task.status === 'FAILED' || task.status === 'CANCELED') throw new Error(`Runway task ${task.status}: ${task.failureCode ?? ''} ${task.failure ?? ''}`.trim());
      await sleep(this.options.pollMs ?? 5000);
    }
    throw new Error(`Runway task ${id} timed out`);
  }
  private async persist(task: RunwayTask, metadata: Record<string, unknown>): Promise<BinaryAsset> {
    const url = task.output?.[0]; if (!url) throw new Error('Runway task succeeded without output URL');
    const response = await fetchWithRetry(this.options.fetchFn ?? fetch, url, {}); if (!response.ok) throw new Error(`Runway output download failed ${response.status}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const stored = await this.options.store.put({ key: `runway/${task.id}.mp4`, contentType: 'video/mp4', data: bytes });
    return { id: task.id, uri: stored.uri, mimeType: 'video/mp4', bytes: stored.bytes, provider: this.name, model: String(metadata.model ?? 'runway'), costUsd: Number(metadata.estimatedUsd ?? 0), metadata };
  }

  async uploadEphemeral(input: { data: Uint8Array; filename: string; contentType?: string }): Promise<{ uri: string; expiresHours: number }> {
    const fetchFn = this.options.fetchFn ?? fetch;
    const initResponse = await fetchWithRetry(fetchFn, `${this.base()}/v1/uploads`, { method: 'POST', headers: this.headers(), body: JSON.stringify({ filename: input.filename, type: 'ephemeral' }) });
    if (!initResponse.ok) throw new Error(`Runway upload initialization failed ${initResponse.status}: ${(await initResponse.text()).slice(0, 500)}`);
    const upload = await initResponse.json() as UploadResponse;
    const form = new FormData();
    for (const [key, value] of Object.entries(upload.fields ?? {})) form.append(key, value);
    const bytes = input.data.buffer.slice(input.data.byteOffset, input.data.byteOffset + input.data.byteLength) as ArrayBuffer;
    form.append('file', new Blob([bytes], { type: input.contentType ?? 'application/octet-stream' }), input.filename);
    const putResponse = await fetchWithRetry(fetchFn, upload.uploadUrl, { method: 'POST', body: form });
    if (!putResponse.ok) throw new Error(`Runway ephemeral upload failed ${putResponse.status}`);
    return { uri: upload.runwayUri, expiresHours: 24 };
  }

  async uploadLocalFile(input: { path: string; filename?: string; contentType?: string }): Promise<{ uri: string; expiresHours: number }> {
    const data = new Uint8Array(await readFile(input.path));
    return this.uploadEphemeral({ data, filename: input.filename ?? input.path.split(/[\\/]/).pop() ?? 'asset.bin', contentType: input.contentType });
  }

  async generateContinuity(input: RunwayContinuityInput): Promise<BinaryAsset> {
    const plan = buildRunwayContinuityPayload(input);
    const estimate = estimateRunwayContinuityCost(input);
    const task = await this.create(plan.path, plan.body);
    return this.persist(await this.wait(task.id), { ...estimate, mode: input.mode, model: plan.model, taskId: task.id });
  }

  async generate(input: { prompt: string; durationSeconds: number; aspectRatio: string; referenceUris?: string[] }): Promise<BinaryAsset> {
    const refs = input.referenceUris ?? [];
    if (refs.length >= 2) return this.generateContinuity({ mode: 'WAN3_FIRST_LAST', prompt: input.prompt, durationSeconds: input.durationSeconds, aspectRatio: input.aspectRatio, firstFrameUri: refs[0], lastFrameUri: refs[1] });
    const promptImage = refs[0];
    const task = await this.create('/v1/image_to_video', { model: 'wan3', promptText: input.prompt, promptImage: promptImage ? { uri: promptImage } : undefined, ratio: wanRatio('480p'), duration: integerDuration(input.durationSeconds, 2, 30), audio: false });
    return this.persist(await this.wait(task.id), { model: 'wan3', mode: 'FIRST_FRAME', credits: integerDuration(input.durationSeconds, 2, 30) * WAN_RATE['480p'], estimatedUsd: integerDuration(input.durationSeconds, 2, 30) * WAN_RATE['480p'] * CREDIT_USD });
  }
}
