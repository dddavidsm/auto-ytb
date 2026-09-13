import type { ContentFormatProfile } from './format-profiles.js';
import type { ShotPlan } from './pipeline.js';

export type ProductionTaskKind = 'VOICE' | 'IMAGE' | 'VIDEO' | 'MAP' | 'GRAPHIC' | 'TEXT' | 'MUSIC' | 'SFX' | 'CAPTION' | 'RENDER';
export type ProductionCapability = 'TEXT' | 'VISION' | 'IMAGE' | 'VIDEO' | 'TTS' | 'MUSIC' | 'SFX' | 'CAPTIONS' | 'RENDER';
export type ProductionState = 'PLANNED' | 'READY' | 'GENERATING' | 'PARTIAL' | 'FAILED' | 'COMPLETED' | 'BLOCKED';
export type ProviderRouteDecision = { provider: string; model?: string; credentialStatus: 'LIVE' | 'LOCAL' | 'FIXTURE' | 'NO_CREDENTIALS' | 'PROVIDER_UNAVAILABLE'; estimatedUnitCostUsd: number; qualityScore: number };
export type ProductionRouter = { route(input: { capability: string; format: ContentFormatProfile; qualityTarget: number; budgetRemainingUsd: number; preferredProvider?: string }): ProviderRouteDecision | null };
export type ApprovedVideoPlan = { id: string; title: string; script: { text?: string; durationSeconds: number }; shotPlan: ShotPlan; formatProfile: ContentFormatProfile; channelBible?: Record<string, unknown>; budgetUsd: number; qualityTarget?: number; preferredProvider?: string };
export type ProductionTask = { id: string; kind: ProductionTaskKind; dependencies: string[]; provider?: string; model?: string; providerStatus: ProviderRouteDecision['credentialStatus']; status: ProductionState; estimatedCostUsd: number; actualCostUsd: number; attempts: number; artifact?: unknown; failureReason?: string };
export type ProductionJob = { id: string; approvedPlanId: string; status: ProductionState; budgetUsd: number; estimatedCostUsd: number; actualCostUsd: number; tasks: ProductionTask[]; events: Array<{ at: string; taskId?: string; event: string; detail?: string }>; channelBible?: Record<string, unknown> };

const capabilityFor = (kind: ProductionTaskKind): ProductionCapability => ({ VOICE: 'TTS', IMAGE: 'IMAGE', VIDEO: 'VIDEO', MAP: 'RENDER', GRAPHIC: 'RENDER', TEXT: 'RENDER', MUSIC: 'MUSIC', SFX: 'SFX', CAPTION: 'CAPTIONS', RENDER: 'RENDER' }[kind] as ProductionCapability);
const sceneKind = (visualType: string): ProductionTaskKind => ({ AI_VIDEO: 'VIDEO', AI_IMAGE: 'IMAGE', MAP: 'MAP', CHART: 'GRAPHIC', INFOGRAPHIC: 'GRAPHIC', KINETIC_TEXT: 'TEXT', SCREEN: 'IMAGE', CHARACTER: 'VIDEO', DOCUMENT: 'IMAGE' }[visualType] as ProductionTaskKind ?? 'GRAPHIC');

export function calculateRetryDecision(input: { task: Pick<ProductionTask, 'attempts' | 'estimatedCostUsd' | 'actualCostUsd'>; costAlreadySpentUsd: number; remainingBudgetUsd: number; alternativeProviderAvailable: boolean; cheaperFallbackAvailable: boolean; maxAttempts?: number }): { action: 'RETRY_ALTERNATIVE_PROVIDER' | 'RETRY_CHEAPER' | 'REGENERATE_PROMPT' | 'BLOCK'; reason: string } {
  const maxAttempts = input.maxAttempts ?? 3;
  if (input.task.attempts >= maxAttempts) return { action: 'BLOCK', reason: 'retry limit exhausted' };
  if (input.remainingBudgetUsd < input.task.estimatedCostUsd) return { action: 'BLOCK', reason: 'remaining budget cannot cover another attempt' };
  if (input.alternativeProviderAvailable) return { action: 'RETRY_ALTERNATIVE_PROVIDER', reason: 'switch provider before paying for another identical attempt' };
  if (input.cheaperFallbackAvailable) return { action: 'RETRY_CHEAPER', reason: 'use a cheaper fallback such as still image plus motion or procedural render' };
  if (input.costAlreadySpentUsd > input.remainingBudgetUsd * 0.5) return { action: 'REGENERATE_PROMPT', reason: 'spent cost is material; change prompt strategy before retrying' };
  return { action: 'REGENERATE_PROMPT', reason: 'retry only after changing the generation prompt' };
}

export function createProductionJob(input: ApprovedVideoPlan, router?: ProductionRouter): ProductionJob {
  const qualityTarget = input.qualityTarget ?? 80;
  const tasks: ProductionTask[] = [];
  const add = (id: string, kind: ProductionTaskKind, dependencies: string[], estimatedCostUsd: number) => {
    const route = router?.route({ capability: capabilityFor(kind), format: input.formatProfile, qualityTarget, budgetRemainingUsd: Math.max(0, input.budgetUsd - tasks.reduce((sum, task) => sum + task.estimatedCostUsd, 0)), preferredProvider: input.preferredProvider });
    const providerStatus = route?.credentialStatus ?? 'PROVIDER_UNAVAILABLE';
    tasks.push({ id, kind, dependencies, provider: route?.provider, model: route?.model, providerStatus, status: route ? 'READY' : 'BLOCKED', estimatedCostUsd, actualCostUsd: 0, attempts: 0, failureReason: route ? undefined : `No available provider for ${capabilityFor(kind)}; plan only, no artifact fabricated.` });
  };
  add('voice', 'VOICE', [], input.formatProfile.voiceProfile?.mode === 'NONE' ? 0 : 0.04);
  for (const scene of input.shotPlan.scenes) add(`scene-${scene.id}`, sceneKind(scene.visualType), ['voice'], scene.estimatedCostUsd);
  add('music', 'MUSIC', ['voice'], input.formatProfile.musicProfile?.mode === 'NONE' ? 0 : 0.01);
  add('sfx', 'SFX', ['voice'], input.formatProfile.musicProfile?.mode === 'NATURAL_SOUND' ? 0.02 : 0.005);
  add('captions', 'CAPTION', ['voice'], 0.002);
  add('render', 'RENDER', tasks.map((task) => task.id), 0.01);
  const estimatedCostUsd = Math.round(tasks.reduce((sum, task) => sum + task.estimatedCostUsd, 0) * 100) / 100;
  const blocked = tasks.some((task) => task.status === 'BLOCKED');
  return { id: `production-${input.id}`, approvedPlanId: input.id, status: blocked ? 'BLOCKED' : estimatedCostUsd > input.budgetUsd ? 'BLOCKED' : 'READY', budgetUsd: input.budgetUsd, estimatedCostUsd, actualCostUsd: 0, tasks, events: [{ at: new Date().toISOString(), event: blocked ? 'BLOCKED' : 'PLANNED', detail: blocked ? 'Provider availability is incomplete; no mock artifact was created.' : 'All required subtasks have an available route.' }], channelBible: input.channelBible };
}

export type ProductionTaskExecutor = { execute(task: ProductionTask, input: ApprovedVideoPlan): Promise<{ artifact: unknown; actualCostUsd: number }> };

export async function runProductionJob(job: ProductionJob, input: ApprovedVideoPlan, executor: ProductionTaskExecutor, options: { alternativeProviders?: Record<string, boolean>; cheaperFallbacks?: Record<string, boolean>; maxAttempts?: number } = {}): Promise<ProductionJob> {
  let progressed = true;
  job.status = 'GENERATING';
  while (progressed) {
    progressed = false;
    for (const task of job.tasks) {
      if (task.status !== 'READY') continue;
      if (task.dependencies.some((id) => job.tasks.find((candidate) => candidate.id === id)?.status !== 'COMPLETED')) continue;
      task.status = 'GENERATING'; task.attempts += 1; progressed = true;
      job.events.push({ at: new Date().toISOString(), taskId: task.id, event: 'GENERATING', detail: `${task.kind} via ${task.provider ?? 'unavailable'}` });
      try {
        const result = await executor.execute(task, input);
        task.artifact = result.artifact; task.actualCostUsd += Math.max(0, result.actualCostUsd); job.actualCostUsd += Math.max(0, result.actualCostUsd); task.status = 'COMPLETED'; job.events.push({ at: new Date().toISOString(), taskId: task.id, event: 'COMPLETED' });
      } catch (error) {
        const decision = calculateRetryDecision({ task, costAlreadySpentUsd: job.actualCostUsd, remainingBudgetUsd: job.budgetUsd - job.actualCostUsd, alternativeProviderAvailable: Boolean(options.alternativeProviders?.[task.id]), cheaperFallbackAvailable: Boolean(options.cheaperFallbacks?.[task.id]), maxAttempts: options.maxAttempts });
        task.failureReason = error instanceof Error ? error.message : String(error);
        if (decision.action === 'BLOCK') task.status = 'FAILED'; else task.status = 'READY';
        job.events.push({ at: new Date().toISOString(), taskId: task.id, event: decision.action, detail: decision.reason });
      }
    }
  }
  const failed = job.tasks.some((task) => task.status === 'FAILED');
  const blocked = job.tasks.some((task) => task.status === 'BLOCKED' || (task.status === 'READY' && task.dependencies.some((id) => job.tasks.find((candidate) => candidate.id === id)?.status !== 'COMPLETED')));
  const completed = job.tasks.every((task) => task.status === 'COMPLETED');
  job.status = failed ? 'FAILED' : completed ? 'COMPLETED' : blocked ? (job.tasks.some((task) => task.status === 'COMPLETED') ? 'PARTIAL' : 'BLOCKED') : 'PARTIAL';
  if (job.actualCostUsd > job.budgetUsd) { job.status = 'BLOCKED'; job.events.push({ at: new Date().toISOString(), event: 'BUDGET_BLOCK', detail: 'Actual cost crossed the approved cap.' }); }
  return job;
}

export class ProductionOrchestrator {
  constructor(private readonly router?: ProductionRouter, private readonly executor?: ProductionTaskExecutor) {}
  plan(input: ApprovedVideoPlan): ProductionJob { return createProductionJob(input, this.router); }
  async execute(job: ProductionJob, input: ApprovedVideoPlan, executor = this.executor, options: Parameters<typeof runProductionJob>[3] = {}): Promise<ProductionJob> {
    if (!executor) throw new Error('ProductionOrchestrator requires an executor to create real artifacts; use plan() for a zero-cost dry-run.');
    return runProductionJob(job, input, executor, options);
  }
}
