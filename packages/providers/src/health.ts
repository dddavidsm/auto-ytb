import type { ProviderCapabilityName, ProviderDescriptor, ProviderRegistry, CredentialStatus } from './registry.js';

export type ProviderHealthState = 'CONFIGURED' | 'NO_CREDENTIALS' | 'INVALID_CREDENTIALS' | 'AVAILABLE' | 'RATE_LIMITED' | 'DEGRADED' | 'UNAVAILABLE';
export type ProviderCapabilityHealth = { capability: ProviderCapabilityName; state: ProviderHealthState; checkedAt: string; latencyMs?: number; reason: string };
export type ProviderHealthReport = { provider: string; model?: string; credentialStatus: CredentialStatus; capabilities: ProviderCapabilityHealth[] };
export type ProviderProbe = (provider: ProviderDescriptor, capability: ProviderCapabilityName) => Promise<{ state: Exclude<ProviderHealthState, 'CONFIGURED' | 'NO_CREDENTIALS'>; latencyMs?: number; reason?: string }>;
export type ProviderProbeSummary = { checkedAt: string; reports: ProviderHealthReport[]; noExternalCalls: boolean };

function credentialState(provider: ProviderDescriptor): ProviderHealthState { return provider.credentialStatus === 'NO_CREDENTIALS' ? 'NO_CREDENTIALS' : provider.credentialStatus === 'PROVIDER_UNAVAILABLE' ? 'UNAVAILABLE' : 'CONFIGURED'; }

export class ProviderHealthCheck {
  constructor(private readonly registry: ProviderRegistry) {}
  async check(probes: Record<string, ProviderProbe> = {}): Promise<ProviderHealthReport[]> { const reports: ProviderHealthReport[] = []; for (const provider of this.registry.list()) { const base = credentialState(provider); const capabilities: ProviderCapabilityHealth[] = []; for (const capability of provider.capabilities) { const checkedAt = new Date().toISOString(); if (base === 'NO_CREDENTIALS' || base === 'UNAVAILABLE') { capabilities.push({ capability, state: base, checkedAt, reason: base === 'NO_CREDENTIALS' ? 'Credential not configured; no provider call attempted.' : 'Provider is disabled or unavailable.' }); continue; } const probe = probes[provider.provider]; if (!probe) { capabilities.push({ capability, state: provider.credentialStatus === 'FIXTURE' || provider.credentialStatus === 'LOCAL' ? 'AVAILABLE' : 'CONFIGURED', checkedAt, reason: provider.credentialStatus === 'FIXTURE' ? 'Deterministic fixture route; no external call.' : provider.credentialStatus === 'LOCAL' ? 'Local capability registered; safe probe not required.' : 'Credentials present; capability not actively probed.' }); continue; } try { const result = await probe(provider, capability); capabilities.push({ capability, state: result.state, checkedAt, latencyMs: result.latencyMs, reason: result.reason ?? 'Probe completed.' }); } catch (error) { capabilities.push({ capability, state: 'UNAVAILABLE', checkedAt, reason: error instanceof Error ? error.message : String(error) }); } } reports.push({ provider: provider.provider, model: provider.model, credentialStatus: provider.credentialStatus, capabilities }); } return reports; }
}

/** Runs only injected, cheap probes. Missing credentials are returned without invoking a probe. */
export async function runProviderProbes(registry: ProviderRegistry, probes: Record<string, ProviderProbe> = {}): Promise<ProviderProbeSummary> {
  const reports = await new ProviderHealthCheck(registry).check(probes);
  return { checkedAt: new Date().toISOString(), reports, noExternalCalls: reports.every((report) => report.credentialStatus !== 'LIVE') };
}
