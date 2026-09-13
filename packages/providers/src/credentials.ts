import type { CredentialStatus, ProviderCapabilityName, ProviderDescriptor, ProviderRegistry } from './registry.js';

export type ProviderCredentialRequirement = { provider: string; capability: ProviderCapabilityName; requiredEnvVars: string[]; optionalEnvVars: string[]; configured: boolean; credentialState: CredentialStatus | 'MISSING'; blockingReason: string };
const requirements: Array<{ provider: string; capability: ProviderCapabilityName; required: string[]; optional?: string[] }> = [
  { provider: 'tavily', capability: 'RESEARCH', required: ['TAVILY_API_KEY'] },
  { provider: 'openai', capability: 'TEXT', required: ['OPENAI_API_KEY'], optional: ['OPENAI_MODEL'] },
  { provider: 'openai', capability: 'VISION', required: ['OPENAI_API_KEY'], optional: ['OPENAI_MODEL'] },
  { provider: 'gemini', capability: 'IMAGE', required: ['GEMINI_API_KEY or GOOGLE_API_KEY'], optional: ['GEMINI_MODEL'] },
  { provider: 'gemini', capability: 'VIDEO', required: ['GEMINI_API_KEY or GOOGLE_API_KEY'], optional: ['GEMINI_MODEL'] },
  { provider: 'gemini', capability: 'VISION', required: ['GEMINI_API_KEY or GOOGLE_API_KEY'], optional: ['GEMINI_MODEL'] },
  { provider: 'gemini', capability: 'TTS', required: ['GEMINI_API_KEY or GOOGLE_API_KEY'], optional: ['GEMINI_MODEL'] },
  { provider: 'elevenlabs', capability: 'TTS', required: ['ELEVENLABS_API_KEY'] },
  { provider: 'runway', capability: 'IMAGE', required: ['RUNWAY_API_KEY'], optional: ['RUNWAY_VIDEO_MODEL'] },
  { provider: 'runway', capability: 'VIDEO', required: ['RUNWAY_API_KEY'], optional: ['RUNWAY_VIDEO_MODEL'] },
];
const hasAny = (env: Record<string, string | undefined>, expression: string) => expression.includes(' or ') ? expression.split(' or ').some((name) => Boolean(env[name]?.trim())) : Boolean(env[expression]?.trim());

export function buildProviderCredentialRequirements(registry: ProviderRegistry, env: Record<string, string | undefined> = process.env): ProviderCredentialRequirement[] {
  return requirements.map((item) => {
    const descriptor = registry.get(item.provider); const configured = item.required.every((name) => hasAny(env, name));
    const credentialState = descriptor?.credentialStatus ?? (configured ? 'LIVE' : 'NO_CREDENTIALS');
    return { provider: item.provider, capability: item.capability, requiredEnvVars: item.required, optionalEnvVars: item.optional ?? [], configured, credentialState: configured ? credentialState : 'MISSING', blockingReason: configured ? (credentialState === 'LIVE' ? 'Credentials configured; safe probe still required.' : 'Local/fixture registration only; not a commercial capability.') : `Missing ${item.required.join(', ')}.` };
  });
}

export type CapabilityActivation = { capability: ProviderCapabilityName; status: 'available' | 'missing'; compatibleRegisteredProviders: string[]; availableProviders: string[]; blockingReason: string };
export function buildCapabilityActivationReport(registry: ProviderRegistry, env: Record<string, string | undefined> = process.env): CapabilityActivation[] {
  const rows = buildProviderCredentialRequirements(registry, env); const capabilities: ProviderCapabilityName[] = ['TTS', 'IMAGE', 'VISION', 'VIDEO', 'RESEARCH', 'TEXT'];
  return capabilities.map((capability) => { const providers = registry.list().filter((provider) => provider.capabilities.includes(capability)); const available = providers.filter((provider) => provider.enabled && provider.credentialStatus === 'LOCAL'); const configuredLive = rows.filter((row) => row.capability === capability && row.configured && row.credentialState === 'LIVE'); return { capability, status: available.length || configuredLive.length ? 'available' : 'missing', compatibleRegisteredProviders: providers.map((provider) => provider.provider), availableProviders: [...available.map((provider) => provider.provider), ...configuredLive.map((row) => row.provider)], blockingReason: available.length ? 'Local capability available; commercial activation is optional for this capability.' : configuredLive.length ? 'Credential configured; probe result determines final availability.' : 'No configured provider for this capability.' }; });
}
