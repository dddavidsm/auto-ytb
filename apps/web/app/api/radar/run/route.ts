import { NextResponse } from 'next/server';
import { currentSession } from '../../../../lib/auth';
import { query } from '../../../../lib/db';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const niche = String(body.niche || process.env.PRIMARY_CHANNEL_KEY || 'future-tech-business').trim().slice(0, 120);
  const now = new Date();
  const slot = now.toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const key = `ui-market-cycle:${session.email || 'workspace'}:${slot}`;
  const payload = { source: 'control-plane-ui', requestedBy: session.email || null, niche, maxQueries: 5, days: 14 };
  const rows = await query<{ id: string; state: string }>(`insert into jobs (job_key,kind,state,priority,max_attempts,payload)
    values ($1,'market_cycle','queued',92,3,$2::jsonb)
    on conflict (job_key) do update set updated_at=now()
    returning id,state`, [key, JSON.stringify(payload)]);
  return NextResponse.json({ ok: true, job: rows[0] || null, message: 'Radar iniciado. La primera actualización aparecerá en unos segundos.' });
}
