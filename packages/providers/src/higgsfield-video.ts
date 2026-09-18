import type { BinaryAsset, GenerativeVideoProvider, ObjectStore, VideoGenerationRequest } from './types.js';

type HiggsfieldOptions = {
  keyId?: string;
  keySecret?: string;
  credentials?: string;
  model?: string;
  baseUrl?: string;
  store: ObjectStore;
  fetchFn?: typeof fetch;
  pollMs?: number;
  timeoutMs?: number;
  estimatedUsdPerSecond?: number | null;
};

type HiggsfieldResponse = {
  request_id?: string;
  id?: string;
  status?: string;
  video?: string | { url?: string };
  output?: string | string[] | { url?: string };
  error?: { message?: string } | string;
};

const DEFAULT_MODEL = 'wan/v2.7/text-to-video';
const DEFAULT_BASE_URL = 'https://api.higgsfield.ai';

function credentials(options: HiggsfieldOptions): string {
  const value = options.credentials || (options.keyId && options.keySecret ? `${options.keyId}:${options.keySecret}` : '');
  if (!value.trim()) throw new Error('HIGGSFIELD_CREDENTIALS_REQUIRED');
  return value.trim();
}

function outputUrl(value: HiggsfieldResponse): string | undefined {
  const candidate = value.video ?? value.output;
  if (typeof candidate === 'string') return candidate;
  if (Array.isArray(candidate)) return candidate.find((item) => typeof item === 'string');
  return candidate?.url;
}

async function responseJson(response: Response): Promise<HiggsfieldResponse> {
  const text = await response.text();
  let value: HiggsfieldResponse;
  try { value = JSON.parse(text) as HiggsfieldResponse; } catch { throw new Error(`HIGGSFIELD_INVALID_JSON:${text.slice(0, 500)}`); }
  if (!response.ok) throw new Error(`HIGGSFIELD_HTTP_${response.status}:${typeof value.error === 'string' ? value.error : value.error?.message ?? text.slice(0, 500)}`);
  return value;
}

export class HiggsfieldVideoProvider implements GenerativeVideoProvider {
  readonly name = 'higgsfield';
  get capability() {
    return {
      provider: 'higgsfield', model: this.options.model ?? DEFAULT_MODEL,
      modes: ['TEXT_TO_VIDEO'] as const,
      maxDurationSeconds: 15, aspectRatios: ['16:9', '9:16', '1:1', '4:3', '3:4'], resolutions: ['720p', '1080p'],
      referenceImageSupport: false, firstLastFrameSupport: false, audioSupport: true, deterministicSeedSupport: true,
      estimatedUsdPerSecond: this.options.estimatedUsdPerSecond ?? null,
      credentialStatus: (this.options.credentials || (this.options.keyId && this.options.keySecret)) ? 'LIVE' as const : 'NO_CREDENTIALS' as const,
    };
  }

  constructor(private readonly options: HiggsfieldOptions) {}

  private authHeaders(): HeadersInit { return { authorization: `Key ${credentials(this.options)}`, 'content-type': 'application/json', accept: 'application/json' }; }

  estimateCost(input: Pick<VideoGenerationRequest, 'durationSeconds'>) {
    const rate = this.options.estimatedUsdPerSecond ?? null;
    return { estimatedUsd: rate == null ? null : Number((Math.max(0, input.durationSeconds) * rate).toFixed(4)), currency: 'USD' as const, source: rate == null ? 'HIGGSFIELD_PRICE_NOT_CONFIGURED' : 'HIGGSFIELD_CONFIGURED_RATE' };
  }

  async generate(input: { prompt: string; durationSeconds: number; aspectRatio: string; referenceUris?: string[] }): Promise<BinaryAsset> {
    return this.generateShot(input);
  }

  async generateShot(input: VideoGenerationRequest): Promise<BinaryAsset & { metadata: Record<string, unknown> }> {
    if (!input.prompt.trim()) throw new Error('HIGGSFIELD_PROMPT_REQUIRED');
    if (input.firstFrameUri || input.lastFrameUri || input.inputVideoUri) throw new Error('HIGGSFIELD_UNSUPPORTED_REFERENCE_MODE_IN_ADAPTER');
    const fetchFn = this.options.fetchFn ?? fetch;
    const model = this.options.model ?? DEFAULT_MODEL;
    const endpoint = `${(this.options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '')}/${model.replace(/^\//, '')}${model.endsWith('/text-to-video') ? '' : '/text-to-video'}`;
    const create = await responseJson(await fetchFn(endpoint, { method: 'POST', headers: this.authHeaders(), body: JSON.stringify({ prompt: input.prompt, duration: Math.max(2, Math.min(15, Math.round(input.durationSeconds))), resolution: input.resolution ?? '720p', aspect_ratio: input.aspectRatio, negative_prompt: input.negativePrompt ?? '', generate_audio: input.generateAudio ?? false, ...(input.seed == null ? {} : { seed: input.seed }) }) }));
    const requestId = create.request_id ?? create.id;
    let result = create;
    if (!outputUrl(result) && requestId) {
      const started = Date.now();
      while (Date.now() - started < (this.options.timeoutMs ?? 900000)) {
        await new Promise((resolve) => setTimeout(resolve, this.options.pollMs ?? 5000));
        result = await responseJson(await fetchFn(`${(this.options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '')}/requests/${encodeURIComponent(requestId)}/status`, { headers: this.authHeaders() }));
        if (outputUrl(result) || /failed|error|cancel/i.test(String(result.status ?? ''))) break;
      }
    }
    const remoteUrl = outputUrl(result);
    if (!remoteUrl) throw new Error(`HIGGSFIELD_NO_VIDEO_OUTPUT:${result.error && typeof result.error === 'object' ? result.error.message : String(result.error ?? result.status ?? 'unknown')}`);
    const download = await fetchFn(remoteUrl, { headers: this.authHeaders() });
    if (!download.ok) throw new Error(`HIGGSFIELD_DOWNLOAD_${download.status}`);
    const bytes = new Uint8Array(await download.arrayBuffer());
    const key = `higgsfield/video/${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`;
    const stored = await this.options.store.put({ key, contentType: 'video/mp4', data: bytes });
    const cost = this.estimateCost(input);
    return { id: key.replace(/[^a-z0-9]/gi, '-'), uri: stored.uri, mimeType: 'video/mp4', bytes: stored.bytes, provider: this.name, model, costUsd: cost.estimatedUsd ?? undefined, metadata: { requestId: requestId ?? null, mode: input.mode ?? 'TEXT_TO_VIDEO', requestedDurationSeconds: input.durationSeconds, generatedDurationSeconds: input.durationSeconds, referenceCount: input.referenceUris?.length ?? 0, estimatedCost: cost } };
  }
}

export function createHiggsfieldVideoProviderFromEnv(store: ObjectStore, env: Record<string, string | undefined> = process.env): HiggsfieldVideoProvider {
  return new HiggsfieldVideoProvider({ store, credentials: env.HF_CREDENTIALS ?? (env.HF_API_KEY_ID && env.HF_API_KEY_SECRET ? `${env.HF_API_KEY_ID}:${env.HF_API_KEY_SECRET}` : undefined), model: env.HIGGSFIELD_VIDEO_MODEL ?? env.HF_VIDEO_MODEL ?? DEFAULT_MODEL, baseUrl: env.HIGGSFIELD_API_BASE_URL ?? DEFAULT_BASE_URL, pollMs: Number(env.HIGGSFIELD_POLL_MS ?? 5000), timeoutMs: Number(env.HIGGSFIELD_TIMEOUT_MS ?? 900000), estimatedUsdPerSecond: env.HIGGSFIELD_USD_PER_SECOND ? Number(env.HIGGSFIELD_USD_PER_SECOND) : null });
}
