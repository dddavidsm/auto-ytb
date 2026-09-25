import { NextResponse } from 'next/server';
import { currentSession } from '../../../../../lib/auth';
import { query } from '../../../../../lib/db';

export const runtime = 'nodejs';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const rows = await query<any>(`select j.id,j.job_key,j.kind,j.state,j.attempts,j.max_attempts,j.last_error,j.created_at,j.updated_at,j.completed_at,j.payload,pr.id as production_run_id,pr.state as production_state,pr.metadata as production_metadata from jobs j left join content_ideas ci on ci.opportunity_id=j.opportunity_id left join production_runs pr on pr.content_idea_id=ci.id where j.id=$1 order by pr.created_at desc nulls last limit 1`, [id]);
  const job = rows[0];
  if (!job) return NextResponse.json({ error: 'Production job not found.' }, { status: 404 });
  const events = await query<any>(`select event_type,detail,created_at from job_events where job_id=$1 order by created_at desc limit 20`, [id]);
  return NextResponse.json({ ok: true, job: { id: job.id, state: job.state, attempts: job.attempts, maxAttempts: job.max_attempts, error: job.last_error, createdAt: job.created_at, updatedAt: job.updated_at, completedAt: job.completed_at, productionRunId: job.production_run_id, productionState: job.production_state, metadata: job.production_metadata, brief: job.payload?.ui ?? null }, events });
}
