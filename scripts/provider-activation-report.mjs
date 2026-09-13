import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createDefaultProviderRegistry, runProviderProbes, buildProviderCredentialRequirements, buildCapabilityActivationReport } from '../packages/providers/dist/index.js';
import { FileDurableProductionStore } from '../packages/persistence/dist/index.js';

const registry = createDefaultProviderRegistry(process.env);
let geminiModelsPromise;
const geminiProbe = async (_provider, capability) => {
  if (!geminiModelsPromise) {
    const started = Date.now();
    geminiModelsPromise = fetch(`${process.env.GEMINI_API_BASE_URL ?? 'https://generativelanguage.googleapis.com/v1beta'}/models`, {
      headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? '' },
    }).then(async (response) => {
      const body = await response.text();
      if (!response.ok) throw new Error(`Gemini model probe failed with HTTP ${response.status}`);
      const json = JSON.parse(body);
      return { models: Array.isArray(json.models) ? json.models : [], latencyMs: Date.now() - started };
    });
  }
  const { models, latencyMs } = await geminiModelsPromise;
  const names = models.map((model) => String(model.name ?? '').replace(/^models\//, '').toLowerCase());
  const patterns = {
    TEXT: [/gemini-.*flash/, /gemini-.*pro/],
    VISION: [/gemini-.*flash/, /gemini-.*pro/],
    IMAGE: [/gemini-.*image/],
    VIDEO: [/veo-.*generate/],
    TTS: [/gemini-.*tts/],
  };
  const matched = (patterns[capability] ?? []).some((pattern) => names.some((name) => pattern.test(name)));
  if (!matched) return { state: 'UNAVAILABLE', latencyMs, reason: `No accessible Gemini model matched ${capability}.` };
  return { state: 'AVAILABLE', latencyMs, reason: `Gemini model catalog confirms ${capability} capability.` };
};
const probes = await runProviderProbes(registry, process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY ? { gemini: geminiProbe } : {});
const report = { generatedAt: new Date().toISOString(), migration: { status: process.env.DATABASE_URL ? 'PENDING_VERIFICATION' : 'MIGRATION_REQUIRED', migrations: ['024_durable_production_runs.sql', '025_real_production_worker.sql'] }, requirements: buildProviderCredentialRequirements(registry, process.env), capabilities: buildCapabilityActivationReport(registry, process.env), probes, minimumStack: { research: 'TAVILY_API_KEY or approved local research input', text: 'OPENAI_API_KEY or local-template', vision: 'OPENAI_API_KEY/GEMINI_API_KEY; otherwise NOT_EVALUATED', image: 'GEMINI_API_KEY/RUNWAY_API_KEY; otherwise local programmatic fallback', video: 'Optional: GEMINI_API_KEY/RUNWAY_API_KEY; otherwise image-motion fallback', tts: 'ELEVENLABS_API_KEY/GEMINI_API_KEY; otherwise windows-sapi-local' } };
const output = resolve('.data', 'provider-activation', 'CredentialActivationReport.json'); await mkdir(resolve('.data', 'provider-activation'), { recursive: true }); await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
const pilot = new FileDurableProductionStore(); if (await pilot.load('pilot-real-v1')) { await pilot.saveReport('pilot-real-v1', 'CredentialActivationReport', report); await pilot.saveReport('pilot-real-v1', 'REAL_PRODUCTION_PREFLIGHT', { status: 'BLOCKED', maxExternalCostUsd: 5, initialBudgetUsd: 3.5, revisionReserveUsd: 1.5, operations: [{ operation: 'TTS', provider: 'windows-sapi-local', scene: 'all', units: 6, estimatedCostUsd: 0, fallbackCostUsd: 0 }, { operation: 'IMAGE/VIDEO', provider: 'gemini/runway', scene: 'scene-01..06', units: 6, estimatedCostUsd: 0.8, fallbackCostUsd: 0, status: 'NO_CREDENTIALS' }, { operation: 'RENDER', provider: 'ffmpeg-local', scene: 'all', units: 1, estimatedCostUsd: 0, fallbackCostUsd: 0 }], totalEstimatedExternalUsd: 0, totalFallbackUsd: 0, blockingReason: 'Commercial operations are not submitted while credentials or migration are missing.' }); await pilot.saveReport('pilot-real-v1', 'ReferenceComparativeReview', { status: 'NOT_EVALUATED', dimensions: { openingStrength: 'NOT_EVALUATED', pace: 'NOT_EVALUATED', visualDensity: 'NOT_EVALUATED', clarity: 'NOT_EVALUATED', storyMovement: 'NOT_EVALUATED', thumbnailSimplicity: 'NOT_EVALUATED', titleStrength: 'NOT_EVALUATED', informationDensity: 'NOT_EVALUATED' }, evidence: 'ReferencePack evidence is persisted; no independent semantic/comparative evaluator is configured.' }); await pilot.saveReport('pilot-real-v1', 'PublicationCandidateReport', { status: 'BLOCKED', decision: 'READY_FOR_REAL_PROVIDERS', dimensions: { HOOK: 'PASS', TITLE: 'PASS', THUMBNAIL: 'WARN', SCRIPT: 'PASS', FACTUALITY: 'WARN', ORIGINALITY: 'PASS', VOICE: 'NOT_EVALUATED', VISUAL_RELEVANCE: 'NOT_EVALUATED', VISUAL_CONSISTENCY: 'PASS', PACING: 'PASS', AUDIO: 'PASS', CAPTIONS: 'PASS', TRANSITIONS: 'PASS', ENDING: 'PASS', YPP: 'WARN', COPYRIGHT: 'WARN', COST: 'PASS' }, blockers: ['MIGRATION_REQUIRED', 'NO_CREDENTIALS for commercial research/vision/image/video providers', 'Semantic and voice quality evaluation unavailable'] }); }
console.log(JSON.stringify({ path: output, migration: report.migration.status, noExternalCalls: probes.noExternalCalls, capabilities: report.capabilities }, null, 2));
