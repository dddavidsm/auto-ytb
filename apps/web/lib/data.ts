import 'server-only';
import { query } from './db';

export type DashboardSnapshot={
  portfolio:{channels:number;candidates:number;cost:number;revenue:number;profit:number;roi:number|null;views:number;watchMinutes:number};
  channels:Array<Record<string,unknown>>;
  candidates:Array<Record<string,unknown>>;
  runs:Array<Record<string,unknown>>;
  jobs:Array<Record<string,unknown>>;
  creative:Array<Record<string,unknown>>;
  market:Array<Record<string,unknown>>;
  providers:Array<Record<string,unknown>>;
};
const n=(value:unknown)=>Number.isFinite(Number(value))?Number(value):0;

export async function loadDashboard():Promise<DashboardSnapshot>{
  const [channels,candidates,runs,jobs,creative,market,providers,totals]=await Promise.all([
    query(`select c.id,c.channel_key,c.title,c.language,c.niche,c.lifecycle_state,c.automation_enabled,c.youtube_channel_id,c.brand_assets,c.identity,
      coalesce(e.cost,0)::float as cost,coalesce(e.revenue,0)::float as revenue,coalesce(e.profit,0)::float as profit,
      case when coalesce(e.cost,0)>0 then e.profit/e.cost else null end::float as roi
      from channels c left join lateral (
        select sum(x.total_cost_usd)::float cost,sum(coalesce(x.total_revenue_usd,0))::float revenue,sum(coalesce(x.profit_usd,0))::float profit
        from (select distinct on (production_run_id) * from video_economics where production_run_id in (
          select pr.id from production_runs pr join content_ideas ci on ci.id=pr.content_idea_id join publications p on p.production_run_id=pr.id where p.channel_id=c.id
        ) order by production_run_id,captured_at desc) x
      ) e on true where c.is_owned=true order by coalesce(e.profit,0) desc,c.created_at asc`),
    query(`select id,candidate_key,language,proposed_name,proposed_positioning,character_mode,character_name,status,opportunity_score::float,route_score::float,brand_plan,created_at from channel_candidates where status not in ('rejected','connected') order by opportunity_score desc,created_at desc limit 24`),
    query(`select pr.id,pr.state,pr.total_cost_usd::float,pr.created_at,pr.updated_at,pr.metadata,ci.working_title,ci.format,o.score::float as opportunity_score,o.angle,
      p.id as publication_id,p.youtube_video_id,p.state as publication_state,p.publish_at,
      q.score::float as qa_score,q.passed as qa_passed,q.report as qa_report,
      e.total_revenue_usd::float,e.profit_usd::float,e.roi::float,e.watch_minutes_per_dollar::float
      from production_runs pr join content_ideas ci on ci.id=pr.content_idea_id left join opportunities o on o.id=ci.opportunity_id
      left join lateral (select * from publications x where x.production_run_id=pr.id order by x.updated_at desc limit 1) p on true
      left join lateral (select * from qa_reports x where x.production_run_id=pr.id order by x.created_at desc limit 1) q on true
      left join lateral (select * from video_economics x where x.production_run_id=pr.id order by x.captured_at desc limit 1) e on true
      order by pr.created_at desc limit 30`),
    query(`select state,count(*)::int as count from jobs group by state order by state`),
    query(`select distinct on (feature_name,feature_value) feature_name,feature_value,content_format,sample_size,weighted_views,average_retention_delta::float,average_video_avp::float,average_share_rate::float,average_roi::float,confidence::float,observed_at
      from creative_feature_snapshots where sample_size>=3 order by feature_name,feature_value,observed_at desc limit 80`),
    query(`select distinct on (feature_name,feature_value,content_format) niche,content_format,feature_name,feature_value,sample_size,unique_channels,weighted_views,average_views_per_hour::float,average_market_velocity_multiple::float,outlier_rate::float,confidence::float,observed_at
      from market_pattern_snapshots order by feature_name,feature_value,content_format,observed_at desc limit 80`),
    query(`select provider,coalesce(model,'unknown') model,count(*)::int events,sum(coalesce(cost_usd,0))::float spend,count(*) filter(where priced=false)::int unpriced from provider_cost_events group by provider,coalesce(model,'unknown') order by spend desc limit 20`),
    query(`with latest_econ as (select distinct on (production_run_id) * from video_economics order by production_run_id,captured_at desc), latest_analytics as (
      select distinct on (p.production_run_id) p.production_run_id,a.views,a.watch_time_minutes from publications p join analytics_snapshots a on a.publication_id=p.id order by p.production_run_id,a.captured_at desc
    ) select coalesce(sum(e.total_cost_usd),0)::float cost,coalesce(sum(e.total_revenue_usd),0)::float revenue,coalesce(sum(e.profit_usd),0)::float profit,coalesce(sum(a.views),0)::bigint views,coalesce(sum(a.watch_time_minutes),0)::float watch_minutes from latest_econ e left join latest_analytics a on a.production_run_id=e.production_run_id`),
  ]);
  const t=totals[0]??{} as Record<string,unknown>,cost=n(t.cost),profit=n(t.profit);
  return{portfolio:{channels:channels.length,candidates:candidates.length,cost,revenue:n(t.revenue),profit,roi:cost>0?profit/cost:null,views:n(t.views),watchMinutes:n(t.watch_minutes)},channels,candidates,runs,jobs,creative,market,providers};
}

export async function loadRun(id:string){
  const rows=await query(`select pr.id,pr.state,pr.total_cost_usd::float,pr.metadata,pr.created_at,pr.updated_at,ci.working_title,ci.premise,ci.format,o.angle,o.score::float as opportunity_score,
      s.script,r.dossier,q.report as qa_report,q.score::float as qa_score,q.passed as qa_passed,p.youtube_video_id,p.state as publication_state,p.publish_at,p.metadata as publication_metadata,
      e.total_cost_usd::float as economic_cost,e.total_revenue_usd::float,e.profit_usd::float,e.roi::float,e.watch_minutes_per_dollar::float
    from production_runs pr join content_ideas ci on ci.id=pr.content_idea_id left join opportunities o on o.id=ci.opportunity_id
    left join lateral (select * from scripts x where x.content_idea_id=ci.id order by version desc,created_at desc limit 1) s on true
    left join lateral (select * from research_dossiers x where x.id=s.research_dossier_id order by created_at desc limit 1) r on true
    left join lateral (select * from qa_reports x where x.production_run_id=pr.id order by created_at desc limit 1) q on true
    left join lateral (select * from publications x where x.production_run_id=pr.id order by updated_at desc limit 1) p on true
    left join lateral (select * from video_economics x where x.production_run_id=pr.id order by captured_at desc limit 1) e on true
    where pr.id=$1`,[id]);
  if(!rows[0])return null;
  const [assets,costs,analytics]=await Promise.all([
    query(`select id,scene_id,asset_type,uri,provider,model,generated,license,source_url,cost_usd::float,metadata from production_assets where production_run_id=$1 order by created_at`,[id]),
    query(`select stage,provider,coalesce(model,'unknown') model,sum(coalesce(cost_usd,0))::float cost,count(*)::int events,bool_and(priced) priced from provider_cost_events where production_run_id=$1 group by stage,provider,coalesce(model,'unknown') order by cost desc`,[id]),
    query(`select a.* from publications p join analytics_snapshots a on a.publication_id=p.id where p.production_run_id=$1 order by a.captured_at desc limit 1`,[id]),
  ]);
  return{...rows[0],assets,costs,analytics:analytics[0]??null};
}
