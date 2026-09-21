import type {
  BinaryAsset,
  GenerativeVideoProvider,
  ObjectStore,
  VideoGenerationMode,
  VideoGenerationRequest,
} from './types.js';

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

type HiggsfieldModelProfile = {
  configuredModel: string;
  family?: 'SEEDANCE_2_5' | 'SEEDANCE_2_0';
  modes: readonly VideoGenerationMode[];
  minDurationSeconds: number;
  maxDurationSeconds: number;
  aspectRatios: string[];
  resolutions: string[];
  referenceImageSupport: boolean;
  firstLastFrameSupport: boolean;
  audioSupport: boolean;
  deterministicSeedSupport: boolean;
};

const DEFAULT_MODEL = 'wan/v2.7/text-to-video';
const DEFAULT_BASE_URL = 'https://api.higgsfield.ai';
const SEEDANCE_2_5_BASE = 'bytedance/seedance-2.5';
const SEEDANCE_2_0_BASE = 'bytedance/seedance-2.0';
const ALL_STANDARD_ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4'];

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
  try {
    value = JSON.parse(text) as HiggsfieldResponse;
  } catch {
    throw new Error(`HIGGSFIELD_INVALID_JSON:${text.slice(0, 500)}`);
  }
  if (!response.ok) {
    throw new Error(`HIGGSFIELD_HTTP_${response.status}:${typeof value.error === 'string' ? value.error : value.error?.message ?? text.slice(0, 500)}`);
  }
  return value;
}

function profileFor(configuredModel: string): HiggsfieldModelProfile {
  const model = configuredModel.replace(/^\//, '');
  if (model.startsWith(`${SEEDANCE_2_5_BASE}/`)) {
    return {
      configuredModel: model,
      family: 'SEEDANCE_2_5',
      modes: ['TEXT_TO_VIDEO', 'IMAGE_TO_VIDEO', 'REFERENCE_TO_VIDEO', 'VIDEO_TO_VIDEO'],
      minDurationSeconds: 4,
      maxDurationSeconds: 30,
      aspectRatios: [...ALL_STANDARD_ASPECT_RATIOS, '21:9'],
      resolutions: ['480p', '720p'],
      referenceImageSupport: true,
      firstLastFrameSupport: true,
      audioSupport: true,
      deterministicSeedSupport: false,
    };
  }
  if (model.startsWith(`${SEEDANCE_2_0_BASE}/`)) {
    return {
      configuredModel: model,
      family: 'SEEDANCE_2_0',
      modes: ['TEXT_TO_VIDEO', 'IMAGE_TO_VIDEO', 'REFERENCE_TO_VIDEO'],
      minDurationSeconds: 4,
      maxDurationSeconds: 15,
      aspectRatios: [...ALL_STANDARD_ASPECT_RATIOS, '21:9'],
      resolutions: ['480p', '720p', '1080p', '4k'],
      referenceImageSupport: true,
      firstLastFrameSupport: true,
      audioSupport: true,
      deterministicSeedSupport: false,
    };
  }
  if (model === 'wan/v2.7/text-to-video') {
    return {
      configuredModel: model,
      modes: ['TEXT_TO_VIDEO'],
      minDurationSeconds: 2,
      maxDurationSeconds: 15,
      aspectRatios: ALL_STANDARD_ASPECT_RATIOS,
      resolutions: ['720p', '1080p'],
      referenceImageSupport: false,
      firstLastFrameSupport: false,
      audioSupport: false,
      deterministicSeedSupport: true,
    };
  }

  const inferredMode: VideoGenerationMode = model.endsWith('/image-to-video')
    ? 'IMAGE_TO_VIDEO'
    : model.endsWith('/reference-to-video')
      ? 'REFERENCE_TO_VIDEO'
      : model.endsWith('/video-edit')
        ? 'VIDEO_TO_VIDEO'
        : 'TEXT_TO_VIDEO';
  return {
    configuredModel: model,
    modes: [inferredMode],
    minDurationSeconds: 2,
    maxDurationSeconds: 15,
    aspectRatios: ALL_STANDARD_ASPECT_RATIOS,
    resolutions: ['720p', '1080p'],
    referenceImageSupport: inferredMode === 'IMAGE_TO_VIDEO' || inferredMode === 'REFERENCE_TO_VIDEO' || inferredMode === 'VIDEO_TO_VIDEO',
    firstLastFrameSupport: inferredMode === 'IMAGE_TO_VIDEO',
    audioSupport: true,
    deterministicSeedSupport: false,
  };
}

function inferMode(input: VideoGenerationRequest): VideoGenerationMode {
  if (input.mode) return input.mode;
  if (input.inputVideoUri) return 'VIDEO_TO_VIDEO';
  if (input.firstFrameUri || input.lastFrameUri) return 'IMAGE_TO_VIDEO';
  if (input.referenceUris?.length) return 'REFERENCE_TO_VIDEO';
  return 'TEXT_TO_VIDEO';
}

function endpointModel(profile: HiggsfieldModelProfile, mode: VideoGenerationMode): string {
  if (profile.family === 'SEEDANCE_2_5') {
    if (mode === 'IMAGE_TO_VIDEO') return `${SEEDANCE_2_5_BASE}/image-to-video`;
    if (mode === 'REFERENCE_TO_VIDEO') return `${SEEDANCE_2_5_BASE}/reference-to-video`;
    if (mode === 'VIDEO_TO_VIDEO') return `${SEEDANCE_2_5_BASE}/video-edit`;
    return `${SEEDANCE_2_5_BASE}/text-to-video`;
  }
  if (profile.family === 'SEEDANCE_2_0') {
    if (mode === 'IMAGE_TO_VIDEO') return `${SEEDANCE_2_0_BASE}/image-to-video`;
    if (mode === 'REFERENCE_TO_VIDEO') return `${SEEDANCE_2_0_BASE}/reference-to-video`;
    return `${SEEDANCE_2_0_BASE}/text-to-video`;
  }
  return profile.configuredModel;
}

function remoteUri(uri: string, field: string): string {
  if (!/^https:\/\//i.test(uri) && !/^http:\/\//i.test(uri)) {
    throw new Error(`HIGGSFIELD_REMOTE_REFERENCE_REQUIRED:${field}`);
  }
  return uri;
}

function clampDuration(profile: HiggsfieldModelProfile, durationSeconds: number): number {
  return Math.max(profile.minDurationSeconds, Math.min(profile.maxDurationSeconds, Math.round(durationSeconds)));
}

function generationPayload(profile: HiggsfieldModelProfile, input: VideoGenerationRequest, mode: VideoGenerationMode): Record<string, unknown> {
  const duration = clampDuration(profile, input.durationSeconds);
  const resolution = input.resolution ?? (profile.resolutions.includes('720p') ? '720p' : profile.resolutions[0]);
  if (!profile.resolutions.includes(resolution)) throw new Error(`HIGGSFIELD_UNSUPPORTED_RESOLUTION:${resolution}`);
  if (!profile.aspectRatios.includes(input.aspectRatio)) throw new Error(`HIGGSFIELD_UNSUPPORTED_ASPECT_RATIO:${input.aspectRatio}`);

  const common = {
    prompt: input.prompt,
    resolution,
    generate_audio: input.generateAudio ?? false,
  };

  if (profile.family === 'SEEDANCE_2_5' || profile.family === 'SEEDANCE_2_0') {
    if (mode === 'IMAGE_TO_VIDEO') {
      const first = input.firstFrameUri ?? input.referenceUris?.[0];
      if (!first) throw new Error('HIGGSFIELD_IMAGE_TO_VIDEO_REQUIRES_START_FRAME');
      return {
        ...common,
        duration,
        image_url: remoteUri(first, 'firstFrameUri'),
        ...(input.lastFrameUri ? { end_image_url: remoteUri(input.lastFrameUri, 'lastFrameUri') } : {}),
        output_format: 'mp4',
      };
    }
    if (mode === 'REFERENCE_TO_VIDEO') {
      const imageUrls = [input.firstFrameUri, input.lastFrameUri, ...(input.referenceUris ?? [])]
        .filter((value): value is string => Boolean(value))
        .map((value) => remoteUri(value, 'referenceUris'));
      const videoUrls = input.inputVideoUri ? [remoteUri(input.inputVideoUri, 'inputVideoUri')] : [];
      if (imageUrls.length === 0 && videoUrls.length === 0) throw new Error('HIGGSFIELD_REFERENCE_TO_VIDEO_REQUIRES_REFERENCE');
      return {
        ...common,
        duration,
        aspect_ratio: input.aspectRatio,
        ...(imageUrls.length ? { image_urls: [...new Set(imageUrls)] } : {}),
        ...(videoUrls.length ? { video_urls: videoUrls } : {}),
      };
    }
    if (mode === 'VIDEO_TO_VIDEO') {
      if (profile.family !== 'SEEDANCE_2_5') throw new Error('HIGGSFIELD_UNSUPPORTED_MODE:VIDEO_TO_VIDEO');
      if (!input.inputVideoUri) throw new Error('HIGGSFIELD_VIDEO_TO_VIDEO_REQUIRES_INPUT_VIDEO');
      return {
        ...common,
        video_url: remoteUri(input.inputVideoUri, 'inputVideoUri'),
      };
    }
    return {
      ...common,
      duration,
      aspect_ratio: input.aspectRatio,
      output_format: 'mp4',
    };
  }

  if (mode !== 'TEXT_TO_VIDEO') throw new Error(`HIGGSFIELD_UNSUPPORTED_MODE:${mode}`);
  return {
    ...common,
    duration,
    aspect_ratio: input.aspectRatio,
    negative_prompt: input.negativePrompt ?? '',
    ...(input.seed == null ? {} : { seed: input.seed }),
  };
}

export class HiggsfieldVideoProvider implements GenerativeVideoProvider {
  readonly name = 'higgsfield';

  get capability() {
    const profile = profileFor(this.options.model ?? DEFAULT_MODEL);
    return {
      provider: 'higgsfield',
      model: profile.configuredModel,
      modes: profile.modes,
      maxDurationSeconds: profile.maxDurationSeconds,
      aspectRatios: profile.aspectRatios,
      resolutions: profile.resolutions,
      referenceImageSupport: profile.referenceImageSupport,
      firstLastFrameSupport: profile.firstLastFrameSupport,
      audioSupport: profile.audioSupport,
      deterministicSeedSupport: profile.deterministicSeedSupport,
      estimatedUsdPerSecond: this.options.estimatedUsdPerSecond ?? null,
      credentialStatus: (this.options.credentials || (this.options.keyId && this.options.keySecret)) ? 'LIVE' as const : 'NO_CREDENTIALS' as const,
    };
  }

  constructor(private readonly options: HiggsfieldOptions) {}

  private authHeaders(): HeadersInit {
    return {
      authorization: `Key ${credentials(this.options)}`,
      'content-type': 'application/json',
      accept: 'application/json',
    };
  }

  estimateCost(input: Pick<VideoGenerationRequest, 'durationSeconds'>) {
    const rate = this.options.estimatedUsdPerSecond ?? null;
    return {
      estimatedUsd: rate == null ? null : Number((Math.max(0, input.durationSeconds) * rate).toFixed(4)),
      currency: 'USD' as const,
      source: rate == null ? 'HIGGSFIELD_PRICE_NOT_CONFIGURED' : 'HIGGSFIELD_CONFIGURED_RATE',
    };
  }

  async generate(input: { prompt: string; durationSeconds: number; aspectRatio: string; referenceUris?: string[] }): Promise<BinaryAsset> {
    return this.generateShot(input);
  }

  async generateShot(input: VideoGenerationRequest): Promise<BinaryAsset & { metadata: Record<string, unknown> }> {
    if (!input.prompt.trim()) throw new Error('HIGGSFIELD_PROMPT_REQUIRED');

    const fetchFn = this.options.fetchFn ?? fetch;
    const profile = profileFor(this.options.model ?? DEFAULT_MODEL);
    const mode = inferMode(input);
    if (!profile.modes.includes(mode)) throw new Error(`HIGGSFIELD_UNSUPPORTED_MODE:${mode}`);

    const selectedModel = endpointModel(profile, mode);
    const endpoint = `${(this.options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '')}/${selectedModel.replace(/^\//, '')}`;
    const body = generationPayload(profile, input, mode);
    const create = await responseJson(await fetchFn(endpoint, {
      method: 'POST',
      headers: this.authHeaders(),
      body: JSON.stringify(body),
    }));

    const requestId = create.request_id ?? create.id;
    let result = create;
    if (!outputUrl(result) && requestId) {
      const started = Date.now();
      while (Date.now() - started < (this.options.timeoutMs ?? 900000)) {
        await new Promise((resolve) => setTimeout(resolve, this.options.pollMs ?? 5000));
        result = await responseJson(await fetchFn(
          `${(this.options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '')}/requests/${encodeURIComponent(requestId)}/status`,
          { headers: this.authHeaders() },
        ));
        if (outputUrl(result) || /failed|error|cancel/i.test(String(result.status ?? ''))) break;
      }
      if (!outputUrl(result) && !/failed|error|cancel/i.test(String(result.status ?? ''))) {
        throw new Error(`HIGGSFIELD_TIMEOUT:${requestId}`);
      }
    }

    const remoteUrl = outputUrl(result);
    if (!remoteUrl) {
      throw new Error(`HIGGSFIELD_NO_VIDEO_OUTPUT:${result.error && typeof result.error === 'object' ? result.error.message : String(result.error ?? result.status ?? 'unknown')}`);
    }

    // Output URLs may point at a third-party CDN. Never forward API credentials to that origin.
    const download = await fetchFn(remoteUrl);
    if (!download.ok) throw new Error(`HIGGSFIELD_DOWNLOAD_${download.status}`);
    const bytes = new Uint8Array(await download.arrayBuffer());
    const key = `higgsfield/video/${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`;
    const stored = await this.options.store.put({ key, contentType: 'video/mp4', data: bytes });
    const cost = this.estimateCost(input);
    const generatedDurationSeconds = mode === 'VIDEO_TO_VIDEO' ? input.durationSeconds : clampDuration(profile, input.durationSeconds);

    return {
      id: key.replace(/[^a-z0-9]/gi, '-'),
      uri: stored.uri,
      mimeType: 'video/mp4',
      bytes: stored.bytes,
      provider: this.name,
      model: selectedModel,
      costUsd: cost.estimatedUsd ?? undefined,
      metadata: {
        requestId: requestId ?? null,
        mode,
        configuredModel: profile.configuredModel,
        selectedModel,
        requestedDurationSeconds: input.durationSeconds,
        generatedDurationSeconds,
        referenceCount: (input.referenceUris?.length ?? 0) + Number(Boolean(input.firstFrameUri)) + Number(Boolean(input.lastFrameUri)) + Number(Boolean(input.inputVideoUri)),
        referenceConditioned: mode !== 'TEXT_TO_VIDEO',
        estimatedCost: cost,
      },
    };
  }
}

export function createHiggsfieldVideoProviderFromEnv(
  store: ObjectStore,
  env: Record<string, string | undefined> = process.env,
): HiggsfieldVideoProvider {
  return new HiggsfieldVideoProvider({
    store,
    credentials: env.HF_CREDENTIALS ?? (env.HF_API_KEY_ID && env.HF_API_KEY_SECRET ? `${env.HF_API_KEY_ID}:${env.HF_API_KEY_SECRET}` : undefined),
    model: env.HIGGSFIELD_VIDEO_MODEL ?? env.HF_VIDEO_MODEL ?? DEFAULT_MODEL,
    baseUrl: env.HIGGSFIELD_API_BASE_URL ?? DEFAULT_BASE_URL,
    pollMs: Number(env.HIGGSFIELD_POLL_MS ?? 5000),
    timeoutMs: Number(env.HIGGSFIELD_TIMEOUT_MS ?? 900000),
    estimatedUsdPerSecond: env.HIGGSFIELD_USD_PER_SECOND ? Number(env.HIGGSFIELD_USD_PER_SECOND) : null,
  });
}
