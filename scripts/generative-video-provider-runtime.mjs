import {
  FailoverGenerativeVideoProvider,
  GeminiVideoProvider,
  createHiggsfieldVideoProviderFromEnv,
} from '../packages/providers/dist/index.js';

const clean = (value) => String(value ?? '').trim();
const truthy = (value) => ['1', 'true', 'yes', 'on'].includes(clean(value).toLowerCase());

function geminiRateUsdPerSecond(env, model, resolution) {
  const configuredRaw = env.GEMINI_VIDEO_USD_PER_SECOND ?? env.GENERATION_USD_PER_SECOND;
  const configured = configuredRaw == null || clean(configuredRaw) === '' ? Number.NaN : Number(configuredRaw);
  if (Number.isFinite(configured) && configured >= 0) return configured;
  const lower = String(model).toLowerCase();
  if (lower.includes('fast')) return resolution === '1080p' ? 0.12 : 0.10;
  if (lower.includes('lite')) return resolution === '1080p' ? 0.08 : 0.05;
  return resolution === '4k' ? 0.60 : 0.40;
}

function hasHiggsfieldCredentials(env) {
  return Boolean(clean(env.HF_CREDENTIALS)) || (Boolean(clean(env.HF_API_KEY_ID)) && Boolean(clean(env.HF_API_KEY_SECRET)));
}

function createGeminiGenerativeProvider(store, env) {
  const apiKey = clean(env.GEMINI_API_KEY || env.GOOGLE_API_KEY);
  if (!apiKey) return null;
  const model = env.GEMINI_VIDEO_MODEL ?? env.VIDEO_MODEL ?? 'veo-3.1-fast-generate-preview';
  const resolution = env.GEMINI_VIDEO_RESOLUTION ?? '720p';
  const videoProvider = new GeminiVideoProvider({
    apiKey,
    store,
    model,
    resolution,
    endpoint: env.GEMINI_API_BASE_URL || undefined,
    pollMs: Number(env.GEMINI_VIDEO_POLL_MS ?? 10_000),
    timeoutMs: Number(env.GEMINI_VIDEO_TIMEOUT_MS ?? 900_000),
  });

  if (typeof videoProvider.generateShot === 'function' && videoProvider.capability && typeof videoProvider.estimateCost === 'function') return videoProvider;

  return {
    name: videoProvider.name,
    capability: {
      provider: videoProvider.name,
      model,
      modes: ['TEXT_TO_VIDEO', 'REFERENCE_TO_VIDEO'],
      maxDurationSeconds: 8,
      aspectRatios: ['16:9', '9:16', '1:1'],
      resolutions: ['720p', '1080p'],
      referenceImageSupport: true,
      firstLastFrameSupport: false,
      audioSupport: false,
      deterministicSeedSupport: false,
      estimatedUsdPerSecond: geminiRateUsdPerSecond(env, model, resolution),
      credentialStatus: 'LIVE',
    },
    estimateCost(request) {
      const targetResolution = request.resolution ?? resolution;
      const rate = geminiRateUsdPerSecond(env, model, targetResolution);
      return {
        estimatedUsd: Number((Math.max(0, request.durationSeconds) * rate).toFixed(4)),
        currency: 'USD',
        source: env.GEMINI_VIDEO_USD_PER_SECOND || env.GENERATION_USD_PER_SECOND
          ? 'CONFIGURED_PRICE'
          : 'GOOGLE_OFFICIAL_PRICING_DEFAULT',
      };
    },
    generate(input) {
      return videoProvider.generate(input);
    },
    generateShot(request) {
      return videoProvider.generate(request).then((asset) => ({
        ...asset,
        metadata: {
          ...(asset.metadata ?? {}),
          generatedDurationSeconds: request.durationSeconds,
        },
      }));
    },
  };
}

function createHiggsfieldGenerativeProvider(store, env) {
  if (!hasHiggsfieldCredentials(env)) return null;
  return createHiggsfieldVideoProviderFromEnv(store, env);
}

function orderedProviderNames(env, requested) {
  const explicit = clean(env.VIDEO_PROVIDER_PRIORITY)
    .toLowerCase()
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (explicit.length) return [...new Set(explicit)];
  if (requested === 'higgsfield') return ['higgsfield', 'gemini'];
  return ['gemini', 'higgsfield'];
}

export function describeGenerativeVideoRuntime(provider) {
  if (typeof provider?.getHealthSnapshot === 'function') {
    return {
      strategy: 'FAILOVER',
      provider: provider.name,
      model: provider.capability?.model ?? null,
      members: provider.getHealthSnapshot(),
    };
  }
  return {
    strategy: 'SINGLE_PROVIDER',
    provider: provider?.name ?? null,
    model: provider?.capability?.model ?? null,
    members: provider ? [{ provider: provider.name, model: provider.capability?.model ?? null, state: 'READY' }] : [],
  };
}

export function createGenerativeVideoProviderRuntime(store, env = process.env) {
  const requested = clean(env.VIDEO_PROVIDER || 'auto').toLowerCase();
  if (!['auto', 'gemini', 'higgsfield'].includes(requested)) {
    throw new Error(`UNSUPPORTED_GENERATIVE_VIDEO_PROVIDER:${requested}`);
  }

  const available = new Map();
  const gemini = createGeminiGenerativeProvider(store, env);
  const higgsfield = createHiggsfieldGenerativeProvider(store, env);
  if (gemini) available.set('gemini', gemini);
  if (higgsfield) available.set('higgsfield', higgsfield);

  const failoverEnabled = requested === 'auto' || truthy(env.VIDEO_PROVIDER_FAILOVER_ENABLED);
  const selectedNames = failoverEnabled
    ? orderedProviderNames(env, requested)
    : [requested === 'auto' ? orderedProviderNames(env, requested)[0] : requested];
  const providers = selectedNames.map((name) => available.get(name)).filter(Boolean);

  if (!providers.length) {
    const missing = requested === 'higgsfield'
      ? 'HF_CREDENTIALS_OR_HF_API_KEY_ID_SECRET'
      : requested === 'gemini'
        ? 'GEMINI_API_KEY'
        : 'GEMINI_API_KEY_OR_HIGGSFIELD_SERVER_CREDENTIALS';
    throw new Error(`NO_GENERATIVE_VIDEO_PROVIDER_READY:${missing}`);
  }

  if (providers.length === 1) return providers[0];

  return new FailoverGenerativeVideoProvider({
    providers,
    cooldownMs: Math.max(60_000, Number(env.VIDEO_PROVIDER_FAILOVER_COOLDOWN_MS ?? 15 * 60_000)),
  });
}
