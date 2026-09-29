import { NextResponse } from 'next/server';
import { currentSession } from '../../../../../lib/auth';
import { query } from '../../../../../lib/db';

export const runtime = 'nodejs';

const stageNames = ['BRIEF_ACCEPTED', 'FORMAT_SELECTED', 'JOB_PERSISTED', 'RESEARCH', 'SCRIPT', 'SHOT_PLAN', 'ASSETS', 'VOICE', 'ASSEMBLY', 'QA', 'ARCHIVED', 'READY_FOR_REVIEW'];

function stageFrom(value: unknown) {
  const normalized = String(value || '').toUpperCase().replace(/-/g, '_');
  const aliases: Record<string, string> = { STARTED: 'BRIEF_ACCEPTED', UI_REQUEST_QUEUED: 'BRIEF_ACCEPTED', FORMAT: 'FORMAT_SELECTED', PERSISTED: 'JOB_PERSISTED', SOURCE: 'ASSETS', SOURCES: 'ASSETS', RENDER: 'ASSEMBLY', COMPLETE: 'READY_FOR_REVIEW', SUCCEEDED: 'READY_FOR_REVIEW' };
  if (aliases[normalized]) return aliases[normalized];
  return stageNames.find((stage) => normalized.includes(stage)) || '';
}

function progressFor(state: string, stage: string) {
  if (state === 'succeeded') return 100;
  const index = Math.max(0, stageNames.indexOf(stage));
  return Math.round((index / (stageNames.length - 1)) * 100);
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const rows = await query<any>(`select j.id,j.job_key,j.kind,j.state,j.attempts,j.max_attempts,j.last_error,j.created_at,j.updated_at,j.completed_at,j.heartbeat_at,j.payload,pr.id as production_run_id,pr.state as production_state,pr.current_stage as production_current_stage,pr.metadata as production_metadata from jobs j left join content_ideas ci on ci.opportunity_id=j.opportunity_id left join production_runs pr on pr.content_idea_id=ci.id where j.id=$1 order by pr.created_at desc nulls last limit 1`, [id]);
  const job = rows[0];
  if (!job) return NextResponse.json({ error: 'Production job not found.' }, { status: 404 });
  const events = await query<any>(`select event_type,detail,created_at from job_events where job_id=$1 order by created_at desc limit 20`, [id]);
  // The worker emits the production run id before the jobs row is finalized.
  // Resolve it from the event stream as a recovery path so the UI can render
  // the finished video even when the join was observed during that small
  // transaction window.
  const eventProductionRunId = events.map((event) => String(event.detail?.productionRunId || '')).find(Boolean) || null;
  let productionRunId = job.production_run_id || eventProductionRunId;
  let productionState = job.production_state;
  let productionCurrentStage = job.production_current_stage;
  let productionMetadata = job.production_metadata;
  if (!job.production_run_id && eventProductionRunId) {
    const recovered = await query<any>('select id,state,current_stage,metadata from production_runs where id=$1 limit 1', [eventProductionRunId]);
    if (recovered[0]) {
      productionRunId = recovered[0].id;
      productionState = recovered[0].state;
      productionCurrentStage = recovered[0].current_stage;
      productionMetadata = recovered[0].metadata;
    }
  }
  const latestEventStage = events.map((event) => stageFrom(event.detail?.stage || event.event_type)).find(Boolean) || '';
  const latestProgress = events.map((event) => Number(event.detail?.progressPercent)).find((value) => Number.isFinite(value) && value >= 0 && value <= 100);
  const currentStage = stageFrom(productionCurrentStage) || latestEventStage || 'BRIEF_ACCEPTED';
  const lastSignalAt = job.heartbeat_at || job.updated_at || job.created_at;
  return NextResponse.json({ ok: true, job: { id: job.id, state: job.state, attempts: job.attempts, maxAttempts: job.max_attempts, error: job.state === 'running' ? null : job.last_error, createdAt: job.created_at, updatedAt: job.updated_at, heartbeatAt: job.heartbeat_at, lastSignalAt, completedAt: job.completed_at, productionRunId, productionState, currentStage, progressPercent: latestProgress ?? progressFor(String(job.state), currentStage), metadata: productionMetadata, brief: job.payload?.ui ?? null }, events });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const topic = typeof body.topic === 'string' ? body.topic.trim().slice(0, 240) : '';
  const rows = await query<any>('select id,state,payload from jobs where id=$1 limit 1', [id]);
  const job = rows[0];
  if (!job) return NextResponse.json({ error: 'Production job not found.' }, { status: 404 });
  const forcedRunningRecovery = String(body.force ?? '').toLowerCase() === 'true' && String(job.state) === 'running';
  if (!['dead', 'retry'].includes(String(job.state)) && !forcedRunningRecovery) return NextResponse.json({ error: `Job is ${job.state}; only dead/retry jobs can be requeued.` }, { status: 409 });
  const payload = { ...(job.payload ?? {}) } as Record<string, any>;
  if (topic) {
    payload.topic = topic;
    payload.angle = topic;
    payload.ui = { ...(payload.ui ?? {}), prompt: topic };
  }
  await query(`update jobs set state='queued',attempts=0,max_attempts=greatest(max_attempts,4),not_before=now(),locked_at=null,locked_by=null,lease_owner=null,lease_expires_at=null,heartbeat_at=now(),completed_at=null,last_error=null,payload=$2::jsonb,updated_at=now() where id=$1`, [id, JSON.stringify(payload)]);
  await query(`insert into job_events (job_id,event_type,detail) values ($1,'manual_requeue',$2::jsonb)`, [id, JSON.stringify({ topic: topic || payload.topic || null, reason: forcedRunningRecovery ? 'controlled stale-lease recovery' : 'controlled production repair' })]);
  return NextResponse.json({ ok: true, jobId: id, state: 'queued', topic: topic || payload.topic || null });
}
