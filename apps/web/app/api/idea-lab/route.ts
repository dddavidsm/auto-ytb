import { NextResponse } from 'next/server';
import { currentSession } from '../../../lib/auth';
import { generateIdeaSeeds, type IdeaLabMode } from '../../../lib/idea-lab';
import { query, transaction } from '../../../lib/db';

export const runtime = 'nodejs';

const modes = new Set<IdeaLabMode>(['niches', 'ideas', 'kids_series', 'education']);
const safe = (value: unknown, fallback: string, max: number) => (typeof value === 'string' && value.trim() ? value.trim() : fallback).slice(0, max);

export async function GET() {
  if (!(await currentSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const ideas = await query<any>(`select o.id,o.angle,o.status,o.score::float,o.grade,o.decision,o.signals,o.risks,o.rationale,o.detected_at,o.recommended_format,t.canonical_name,t.niche,t.language,
    coalesce((select jsonb_agg(jsonb_build_object('id',j.id,'state',j.state,'kind',j.kind,'updatedAt',j.updated_at) order by j.created_at desc) from jobs j where j.opportunity_id=o.id and j.kind='produce_opportunity' limit 3),'[]'::jsonb) as jobs
    from opportunities o left join topics t on t.id=o.topic_id where o.signals ? 'ideaLab' order by o.detected_at desc limit 60`);
  return NextResponse.json({ ok: true, ideas });
}

export async function POST(request: Request) {
  if (!(await currentSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const mode = safe(body?.mode, 'ideas', 30) as IdeaLabMode;
  if (!modes.has(mode)) return NextResponse.json({ error: 'Modo de Idea Lab no válido.' }, { status: 400 });
  const language = safe(body?.language, 'es', 2) === 'en' ? 'en' : 'es';
  const brief = safe(body?.brief, mode === 'kids_series' ? 'una serie original para aprender jugando' : 'un tema que quieras explorar', 260);
  const count = Math.max(1, Math.min(8, Math.floor(Number(body?.count) || 4)));
  const seeds = generateIdeaSeeds({ mode, brief, language, count });
  const created = await transaction(async (client) => {
    const rows = [];
    for (const seed of seeds) {
      const topicName = `${seed.niche} · ${language}`.slice(0, 240);
      const topic = (await client.query(`insert into topics (canonical_name,niche,language) values ($1,$2,$3) on conflict (canonical_name) do update set niche=coalesce(excluded.niche,topics.niche),language=coalesce(excluded.language,topics.language) returning id`, [topicName, seed.niche, language])).rows[0];
      const ideaLab = { mode, language, title: seed.title, hook: seed.hook, audience: seed.audience, seriesProfile: seed.seriesProfile ?? null, rationale: seed.rationale, origin: 'idea-lab', generatedAt: new Date().toISOString(), revisionCount: 0, chatHistory: [] };
      const opportunity = (await client.query(`insert into opportunities (topic_id,angle,status,score,grade,decision,signals,risks,rationale,expires_at,recommended_format) values ($1,$2,'candidate',$3,$4,'REVIEW',$5::jsonb,$6::jsonb,$7::jsonb,now()+interval '30 days',$8) returning id,detected_at`, [topic.id, seed.angle, seed.score, seed.grade, JSON.stringify({ ideaLab }), JSON.stringify(seed.risks), JSON.stringify(seed.rationale), seed.format])).rows[0];
      rows.push({ id: opportunity.id, title: seed.title, angle: seed.angle, hook: seed.hook, audience: seed.audience, niche: seed.niche, format: seed.format, score: seed.score, grade: seed.grade, seriesProfile: seed.seriesProfile ?? null, risks: seed.risks, rationale: seed.rationale, status: 'candidate', detectedAt: opportunity.detected_at });
    }
    return rows;
  });
  return NextResponse.json({ ok: true, mode, ideas: created });
}
