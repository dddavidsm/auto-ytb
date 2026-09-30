import { NextResponse } from 'next/server';
import { currentSession } from '../../../lib/auth';
import { query } from '../../../lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!(await currentSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const opportunities = await query<any>(`select o.id,o.angle,o.status,o.score::float,o.grade,o.decision,o.signals,o.evidence,o.reference_pack,o.score_breakdown,o.confidence::float,o.rationale,o.risks,o.detected_at,o.expires_at,o.recommended_format,
    t.canonical_name as topic,t.niche,t.language,
    coalesce((select jsonb_agg(jsonb_build_object('id',j.id,'state',j.state,'kind',j.kind,'updatedAt',j.updated_at) order by j.created_at desc) from jobs j where j.opportunity_id=o.id and j.kind='produce_opportunity' limit 3),'[]'::jsonb) as jobs
    from opportunities o join topics t on t.id=o.topic_id
    where coalesce(o.expires_at,now()+interval '1 day') > now()
      and coalesce(o.decision,'WATCH') in ('PRODUCE','RESEARCH','WATCH','REVIEW')
      and not (o.signals ? 'ideaLab')
      and coalesce(o.signals->>'source','') <> 'control-plane-ui'
      and coalesce(o.confidence,0) >= 70
      and jsonb_array_length(coalesce(o.evidence,'[]'::jsonb)) > 0
    order by o.score desc, o.confidence desc, o.detected_at desc limit 8`);
  return NextResponse.json({ ok: true, opportunities, qualityGate: { maxItems: 8, minimumConfidence: 70, requiresEvidence: true } });
}
