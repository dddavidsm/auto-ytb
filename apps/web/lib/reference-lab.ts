import 'server-only';
import { query } from './db';

const SORTS = new Set(['views', 'views_day', 'views_subscriber', 'velocity', 'outlier', 'date']);

export async function loadReferenceLab(input: { sort?: string; format?: string; channelId?: string; query?: string; minAgeDays?: string; maxAgeDays?: string }) {
  const sort = SORTS.has(input.sort ?? '') ? input.sort! : 'outlier';
  const format = input.format === 'SHORTS' ? 'SHORTS' : input.format === 'LONG_FORM' ? 'LONG_FORM' : 'ALL';
  const conditions = ['c.is_competitor=true'];
  const params: unknown[] = [];
  if (format === 'SHORTS') conditions.push('v.duration_seconds is not null and v.duration_seconds <= 180');
  if (format === 'LONG_FORM') conditions.push('(v.duration_seconds is null or v.duration_seconds > 180)');
  if (input.channelId) { params.push(input.channelId); conditions.push(`c.id=$${params.length}`); }
  if (input.query?.trim()) { params.push(`%${input.query.trim()}%`); conditions.push(`(v.title ilike $${params.length} or c.title ilike $${params.length})`); }
  const minAge = Number(input.minAgeDays); if (Number.isFinite(minAge) && minAge >= 0) { params.push(minAge); conditions.push(`v.published_at <= now()-($${params.length}::numeric * interval '1 day')`); }
  const maxAge = Number(input.maxAgeDays); if (Number.isFinite(maxAge) && maxAge >= 0) { params.push(maxAge); conditions.push(`v.published_at >= now()-($${params.length}::numeric * interval '1 day')`); }
  const where = conditions.join(' and ');
  const order = sort === 'views' ? 'views desc' : sort === 'views_day' ? 'views_per_day desc' : sort === 'views_subscriber' ? 'views_per_subscriber desc nulls last' : sort === 'velocity' ? 'views_per_hour desc' : sort === 'date' ? 'v.published_at desc' : 'outlier_score desc';
  const [channels, videos] = await Promise.all([
    query(`select c.id,c.youtube_channel_id,c.handle,c.title,c.description,c.niche,c.language,c.country,coalesce(cs.subscribers,0)::bigint as subscribers,coalesce(cs.total_views,0)::bigint as total_views,coalesce(cs.video_count,0)::bigint as total_videos,coalesce(cs.strongest_outlier,0)::float as strongest_outlier from channels c left join lateral (select * from competitor_snapshots x where x.channel_id=c.id order by x.captured_at desc limit 1) cs on true where c.is_competitor=true order by coalesce(cs.strongest_outlier,0) desc,c.title asc limit 100`),
    query(`with latest as (select distinct on (vs.video_id) v.id,v.youtube_video_id,v.channel_id,c.title as channel_title,v.title,v.thumbnail_url,v.published_at,v.duration_seconds,vs.views,vs.likes,vs.comments,vs.captured_at,coalesce(cs.subscribers,0)::numeric as channel_subscribers from videos v join channels c on c.id=v.channel_id left join lateral (select subscribers from competitor_snapshots x where x.channel_id=c.id order by x.captured_at desc limit 1) cs on true join video_snapshots vs on vs.video_id=v.id where ${where} order by vs.video_id,vs.captured_at desc), baselines as (select channel_id,greatest(percentile_cont(0.5) within group(order by views),1) as median_views from latest group by channel_id), scored as (select latest.*,baselines.median_views,extract(epoch from(now()-published_at))/3600 as age_hours from latest join baselines using(channel_id)) select id,youtube_video_id,channel_id,channel_title,title,thumbnail_url,published_at,duration_seconds,views,likes,comments,round((views/greatest(age_hours/24,0.25))::numeric,2)::float as views_per_day,round((views/greatest(age_hours,6))::numeric,2)::float as views_per_hour,round((views/nullif(channel_subscribers,0))::numeric,4)::float as views_per_subscriber,round((50+ln(greatest(views/median_views,0.25))/ln(2)*15)::numeric,1)::float as outlier_score from scored order by ${order} limit 300`, params),
  ]);
  return { channels, videos, sort, format, selectedChannel: input.channelId ?? null, query: input.query ?? '', minAgeDays: input.minAgeDays ?? '', maxAgeDays: input.maxAgeDays ?? '' };
}
