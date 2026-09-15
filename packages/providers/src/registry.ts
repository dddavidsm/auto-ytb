export type ProviderCapabilityName = 'TEXT' | 'RESEARCH' | 'VISION' | 'IMAGE' | 'VIDEO' | 'TTS' | 'MUSIC' | 'SFX' | 'CAPTIONS' | 'RENDER';
export type CredentialStatus = 'LIVE' | 'LOCAL' | 'FIXTURE' | 'NO_CREDENTIALS' | 'PROVIDER_UNAVAILABLE';
export type ProviderDescriptor = { provider: string; model?: string; capabilities: ProviderCapabilityName[]; qualityScore: number; estimatedUnitCostUsd: number; latencyClass: 'FAST' | 'STANDARD' | 'SLOW'; reliability: number; maxDurationSeconds?: number; resolutionSupport: string[]; aspectRatios: string[]; referenceImageSupport: boolean; characterConsistencySupport: boolean; seedSupport?: boolean; commercialUsageNotes: string; credentialStatus: CredentialStatus; enabled: boolean };
export type ProviderRouteRequest = { capability: ProviderCapabilityName; qualityTarget?: number; budgetRemainingUsd?: number; preferredProvider?: string; format?: string; aspectRatio?: string; durationSeconds?: number; requireCharacterConsistency?: boolean; storyApproved?: boolean; flowAvailable?: boolean };
export type ProviderRoute = ProviderDescriptor & { routeScore: number; reason: string };

const has = (env: Record<string, string | undefined>, ...keys: string[]) => keys.some((key) => Boolean(env[key]?.trim()));
const descriptor = (input: ProviderDescriptor): ProviderDescriptor => Object.freeze(input);

export class ProviderRegistry {
  private readonly providers = new Map<string, ProviderDescriptor>();
  constructor(initial: ProviderDescriptor[] = []) { for (const provider of initial) this.register(provider); }
  register(provider: ProviderDescriptor): this { this.providers.set(provider.provider, provider); return this; }
  get(provider: string): ProviderDescriptor | undefined { return this.providers.get(provider); }
  list(): ProviderDescriptor[] { return [...this.providers.values()]; }
  status(): Array<Pick<ProviderDescriptor, 'provider' | 'model' | 'capabilities' | 'credentialStatus' | 'enabled'>> { return this.list().map(({ provider, model, capabilities, credentialStatus, enabled }) => ({ provider, model, capabilities, credentialStatus, enabled })); }
}

export class ProviderRouter {
  constructor(private readonly registry: ProviderRegistry) {}
  route(input: ProviderRouteRequest): ProviderRoute | null {
    const candidates = this.registry.list().filter((provider) => provider.enabled && provider.capabilities.includes(input.capability) && ['LIVE', 'LOCAL', 'FIXTURE'].includes(provider.credentialStatus) && (!input.aspectRatio || provider.aspectRatios.length === 0 || provider.aspectRatios.includes(input.aspectRatio)) && (!input.durationSeconds || provider.maxDurationSeconds == null || provider.maxDurationSeconds >= input.durationSeconds) && (!input.requireCharacterConsistency || provider.characterConsistencySupport));
    const ranked = candidates.map((provider) => {
      const quality = provider.qualityScore >= (input.qualityTarget ?? 0) ? 20 : -((input.qualityTarget ?? 0) - provider.qualityScore);
      const cost = provider.estimatedUnitCostUsd <= (input.budgetRemainingUsd ?? Infinity) ? 12 : -30;
      const flowPriority = input.capability === 'VIDEO' && input.storyApproved && input.flowAvailable && provider.provider === 'google-flow' ? 100 : 0;
      const preference = (input.preferredProvider && input.preferredProvider === provider.provider ? 18 : 0) + flowPriority;
      const credential = provider.credentialStatus === 'LIVE' ? 8 : provider.credentialStatus === 'LOCAL' ? 7 : 1;
      const routeScore = quality + provider.reliability * 0.35 + cost + preference + credential;
      return { ...provider, routeScore, reason: flowPriority ? 'approved story: Google Flow is the primary video path before Gemini API quota' : preference ? 'channel preference plus capability, quality, cost and credential match' : 'best available capability, quality, cost and credential match' };
    }).sort((a, b) => b.routeScore - a.routeScore || a.estimatedUnitCostUsd - b.estimatedUnitCostUsd);
    return ranked[0] ?? null;
  }
}

export function createDefaultProviderRegistry(env: Record<string, string | undefined> = process.env): ProviderRegistry {
  return new ProviderRegistry([
    descriptor({ provider: 'mock', model: 'fixture-v1', capabilities: ['TEXT', 'RESEARCH', 'VISION', 'IMAGE', 'VIDEO', 'TTS', 'MUSIC', 'SFX', 'CAPTIONS', 'RENDER'], qualityScore: 35, estimatedUnitCostUsd: 0, latencyClass: 'FAST', reliability: 100, maxDurationSeconds: 3600, resolutionSupport: ['proxy'], aspectRatios: ['16:9', '9:16'], referenceImageSupport: true, characterConsistencySupport: true, commercialUsageNotes: 'Fixture only; no artifact is treated as real production.', credentialStatus: 'FIXTURE', enabled: true }),
    descriptor({ provider: 'ffmpeg-local', model: 'local', capabilities: ['CAPTIONS', 'RENDER', 'MUSIC', 'SFX'], qualityScore: 80, estimatedUnitCostUsd: 0.002, latencyClass: 'STANDARD', reliability: 92, maxDurationSeconds: 7200, resolutionSupport: ['1080p', '4k'], aspectRatios: ['16:9', '9:16'], referenceImageSupport: false, characterConsistencySupport: false, commercialUsageNotes: 'Local compute; assets must be separately cleared.', credentialStatus: 'LOCAL', enabled: true }),
    descriptor({ provider: 'windows-sapi-local', model: 'System.Speech', capabilities: ['TTS'], qualityScore: 65, estimatedUnitCostUsd: 0, latencyClass: 'STANDARD', reliability: 88, maxDurationSeconds: 7200, resolutionSupport: [], aspectRatios: [], referenceImageSupport: false, characterConsistencySupport: false, commercialUsageNotes: 'Local Windows voice; pronunciation and voice rights remain channel responsibilities.', credentialStatus: 'LOCAL', enabled: true }),
    descriptor({ provider: 'local-template', model: 'deterministic-v1', capabilities: ['TEXT'], qualityScore: 45, estimatedUnitCostUsd: 0, latencyClass: 'FAST', reliability: 100, resolutionSupport: [], aspectRatios: [], referenceImageSupport: false, characterConsistencySupport: false, commercialUsageNotes: 'Deterministic local template; not a generative provider.', credentialStatus: 'LOCAL', enabled: true }),
    descriptor({ provider: 'tavily', model: 'search', capabilities: ['TEXT', 'RESEARCH', 'VISION'], qualityScore: 72, estimatedUnitCostUsd: 0.01, latencyClass: 'FAST', reliability: 88, resolutionSupport: [], aspectRatios: [], referenceImageSupport: false, characterConsistencySupport: false, commercialUsageNotes: 'Research/discovery only.', credentialStatus: has(env, 'TAVILY_API_KEY') ? 'LIVE' : 'NO_CREDENTIALS', enabled: true }),
    descriptor({ provider: 'openai', model: env.OPENAI_MODEL ?? 'gpt-5', capabilities: ['TEXT', 'VISION'], qualityScore: 90, estimatedUnitCostUsd: 0.03, latencyClass: 'FAST', reliability: 94, resolutionSupport: [], aspectRatios: [], referenceImageSupport: false, characterConsistencySupport: false, commercialUsageNotes: 'Text/vision generation; review commercial terms for selected model.', credentialStatus: has(env, 'OPENAI_API_KEY') ? 'LIVE' : 'NO_CREDENTIALS', enabled: true }),
    descriptor({ provider: 'gemini', model: env.GEMINI_MODEL ?? 'configured', capabilities: ['TEXT', 'VISION', 'IMAGE', 'VIDEO', 'TTS'], qualityScore: 86, estimatedUnitCostUsd: 0.04, latencyClass: 'STANDARD', reliability: 90, maxDurationSeconds: 8, resolutionSupport: ['1080p'], aspectRatios: ['16:9', '9:16', '1:1'], referenceImageSupport: true, characterConsistencySupport: true, commercialUsageNotes: 'Provider policy and asset provenance must be recorded.', credentialStatus: has(env, 'GEMINI_API_KEY', 'GOOGLE_API_KEY') ? 'LIVE' : 'NO_CREDENTIALS', enabled: true }),
    descriptor({ provider: 'google-flow', model: env.GOOGLE_FLOW_MODEL ?? 'Flow UI / Agent', capabilities: ['IMAGE', 'VIDEO'], qualityScore: 89, estimatedUnitCostUsd: 0, latencyClass: 'SLOW', reliability: 88, maxDurationSeconds: 8, resolutionSupport: ['720p', '1080p'], aspectRatios: ['16:9', '9:16'], referenceImageSupport: true, characterConsistencySupport: true, commercialUsageNotes: 'Browser-operated Google AI Pro resource; credits and UI project must be recorded. No direct API claim.', credentialStatus: has(env, 'GOOGLE_FLOW_PROJECT_ID', 'GOOGLE_FLOW_PROJECT_URL') ? 'LIVE' : 'PROVIDER_UNAVAILABLE', enabled: true }),
    descriptor({ provider: 'elevenlabs', model: 'eleven_multilingual_v2', capabilities: ['TTS'], qualityScore: 92, estimatedUnitCostUsd: 0.04, latencyClass: 'FAST', reliability: 93, resolutionSupport: [], aspectRatios: [], referenceImageSupport: false, characterConsistencySupport: true, commercialUsageNotes: 'Voice rights and cloned-voice consent must be explicit.', credentialStatus: has(env, 'VOICE_API_KEY', 'ELEVENLABS_API_KEY') ? 'LIVE' : 'NO_CREDENTIALS', enabled: true }),
    descriptor({ provider: 'runway', model: env.RUNWAY_VIDEO_MODEL ?? 'gen4.5', capabilities: ['IMAGE', 'VIDEO'], qualityScore: 91, estimatedUnitCostUsd: 0.4, latencyClass: 'SLOW', reliability: 84, maxDurationSeconds: 10, resolutionSupport: ['720p', '1080p'], aspectRatios: ['16:9', '9:16'], referenceImageSupport: true, characterConsistencySupport: true, commercialUsageNotes: 'Generated media must retain provider metadata and commercial-use review.', credentialStatus: has(env, 'RUNWAY_API_KEY') ? 'LIVE' : 'NO_CREDENTIALS', enabled: true }),
  ]);
}
