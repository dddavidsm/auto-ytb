import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createDefaultProviderRegistry, runProviderProbes, buildProviderCredentialRequirements, buildCapabilityActivationReport } from '../packages/providers/dist/index.js';
import { FileDurableProductionStore } from '../packages/persistence/dist/index.js';

const registry = createDefaultProviderRegistry(process.env);
const probes = await runProviderProbes(registry);
const report = { generatedAt: new Date().toISOString(), migration: { status: process.env.DATABASE_URL ? 'PENDING_VERIFICATION' : 'MIGRATION_REQUIRED', migrations: ['024_durable_production_runs.sql', '025_real_production_worker.sql'] }, requirements: buildProviderCredentialRequirements(registry, process.env), capabilities: buildCapabilityActivationReport(registry, process.env), probes, minimumStack: { research: 'TAVILY_API_KEY or approved local research input', text: 'OPENAI_API_KEY or local-template', vision: 'OPENAI_API_KEY/GEMINI_API_KEY; otherwise NOT_EVALUATED', image: 'GEMINI_API_KEY/RUNWAY_API_KEY; otherwise local programmatic fallback', video: 'Optional: GEMINI_API_KEY/RUNWAY_API_KEY; otherwise image-motion fallback', tts: 'ELEVENLABS_API_KEY/GEMINI_API_KEY; otherwise windows-sapi-local' } };
const output = resolve('.data', 'provider-activation', 'CredentialActivationReport.json'); await mkdir(resolve('.data', 'provider-activation'), { recursive: true }); await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
const pilot = new FileDurableProductionStore(); if (await pilot.load('pilot-real-v1')) await pilot.saveReport('pilot-real-v1', 'CredentialActivationReport', report);
console.log(JSON.stringify({ path: output, migration: report.migration.status, noExternalCalls: probes.noExternalCalls, capabilities: report.capabilities }, null, 2));
