export async function loadDashboardData(db){
  const [jobs,budget,channels,economics,library,rights,recentRuns]=await Promise.all([
    db.query(`select state,count(*)::int as count from jobs group by state`),
    db.query(`select channel_key,spend_date,reserved_usd::float,actual_usd::float,jobs_scheduled from daily_budget_ledger order by spend_date desc,channel_key limit 20`),
    db.query(`select id,channel_key,youtube_channel_id,title,language,country,niche,identity,voice_profile,autonomy_policy,library_policy,brand_assets from channels where is_owned=true order by created_at asc`),
    db.query(`
      select ve.production_run_id,ve.publication_id,ve.captured_at,
        ve.research_cost_usd::float,ve.llm_cost_usd::float,ve.voice_cost_usd::float,ve.image_cost_usd::float,ve.video_cost_usd::float,
        ve.render_cost_usd::float,ve.storage_cost_usd::float,ve.thumbnail_cost_usd::float,ve.other_cost_usd::float,ve.total_cost_usd::float,
        ve.estimated_revenue_usd::float,ve.youtube_revenue_usd::float,ve.affiliate_revenue_usd::float,ve.sponsor_revenue_usd::float,ve.total_revenue_usd::float,
        ve.profit_usd::float,ve.roi::float,ve.revenue_per_1000_views_usd::float,ve.watch_minutes_per_dollar::float,
        ci.working_title,p.youtube_video_id,p.state,p.content_format,c.channel_key
      from video_economics ve
      join production_runs pr on pr.id=ve.production_run_id
      left join content_ideas ci on ci.id=pr.content_idea_id
      left join publications p on p.id=ve.publication_id
      left join channels c on c.id=p.channel_id
      order by ve.captured_at desc limit 40`),
    db.query(`select channel_key,stage,count(*)::int as items,coalesce(sum(bytes),0)::bigint as bytes from content_library_items group by channel_key,stage order by channel_key,stage`),
    db.query(`select pa.id,pa.production_run_id,pa.scene_id,pa.source_url,pa.license,pa.metadata,ci.working_title,p.youtube_video_id,p.state as publication_state from production_assets pa left join production_runs pr on pr.id=pa.production_run_id left join content_ideas ci on ci.id=pr.content_idea_id left join publications p on p.production_run_id=pr.id where pa.provider='source-backed-direct' and (pa.license is null or pa.license='verify-before-public') order by pa.created_at asc limit 30`),
    db.query(`select pr.id,pr.state,pr.total_cost_usd::float,pr.metadata,pr.created_at,pr.updated_at,ci.working_title from production_runs pr left join content_ideas ci on ci.id=pr.content_idea_id order by pr.created_at desc limit 20`),
  ]);
  return {
    jobs:Object.fromEntries(jobs.rows.map((row)=>[row.state,Number(row.count)])),
    budget:budget.rows,
    channels:channels.rows,
    economics:economics.rows,
    library:library.rows,
    rightsReview:rights.rows,
    recentRuns:recentRuns.rows,
  };
}

export function summarizePortfolio(data){
  const latestByRun=new Map();
  for(const row of data.economics??[])if(!latestByRun.has(row.production_run_id))latestByRun.set(row.production_run_id,row);
  const videos=[...latestByRun.values()];
  const totalCost=videos.reduce((sum,row)=>sum+Number(row.total_cost_usd??0),0);
  const totalRevenue=videos.reduce((sum,row)=>sum+Number(row.total_revenue_usd??row.youtube_revenue_usd??0),0);
  const profit=totalRevenue-totalCost;
  return {videos:videos.length,totalCostUsd:Math.round(totalCost*100)/100,totalRevenueUsd:Math.round(totalRevenue*100)/100,profitUsd:Math.round(profit*100)/100,roi:totalCost>0?Math.round((profit/totalCost)*1000)/1000:null};
}
