import type {
  BinaryAsset,
  GenerativeVideoProvider,
  VideoGenerationCapability,
  VideoGenerationMode,
  VideoGenerationRequest,
  VideoReferenceUriScheme,
} from './types.js';

type ProviderHealth = {
  blockedUntilMs: number;
  consecutiveAvailabilityFailures: number;
  lastFailureCode?: string;
};

export type FailoverVideoOptions = {
  providers: GenerativeVideoProvider[];
  cooldownMs?: number;
  now?: () => number;
};

export type VideoProviderFailoverAttempt = {
  provider: string;
  model?: string;
  outcome: 'FAILED_OVER' | 'SUCCEEDED';
  errorCode?: string;
  estimatedUsd: number | null;
};

const FAILOVER_SAFE_ERROR = /(?:^|[_:\s-])(429|resource[_\s-]?exhausted|quota|rate[_\s-]?limit|too[_\s-]?many[_\s-]?requests|unauthori[sz]ed|forbidden|invalid[_\s-]?credential|credential[_\s-]?required|billing|provider[_\s-]?unavailable)(?:$|[_:\s-])/i;

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function requestReferenceUris(input: VideoGenerationRequest): string[] {
  return [input.firstFrameUri, input.lastFrameUri, input.inputVideoUri, ...(input.referenceUris ?? [])]
    .filter((value): value is string => Boolean(value));
}

function normalizedRequest(input: VideoGenerationRequest): VideoGenerationRequest {
  if (input.mode === 'REFERENCE_TO_VIDEO' && requestReferenceUris(input).length === 0) {
    return { ...input, mode: 'TEXT_TO_VIDEO', referenceUris: [] };
  }
  return input;
}

function requestedMode(input: VideoGenerationRequest): VideoGenerationMode {
  if (input.mode) return input.mode;
  if (input.inputVideoUri) return 'VIDEO_TO_VIDEO';
  if (input.firstFrameUri || input.lastFrameUri) return 'IMAGE_TO_VIDEO';
  if (input.referenceUris?.length) return 'REFERENCE_TO_VIDEO';
  return 'TEXT_TO_VIDEO';
}

function uriScheme(uri: string): VideoReferenceUriScheme | null {
  if (/^file:\/\//i.test(uri)) return 'file';
  if (/^https:\/\//i.test(uri)) return 'https';
  if (/^http:\/\//i.test(uri)) return 'http';
  return null;
}

function errorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split(/\n|\r/)[0].slice(0, 180);
}

export function isSafeVideoProviderFailoverError(error: unknown): boolean {
  return FAILOVER_SAFE_ERROR.test(errorCode(error));
}

function credentialRank(value: VideoGenerationCapability['credentialStatus']): number {
  if (value === 'LIVE') return 4;
  if (value === 'LOCAL') return 3;
  if (value === 'FIXTURE') return 2;
  return 0;
}

function compatible(provider: GenerativeVideoProvider, input: VideoGenerationRequest): boolean {
  const capability = provider.capability;
  const mode = requestedMode(input);
  const references = requestReferenceUris(input);
  if (credentialRank(capability.credentialStatus) === 0) return false;
  if (!capability.modes.includes(mode)) return false;
  if (input.durationSeconds > capability.maxDurationSeconds + 1e-9) return false;
  if (capability.aspectRatios.length && !capability.aspectRatios.includes(input.aspectRatio)) return false;
  if (input.resolution && capability.resolutions.length && !capability.resolutions.includes(input.resolution)) return false;
  if (mode === 'REFERENCE_TO_VIDEO' && references.length === 0) return false;
  if (references.length > 0 && mode !== 'TEXT_TO_VIDEO' && !capability.referenceImageSupport) return false;
  if ((input.firstFrameUri || input.lastFrameUri) && mode === 'IMAGE_TO_VIDEO' && !capability.firstLastFrameSupport) return false;
  if (references.length && capability.referenceUriSchemes?.length) {
    for (const uri of references) {
      const scheme = uriScheme(uri);
      if (!scheme || !capability.referenceUriSchemes.includes(scheme)) return false;
    }
  }
  return true;
}

export class FailoverGenerativeVideoProvider implements GenerativeVideoProvider {
  readonly name = 'video-provider-failover';
  private readonly health = new Map<string, ProviderHealth>();
  private readonly now: () => number;
  private readonly cooldownMs: number;

  constructor(private readonly options: FailoverVideoOptions) {
    if (!options.providers.length) throw new Error('VIDEO_FAILOVER_REQUIRES_PROVIDER');
    const names = new Set<string>();
    for (const provider of options.providers) {
      if (names.has(provider.name)) throw new Error(`VIDEO_FAILOVER_DUPLICATE_PROVIDER:${provider.name}`);
      names.add(provider.name);
    }
    this.now = options.now ?? Date.now;
    this.cooldownMs = Math.max(1_000, options.cooldownMs ?? 15 * 60_000);
  }

  get capability(): VideoGenerationCapability {
    const capabilities = this.options.providers.map((provider) => provider.capability);
    const credentialStatus = [...capabilities]
      .sort((left, right) => credentialRank(right.credentialStatus) - credentialRank(left.credentialStatus))[0]?.credentialStatus ?? 'PROVIDER_UNAVAILABLE';
    const knownRates = capabilities.map((item) => item.estimatedUsdPerSecond).filter((value): value is number => value != null && Number.isFinite(value) && value >= 0);
    return {
      provider: this.name,
      model: `failover:${this.options.providers.map((provider) => `${provider.name}/${provider.capability.model ?? 'default'}`).join(',')}`,
      modes: unique(capabilities.flatMap((item) => [...item.modes])),
      maxDurationSeconds: Math.max(...capabilities.map((item) => item.maxDurationSeconds)),
      aspectRatios: unique(capabilities.flatMap((item) => item.aspectRatios)),
      resolutions: unique(capabilities.flatMap((item) => item.resolutions)),
      referenceImageSupport: capabilities.some((item) => item.referenceImageSupport),
      firstLastFrameSupport: capabilities.some((item) => item.firstLastFrameSupport),
      referenceUriSchemes: unique(capabilities.flatMap((item) => [...(item.referenceUriSchemes ?? [])])),
      audioSupport: capabilities.some((item) => item.audioSupport),
      deterministicSeedSupport: capabilities.some((item) => item.deterministicSeedSupport),
      estimatedUsdPerSecond: knownRates.length === capabilities.length && knownRates.length ? Math.max(...knownRates) : null,
      credentialStatus,
    };
  }

  private healthFor(provider: GenerativeVideoProvider): ProviderHealth {
    return this.health.get(provider.name) ?? { blockedUntilMs: 0, consecutiveAvailabilityFailures: 0 };
  }

  private candidates(input: VideoGenerationRequest): GenerativeVideoProvider[] {
    const now = this.now();
    const preferred = String(input.metadata?.preferredProvider ?? '').trim();
    return this.options.providers
      .filter((provider) => compatible(provider, input))
      .filter((provider) => this.healthFor(provider).blockedUntilMs <= now)
      .sort((left, right) => Number(right.name === preferred) - Number(left.name === preferred));
  }

  private estimateCandidates(input: Pick<VideoGenerationRequest, 'durationSeconds' | 'resolution' | 'mode'>): GenerativeVideoProvider[] {
    const mode = input.mode ?? 'TEXT_TO_VIDEO';
    const now = this.now();
    return this.options.providers.filter((provider) => {
      const capability = provider.capability;
      return credentialRank(capability.credentialStatus) > 0
        && capability.modes.includes(mode)
        && input.durationSeconds <= capability.maxDurationSeconds + 1e-9
        && (!input.resolution || capability.resolutions.length === 0 || capability.resolutions.includes(input.resolution))
        && this.healthFor(provider).blockedUntilMs <= now;
    });
  }

  estimateCost(input: Pick<VideoGenerationRequest, 'durationSeconds' | 'resolution' | 'mode'>) {
    const candidates = this.estimateCandidates(input);
    if (!candidates.length) return { estimatedUsd: null, currency: 'USD' as const, source: 'NO_COMPATIBLE_VIDEO_PROVIDER' };
    const estimates = candidates.map((provider) => ({ provider, estimate: provider.estimateCost(input) }));
    if (estimates.some((item) => item.estimate.estimatedUsd == null)) {
      return { estimatedUsd: null, currency: 'USD' as const, source: 'FAILOVER_PROVIDER_PRICE_UNKNOWN' };
    }
    const ceiling = Math.max(...estimates.map((item) => Number(item.estimate.estimatedUsd)));
    return {
      estimatedUsd: Number(ceiling.toFixed(6)),
      currency: 'USD' as const,
      source: `FAILOVER_RESERVATION_CEILING:${estimates.map((item) => `${item.provider.name}=${Number(item.estimate.estimatedUsd).toFixed(4)}`).join(',')}`,
    };
  }

  async generate(input: { prompt: string; durationSeconds: number; aspectRatio: string; referenceUris?: string[] }): Promise<BinaryAsset> {
    return this.generateShot(input);
  }

  async generateShot(input: VideoGenerationRequest): Promise<BinaryAsset & { metadata: Record<string, unknown> }> {
    const effectiveInput = normalizedRequest(input);
    const candidates = this.candidates(effectiveInput);
    if (!candidates.length) throw new Error(`VIDEO_PROVIDER_FAILOVER_NO_COMPATIBLE_PROVIDER:${requestedMode(effectiveInput)}`);

    const reservation = this.estimateCost(effectiveInput);
    if (reservation.estimatedUsd == null) throw new Error(`VIDEO_PROVIDER_FAILOVER_PRICE_REQUIRED:${reservation.source}`);

    const attempts: VideoProviderFailoverAttempt[] = [];
    for (const provider of candidates) {
      const estimate = provider.estimateCost(effectiveInput);
      try {
        const asset = await provider.generateShot(effectiveInput);
        const providerCostUsd = asset.costUsd ?? estimate.estimatedUsd;
        if (providerCostUsd != null && providerCostUsd > reservation.estimatedUsd + 1e-9) {
          throw new Error(`VIDEO_PROVIDER_FAILOVER_COST_EXCEEDS_RESERVATION:${provider.name}:${providerCostUsd}:${reservation.estimatedUsd}`);
        }
        this.health.set(provider.name, { blockedUntilMs: 0, consecutiveAvailabilityFailures: 0 });
        attempts.push({ provider: provider.name, model: provider.capability.model, outcome: 'SUCCEEDED', estimatedUsd: estimate.estimatedUsd });
        return {
          ...asset,
          costUsd: reservation.estimatedUsd,
          metadata: {
            ...(asset.metadata ?? {}),
            failover: {
              used: attempts.length > 1,
              selectedProvider: provider.name,
              selectedModel: asset.model ?? provider.capability.model ?? null,
              attempts,
              requestedMode: requestedMode(input),
              effectiveMode: requestedMode(effectiveInput),
              reservationUsd: reservation.estimatedUsd,
              providerEstimatedUsd: estimate.estimatedUsd,
              providerReportedCostUsd: asset.costUsd ?? null,
              costAccounting: 'CONSERVATIVE_FAILOVER_RESERVATION_CEILING',
            },
          },
        };
      } catch (error) {
        const code = errorCode(error);
        if (!isSafeVideoProviderFailoverError(error)) throw error;
        const previous = this.healthFor(provider);
        this.health.set(provider.name, {
          blockedUntilMs: this.now() + this.cooldownMs,
          consecutiveAvailabilityFailures: previous.consecutiveAvailabilityFailures + 1,
          lastFailureCode: code,
        });
        attempts.push({ provider: provider.name, model: provider.capability.model, outcome: 'FAILED_OVER', errorCode: code, estimatedUsd: estimate.estimatedUsd });
      }
    }

    const summary = attempts.map((item) => `${item.provider}:${item.errorCode ?? item.outcome}`).join('|').slice(0, 600);
    throw new Error(`VIDEO_PROVIDER_FAILOVER_EXHAUSTED:${summary}`);
  }

  getHealthSnapshot() {
    const now = this.now();
    return this.options.providers.map((provider) => {
      const health = this.healthFor(provider);
      return {
        provider: provider.name,
        model: provider.capability.model ?? null,
        state: health.blockedUntilMs > now ? 'CIRCUIT_OPEN' as const : 'READY' as const,
        blockedUntilMs: health.blockedUntilMs,
        consecutiveAvailabilityFailures: health.consecutiveAvailabilityFailures,
        lastFailureCode: health.lastFailureCode ?? null,
      };
    });
  }
}
