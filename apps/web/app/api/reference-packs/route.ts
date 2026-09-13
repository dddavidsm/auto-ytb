import { NextResponse } from 'next/server';
import { currentSession } from '../../../lib/auth';
import { query } from '../../../lib/db';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  if (!(await currentSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => null) as { videoIds?: unknown; niche?: unknown; topic?: unknown; format?: unknown } | null;
  const ids = Array.isArray(body?.videoIds) ? [...new Set(body.videoIds.filter((value): value is string => typeof value === 'string' && value.length > 0))] : [];
  if (ids.length < 3 || ids.length > 7) return NextResponse.json({ error: 'videoIds must contain 3 to 7 videos' }, { status: 400 });
  const rows = await query<{ id: string; youtube_video_id: string; channel_id: string }>('select v.id,v.youtube_video_id,v.channel_id from videos v join channels c on c.id=v.channel_id where v.id=any($1::uuid[]) and c.is_competitor=true', [ids]);
  if (rows.length !== ids.length) return NextResponse.json({ error: 'All selected videos must be competitor references' }, { status: 400 });
  const pack = await query<{ id: string }>('insert into reference_packs (niche,topic,format,version,diversity,limitations) values ($1,$2,$3,1,$4::jsonb,$5::jsonb) returning id', [typeof body?.niche === 'string' ? body.niche : 'ui-selection', typeof body?.topic === 'string' ? body.topic : null, typeof body?.format === 'string' ? body.format : null, JSON.stringify({ roles: ['TOPIC_FRAMING', 'TITLE_GRAMMAR', 'THUMBNAIL_COMPOSITION', 'HOOK', 'PACING', 'VISUAL_LANGUAGE'] }), JSON.stringify(['Selection is user-curated; revalidate metadata before production.'])]);
  const roles = ['TOPIC_FRAMING', 'TITLE_GRAMMAR', 'THUMBNAIL_COMPOSITION', 'HOOK_ARCHITECTURE', 'EDITING_PACING', 'VISUAL_LANGUAGE'];
  for (const [index, row] of rows.entries()) await query('insert into reference_pack_items (reference_pack_id,video_id,external_video_id,channel_id,role,evidence,outlier_score,selected_because) values ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)', [pack[0].id, row.id, row.youtube_video_id, row.channel_id, roles[index % roles.length], JSON.stringify([]), null, 'Selected in Reference Lab V2; role is a structural lens, not a copying instruction']);
  return NextResponse.json({ ok: true, id: pack[0].id, count: rows.length });
}
