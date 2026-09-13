import 'server-only';
import { query } from './db';

const SORTS = new Set(['views', 'views_day', 'outlier', 'date']);

export async function loadReferenceLab(input: { sort?: string; format?: string; channelId?: string }) {
  const sort = SORTS.has(input.sort ?? '') ? input.sort! : 'outlier';
  const format = input.format === 'SHORTS' ? 'SHORTS' : input.format === 'LONG_FORM' ? 'LONG_FORM' : 'ALL';
  const formatFilter = format === 'SHORTS' ? 'and v.duration_seconds is not null and v.duration_seconds <= 180' : format === 'LONG_FORM' ? 'and (v.duration_seconds is null or v.duration_seconds > 180)' : '';
  const channelFilter = input.channelId ? 'and c.id=$1' : '';
  const params = input.channelId ? [input.channelId] : [];
  const order = sort === 'views' ? 'views desc' : sort === 'views_day' ? 'views_per_day desc' : sort === 'date' ? 'v.published_at desc' : 'outlier_score desc';
  const [channels, videos] = await Promise.all([
    query(`select c.id,c.youtube_channel_id,c.handle,c.title,c.description,c.niche,c.language,c.country,coalesce(cs.subscribers,0)::bigint as subscribers,coalesce(cs.total_views,0)::bigint as total_views,coalesce(cs.video_count,0)::bigint as total_videos,coalesce(cs.strongest_outlier,0)::float as strongest_outlier from channels c left join lateral (select * from competitor_snapshots x where x.channel_id=c.id order by x.captured_at desc limit 1) cs on true where c.is_competitor=true order by coalesce(cs.strongest_outlier,0) desc,c.title asc limit 100`),
    query(`with latest as (select distinct on (vs.video_id) v.id,v.youtube_video_id,v.channel_id,v.title,v.thumbnail_url,v.published_at,v.duration_seconds,vs.views,vs.likes,vs.comments,vs.captured_at from videos v join channels c on c.id=v.channel_id join video_snapshots vs on vs.video_id=v.id where c.is_competitor=true ${formatFilter} ${channelFilter} order by vs.video_id,vs.captured_at desc), baselines as (select channel_id,greatest(percentile_cont(0.5) within group(order by views),1) as median_views from latest group by channel_id), scored as (select latest.*,baselines.median_views,extract(epoch from(now()-published_at))/3600 as age_hours from latest join baselines using(channel_id)) select id,youtube_video_id,channel_id,title,thumbnail_url,published_at,duration_seconds,views,likes,comments,round((views/greatest(age_hours/24,0.25))::numeric,2)::float as views_per_day,round((50+ln(greatest(views/median_views,0.25))/ln(2)*15)::numeric,1)::float as outlier_score,round((views/greatest(age_hours,6))::numeric,2)::float as views_per_hour from scored order by ${order} limit 300`, params),
  ]);
  return { channels, videos, sort, format, selectedChannel: input.channelId ?? null };
}
