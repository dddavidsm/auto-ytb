import { NextResponse } from 'next/server';
import { currentSession } from '../../../../../lib/auth';
import { query, transaction } from '../../../../../lib/db';

export const runtime = 'nodejs';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const rows = await query<any>('select id from production_runs where id=$1 and deleted_at is null limit 1', [id]);
  if (!rows[0]) return NextResponse.json({ error: 'Vídeo no encontrado o ya eliminado.' }, { status: 404 });
  await transaction(async (client) => {
    await client.query(`update production_runs set deleted_at=now(),metadata=metadata||$2::jsonb,updated_at=now() where id=$1`, [id, JSON.stringify({ galleryDeletedAt: new Date().toISOString() })]);
    await client.query(`update jobs set state='cancelled',last_error='Ocultado desde la galería',updated_at=now() where state in ('queued','retry') and payload->>'productionRunId'=$1`, [id]);
  });
  return NextResponse.json({ ok: true, deleted: true, recoverable: true });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const platform = String(body.platform ?? '').toLowerCase();
  if (!['youtube', 'tiktok'].includes(platform)) return NextResponse.json({ error: 'Plataforma no soportada.' }, { status: 400 });
  const rows = await query<any>(`select p.id as publication_id,p.youtube_video_id,p.content_format,p.channel_id,c.credentials_ref,c.channel_key,c.config_path,pr.metadata,ci.format
    from production_runs pr join content_ideas ci on ci.id=pr.content_idea_id
    left join publications p on p.production_run_id=pr.id
    left join channels c on c.id=coalesce(p.channel_id,(select id from channels where is_owned=true order by updated_at desc limit 1))
    where pr.id=$1 and pr.deleted_at is null limit 1`, [id]);
  const row = rows[0];
  if (!row) return NextResponse.json({ error: 'Vídeo no encontrado.' }, { status: 404 });
  if (platform === 'youtube' && !row.youtube_video_id) {
    const key = `upload-private-production:${id}`;
    const payload = { productionRunId: id, channelId: row.channel_id, channelKey: row.channel_key, credentialsRef: row.credentials_ref ?? 'PRIMARY', channelConfigPath: row.config_path ?? 'config/channels/future-tech-business.example.json', contentFormat: row.content_format ?? row.format ?? 'LONG_HORIZONTAL', source: 'gallery-manual-upload' };
    const inserted = await query(`insert into jobs (job_key,kind,channel_id,state,priority,max_attempts,payload) values ($1,'upload_private_production',$2,'queued',98,4,$3::jsonb) on conflict (job_key) do nothing returning id`, [key, row.channel_id, JSON.stringify(payload)]);
    return NextResponse.json({ ok: true, queued: true, jobId: inserted[0]?.id ?? null, platform, message: 'Subida privada a YouTube en curso; la galería se actualizará al terminar.' });
  }
  if (!row.publication_id) return NextResponse.json({ error: 'Este render aún no está vinculado a una publicación ni a un canal conectado.' }, { status: 409 });
  if (platform === 'youtube' && row.youtube_video_id) return NextResponse.json({ ok: true, alreadyUploaded: true, platform, youtubeVideoId: row.youtube_video_id, url: `https://www.youtube.com/watch?v=${row.youtube_video_id}` });
  if (platform === 'tiktok' && row.content_format !== 'SHORT_VERTICAL') return NextResponse.json({ error: 'TikTok necesita una versión vertical nativa; no se recorta el máster horizontal.' }, { status: 409 });
  const key = `manual-distribution:${row.publication_id}:${platform}`;
  const payload = { publicationId: row.publication_id, platform, channelId: row.channel_id, channelKey: row.channel_key, credentialsRef: row.credentials_ref ?? 'PRIMARY', channelConfigPath: row.config_path ?? 'config/channels/future-tech-business.example.json', contentFormat: row.content_format, source: 'gallery-manual-distribution' };
  const inserted = await query(`insert into jobs (job_key,kind,channel_id,state,priority,max_attempts,payload) values ($1,'distribute_publication',$2,'queued',96,4,$3::jsonb) on conflict (job_key) do nothing returning id`, [key, row.channel_id, JSON.stringify(payload)]);
  await query(`insert into distribution_attempts (publication_id,platform,state,metadata) values ($1,$2,'queued',$3::jsonb) on conflict (publication_id,platform) do update set state='queued',last_error=null,metadata=distribution_attempts.metadata||excluded.metadata,updated_at=now()`, [row.publication_id, platform, JSON.stringify({ source: 'gallery-manual-distribution', queuedAt: new Date().toISOString() })]);
  return NextResponse.json({ ok: true, queued: true, jobId: inserted[0]?.id ?? null, platform });
}
