import type { BinaryAsset, GenerativeVideoProvider, ObjectStore, VideoGenerationMode, VideoGenerationRequest } from './types.js';

type MiniMaxH3Options = {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  resolution?: string;
  store: ObjectStore;
  fetchFn?: typeof fetch;
  pollMs?: number;
  timeoutMs?: number;
  estimatedUsdPerSecond?: number | null;
  useContextIr?: boolean;
};

type MiniMaxTask = {
  task_id?: string;
  task?: {
    status?: string;
    content?: { url?: string; prompt?: string };
    error?: string;
  };
  base_resp?: { status_code?: number; status_msg?: string };
};

const DEFAULT_MODEL = 'MiniMax-H3';
const DEFAULT_BASE_URL = 'https://api.minimax.io';
const ALLOWED_RESOLUTIONS = ['768P', '2K'] as const;
const ALLOWED_RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'] as const;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function requiredApiKey(options: MiniMaxH3Options): string {
  const value = String(options.apiKey ?? '').trim();
  if (!value) throw new Error('MINIMAX_API_KEY_REQUIRED');
  return value;
}

function normalizeResolution(value: string | undefined): string {
  const normalized = String(value ?? '768P').trim().toUpperCase();
  return ALLOWED_RESOLUTIONS.includes(normalized as (typeof ALLOWED_RESOLUTIONS)[number]) ? normalized : '768P';
}

function normalizeRatio(value: string): string {
  return ALLOWED_RATIOS.includes(value as (typeof ALLOWED_RATIOS)[number]) ? value : '16:9';
}

function promptForH3(prompt: string): string {
  const trimmed = prompt.trim();
  if (/integrated_multimodal_description\s*:/i.test(trimmed)) return trimmed;
  return [
    `integrated_multimodal_description: [Shot 1] ${trimmed} Continuous, physically coherent motion from the first frame; use a clear change of action or camera viewpoint and do not hold on a still image, slideshow, diagram, or static graphic.`,
    'overall_soundscape: Natural scene ambience and restrained diegetic sounds that match the visible action.',
    'non_diegetic_music: N/A. Final narration, subtitles, and music are mixed by AUTO-YTB after the clip is generated.',
  ].join('\n\n');
}

async function parseResponse(response: Response): Promise<MiniMaxTask> {
  const text = await response.text();
  let value: MiniMaxTask;
  try {
    value = JSON.parse(text) as MiniMaxTask;
  } catch {
    throw new Error(`MINIMAX_INVALID_JSON:${text.slice(0, 600)}`);
  }
  const statusCode = Number(value.base_resp?.status_code ?? 0);
  if (!response.ok || (statusCode && statusCode !== 0)) {
    throw new Error(`MINIMAX_HTTP_${response.status}:${value.base_resp?.status_msg ?? text.slice(0, 600)}`);
  }
  return value;
}

function isTerminal(status: string): boolean {
  return /success|succeed|failed|error|cancel/i.test(status);
}

async function expandWithContextIr(fetchFn: typeof fetch, baseUrl: string, headers: Record<string, string>, input: { prompt: string; duration: number; ratio: string; model: string }, pollMs: number, timeoutMs: number): Promise<string> {
  const response = await parseResponse(await fetchFn(`${baseUrl}/v2/h3_context_ir`, { method: 'POST', headers, body: JSON.stringify({ model: input.model, content: [{ type: 'text', text: input.prompt }], duration: input.duration, ratio: input.ratio }) }));
  const taskId = String(response.task_id ?? '').trim();
  if (!taskId) throw new Error(`MINIMAX_H3_CONTEXT_IR_NO_TASK_ID:${response.base_resp?.status_msg ?? 'unknown response'}`);
  const started = Date.now();
  let latest = response;
  while (!latest.task?.content?.prompt) {
    if (Date.now() - started >= timeoutMs) throw new Error(`MINIMAX_H3_CONTEXT_IR_TIMEOUT:${taskId}`);
    await sleep(pollMs);
    latest = await parseResponse(await fetchFn(`${baseUrl}/v2/query/video_generation/${encodeURIComponent(taskId)}`, { headers: { authorization: String(headers['authorization'] ?? ''), accept: 'application/json' } }));
    const status = String(latest.task?.status ?? '');
    if (isTerminal(status) && !/success|succeed/i.test(status)) throw new Error(`MINIMAX_H3_CONTEXT_IR_FAILED:${latest.task?.error ?? status}`);
  }
  return String(latest.task.content.prompt);
}

export class MiniMaxH3VideoProvider implements GenerativeVideoProvider {
  readonly name = 'minimax-h3';

  constructor(private readonly options: MiniMaxH3Options) {}

  get capability() {
    return {
      provider: this.name,
      model: this.options.model ?? DEFAULT_MODEL,
      modes: ['TEXT_TO_VIDEO'] as readonly VideoGenerationMode[],
      maxDurationSeconds: 15,
      aspectRatios: [...ALLOWED_RATIOS],
      resolutions: [...ALLOWED_RESOLUTIONS],
      referenceImageSupport: false,
      firstLastFrameSupport: false,
      audioSupport: true,
      deterministicSeedSupport: false,
      estimatedUsdPerSecond: this.options.estimatedUsdPerSecond ?? null,
      credentialStatus: this.options.apiKey ? 'LIVE' as const : 'NO_CREDENTIALS' as const,
    };
  }

  estimateCost(input: Pick<VideoGenerationRequest, 'durationSeconds'>) {
    const rate = this.options.estimatedUsdPerSecond ?? null;
    return {
      estimatedUsd: rate == null ? null : Number((Math.max(0, input.durationSeconds) * rate).toFixed(4)),
      currency: 'USD' as const,
      source: rate == null ? 'MINIMAX_H3_PRICE_NOT_CONFIGURED' : 'MINIMAX_H3_CONFIGURED_RATE',
    };
  }

  async generate(input: { prompt: string; durationSeconds: number; aspectRatio: string; referenceUris?: string[] }): Promise<BinaryAsset> {
    return this.generateShot(input);
  }

  async generateShot(input: VideoGenerationRequest): Promise<BinaryAsset & { metadata: Record<string, unknown> }> {
    if (!input.prompt.trim()) throw new Error('MINIMAX_H3_PROMPT_REQUIRED');
    if (input.referenceUris?.length || input.firstFrameUri || input.lastFrameUri || input.inputVideoUri) {
      throw new Error('MINIMAX_H3_REFERENCE_MODE_NOT_CONFIGURED');
    }

    const apiKey = requiredApiKey(this.options);
    const fetchFn = this.options.fetchFn ?? fetch;
    const baseUrl = (this.options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    const resolution = normalizeResolution(input.resolution ?? this.options.resolution);
    const duration = Math.max(4, Math.min(15, Math.round(input.durationSeconds)));
    const ratio = normalizeRatio(input.aspectRatio);
    const headers = { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', accept: 'application/json' };
    let h3Prompt = promptForH3(input.prompt);
    if (this.options.useContextIr) h3Prompt = await expandWithContextIr(fetchFn, baseUrl, headers, { prompt: h3Prompt, duration, ratio, model: this.options.model ?? DEFAULT_MODEL }, this.options.pollMs ?? 3000, this.options.timeoutMs ?? 900_000);
    const create = await parseResponse(await fetchFn(`${baseUrl}/v2/video_generation`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: this.options.model ?? DEFAULT_MODEL, content: [{ type: 'text', text: h3Prompt }], resolution, duration, ratio }),
    }));
    const taskId = String(create.task_id ?? '').trim();
    if (!taskId) throw new Error(`MINIMAX_H3_NO_TASK_ID:${create.base_resp?.status_msg ?? 'unknown response'}`);

    let latest = create;
    const started = Date.now();
    while (!latest.task?.content?.url) {
      if (Date.now() - started >= (this.options.timeoutMs ?? 900_000)) throw new Error(`MINIMAX_H3_TIMEOUT:${taskId}`);
      await sleep(this.options.pollMs ?? 3000);
      latest = await parseResponse(await fetchFn(`${baseUrl}/v2/query/video_generation/${encodeURIComponent(taskId)}`, { headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' } }));
      const status = String(latest.task?.status ?? '');
      if (isTerminal(status) && !/success|succeed/i.test(status)) throw new Error(`MINIMAX_H3_FAILED:${latest.task?.error ?? status}`);
    }

    const remoteUrl = latest.task?.content?.url;
    if (!remoteUrl) throw new Error(`MINIMAX_H3_NO_VIDEO_OUTPUT:${taskId}`);
    const download = await fetchFn(remoteUrl);
    if (!download.ok) throw new Error(`MINIMAX_H3_DOWNLOAD_${download.status}`);
    const bytes = new Uint8Array(await download.arrayBuffer());
    const key = `minimax-h3/video/${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`;
    const stored = await this.options.store.put({ key, contentType: 'video/mp4', data: bytes });
    const cost = this.estimateCost(input);
    return {
      id: key.replace(/[^a-z0-9]/gi, '-'), uri: stored.uri, mimeType: 'video/mp4', bytes: stored.bytes,
      provider: this.name, model: this.options.model ?? DEFAULT_MODEL, costUsd: cost.estimatedUsd ?? undefined,
      metadata: { taskId, resolution, ratio, requestedDurationSeconds: input.durationSeconds, generatedDurationSeconds: duration, audioGenerated: true, contextIr: Boolean(this.options.useContextIr), estimatedCost: cost },
    };
  }
}

export function createMiniMaxH3VideoProviderFromEnv(store: ObjectStore, env: Record<string, string | undefined> = process.env): MiniMaxH3VideoProvider {
  return new MiniMaxH3VideoProvider({
    store,
    apiKey: env.MINIMAX_API_KEY,
    model: env.MINIMAX_H3_MODEL ?? env.MINIMAX_VIDEO_MODEL ?? DEFAULT_MODEL,
    baseUrl: env.MINIMAX_API_BASE_URL ?? env.MINIMAX_H3_API_BASE_URL ?? DEFAULT_BASE_URL,
    resolution: env.MINIMAX_H3_RESOLUTION ?? '768P',
    pollMs: Number(env.MINIMAX_H3_POLL_MS ?? 3000),
    timeoutMs: Number(env.MINIMAX_H3_TIMEOUT_MS ?? 900000),
    estimatedUsdPerSecond: env.MINIMAX_H3_USD_PER_SECOND ? Number(env.MINIMAX_H3_USD_PER_SECOND) : null,
    useContextIr: String(env.MINIMAX_H3_CONTEXT_IR ?? 'false').toLowerCase() === 'true',
  });
}
