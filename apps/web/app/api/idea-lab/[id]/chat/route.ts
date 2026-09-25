import { NextResponse } from 'next/server';
import { currentSession } from '../../../../../lib/auth';
import { query, transaction } from '../../../../../lib/db';

export const runtime = 'nodejs';

function classify(message: string) {
  if (/busca|investiga|recurso|fuente|referenc|evidencia|youtube|web|internet/i.test(message)) return 'research';
  if (/regenera|regener|otra versi[oó]n|nueva idea|otra idea|cambia|reescribe|replantea/i.test(message)) return 'regenerate';
  return 'edit';
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const message = typeof body?.message === 'string' ? body.message.trim().slice(0, 1200) : '';
  if (message.length < 3) return NextResponse.json({ error: 'Escribe qué quieres cambiar o investigar.' }, { status: 400 });
  const result = await transaction(async (client) => {
    const current = (await client.query(`select o.id,o.angle,o.signals,o.status,o.score::float,o.grade,o.recommended_format,t.canonical_name,t.niche,t.language from opportunities o left join topics t on t.id=o.topic_id where o.id=$1 for update`, [id])).rows[0];
    if (!current) return null;
    const existing = current.signals?.ideaLab ?? {};
    const action = classify(message);
    const history = Array.isArray(existing.chatHistory) ? existing.chatHistory.slice(-18) : [];
    const revisionCount = Number(existing.revisionCount || 0) + (action === 'research' ? 0 : 1);
    const updatedIdeaLab = { ...existing, lastAction: action, lastFeedback: message, revisionCount, chatHistory: [...history, { role: 'user', content: message, at: new Date().toISOString() }] };
    let researchJobId: string | null = null;
    if (action === 'research') {
      const jobKey = `idea-lab-research:${id}:${revisionCount}:${message.toLowerCase().slice(0, 40)}`;
      const job = (await client.query(`insert into jobs (job_key,kind,opportunity_id,state,priority,max_attempts,payload) values ($1,'market_cycle',$2,'queued',82,4,$3::jsonb) on conflict (job_key) do nothing returning id`, [jobKey, id, JSON.stringify({ niche: current.niche || current.canonical_name || current.angle, maxQueries: 6, days: 14, ideaLabOpportunityId: id, request: message })])).rows[0];
      researchJobId = job?.id ?? ((await client.query(`select id from jobs where job_key=$1`, [jobKey])).rows[0]?.id ?? null);
      if (researchJobId) await client.query(`insert into job_events (job_id,event_type,detail) values ($1,'idea_lab_research_requested',$2::jsonb)`, [researchJobId, JSON.stringify({ opportunityId: id, request: message })]);
    } else {
      updatedIdeaLab.angle = action === 'regenerate' ? `${current.angle} Nueva versión solicitada: ${message}`.slice(0, 1200) : current.angle;
      updatedIdeaLab.revisionNote = message;
      await client.query(`update opportunities set angle=$2,status='candidate',decision='REVIEW',signals=$3::jsonb,detected_at=now(),expires_at=now()+interval '30 days' where id=$1`, [id, updatedIdeaLab.angle, JSON.stringify({ ...(current.signals || {}), ideaLab: updatedIdeaLab })]);
    }
    if (action === 'research') await client.query(`update opportunities set status='research',signals=$2::jsonb where id=$1`, [id, JSON.stringify({ ...(current.signals || {}), ideaLab: updatedIdeaLab })]);
    const refreshed = (await client.query(`select o.id,o.angle,o.status,o.score::float,o.grade,o.decision,o.signals,o.risks,o.rationale,o.recommended_format,t.canonical_name,t.niche,t.language from opportunities o left join topics t on t.id=o.topic_id where o.id=$1`, [id])).rows[0];
    return { action, researchJobId, idea: refreshed };
  });
  if (!result) return NextResponse.json({ error: 'Idea no encontrada.' }, { status: 404 });
  const response = result.action === 'research' ? 'He dejado una investigación de mercado en cola. Cuando termine, sus señales quedarán asociadas a esta idea.' : result.action === 'regenerate' ? 'He preparado una nueva versión de la propuesta y guardado tu feedback para la siguiente producción.' : 'He guardado el cambio como instrucción editorial para esta idea.';
  return NextResponse.json({ ok: true, ...result, assistant: response });
}
