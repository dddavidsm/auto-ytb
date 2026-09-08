export async function loadDashboardData(db){
  const [jobs,budget,channels,candidates,economics,library,rights,recentRuns,brandAssets,routing]=await Promise.all([
    db.query(`select state,count(*)::int as count from jobs group by state`),
    db.query(`select channel_key,spend_date,reserved_usd::float,actual_usd::float,jobs_scheduled from daily_budget_ledger order by spend_date desc,channel_key limit 30`),
    db.query(`select id,channel_key,youtube_channel_id,title,language,country,niche,identity,voice_profile,autonomy_policy,library_policy,brand_assets,lifecycle_state,credentials_ref,config_path,automation_enabled,last_routed_at from channels where is_owned=true order by created_at asc`),
    db.query(`select id,candidate_key,language,proposed_name,proposed_positioning,character_mode,character_name,style_fingerprint,proposed_identity,brand_plan,route_score::float,opportunity_score::float,status,youtube_channel_id,promoted_channel_id,created_at,updated_at from channel_candidates where status not in ('connected','rejected') order by opportunity_score desc,created_at desc limit 30`),
    db.query(`
      select ve.production_run_id,ve.publication_id,ve.captured_at,
        ve.research_cost_usd::float,ve.llm_cost_usd::float,ve.voice_cost_usd::float,ve.image_cost_usd::float,ve.video_cost_usd::float,
        ve.render_cost_usd::float,ve.storage_cost_usd::float,ve.thumbnail_cost_usd::float,ve.other_cost_usd::float,ve.total_cost_usd::float,
        ve.estimated_revenue_usd::float,ve.youtube_revenue_usd::float,ve.affiliate_revenue_usd::float,ve.sponsor_revenue_usd::float,ve.other_revenue_usd::float,ve.total_revenue_usd::float,
        ve.profit_usd::float,ve.roi::float,ve.revenue_per_1000_views_usd::float,ve.watch_minutes_per_dollar::float,
        ci.working_title,p.youtube_video_id,p.state,p.content_format,c.channel_key,c.id as channel_id
      from video_economics ve
      join production_runs pr on pr.id=ve.production_run_id
      left join content_ideas ci on ci.id=pr.content_idea_id
      left join publications p on p.id=ve.publication_id
      left join channels c on c.id=p.channel_id
      order by ve.captured_at desc limit 120`),
    db.query(`select channel_key,stage,count(*)::int as items,coalesce(sum(bytes),0)::bigint as bytes from content_library_items group by channel_key,stage order by channel_key,stage`),
    db.query(`select pa.id,pa.production_run_id,pa.scene_id,pa.source_url,pa.license,pa.metadata,ci.working_title,p.youtube_video_id,p.state as publication_state from production_assets pa left join production_runs pr on pr.id=pa.production_run_id left join content_ideas ci on ci.id=pr.content_idea_id left join publications p on p.production_run_id=pr.id where pa.provider='source-backed-direct' and (pa.license is null or pa.license='verify-before-public') order by pa.created_at asc limit 30`),
    db.query(`select pr.id,pr.state,pr.total_cost_usd::float,pr.metadata,pr.created_at,pr.updated_at,ci.working_title,o.score::float as opportunity_score from production_runs pr left join content_ideas ci on ci.id=pr.content_idea_id left join opportunities o on o.id=ci.opportunity_id order by pr.created_at desc limit 30`),
    db.query(`select channel_id,asset_type,count(*)::int as count,max(version)::int as latest_version from channel_brand_assets where active=true group by channel_id,asset_type order by channel_id,asset_type`),
    db.query(`select crd.opportunity_id,crd.channel_id,crd.channel_key,crd.route_score::float,crd.route_mode,crd.style_fingerprint,crd.rationale,crd.created_at,o.angle,o.score::float as opportunity_score from content_routing_decisions crd left join opportunities o on o.id=crd.opportunity_id order by crd.created_at desc limit 20`),
  ]);
  return {
    jobs:Object.fromEntries(jobs.rows.map((row)=>[row.state,Number(row.count)])),
    budget:budget.rows,
    channels:channels.rows,
    candidates:candidates.rows,
    economics:economics.rows,
    library:library.rows,
    rightsReview:rights.rows,
    recentRuns:recentRuns.rows,
    brandAssets:brandAssets.rows,
    routingDecisions:routing.rows,
  };
}

function round(value,digits=2){const p=10**digits;return Math.round(Number(value||0)*p)/p;}
function latestEconomicsRows(rows=[]){const latestByRun=new Map();for(const row of rows)if(!latestByRun.has(row.production_run_id))latestByRun.set(row.production_run_id,row);return [...latestByRun.values()];}

export function summarizePortfolio(data){
  const videos=latestEconomicsRows(data.economics);
  const totalCost=videos.reduce((sum,row)=>sum+Number(row.total_cost_usd??0),0);
  const totalRevenue=videos.reduce((sum,row)=>sum+Number(row.total_revenue_usd??row.youtube_revenue_usd??0),0);
  const profit=totalRevenue-totalCost;
  const watchMinutes=videos.reduce((sum,row)=>sum+(Number(row.watch_minutes_per_dollar??0)*Number(row.total_cost_usd??0)),0);
  const states=Object.fromEntries((data.channels??[]).map((channel)=>[channel.lifecycle_state,(Number(Object.values(Object.fromEntries((data.channels??[]).filter((c)=>c.lifecycle_state===channel.lifecycle_state).map((_,i)=>[i,1]))).reduce((a,b)=>a+b,0)))]));
  return {
    channels:(data.channels??[]).length,
    activeChannels:(data.channels??[]).filter((c)=>c.automation_enabled&&c.lifecycle_state==='ready').length,
    channelCandidates:(data.candidates??[]).length,
    videos:videos.length,
    totalCostUsd:round(totalCost),
    totalRevenueUsd:round(totalRevenue),
    profitUsd:round(profit),
    roi:totalCost>0?round(profit/totalCost,3):null,
    watchMinutesPerDollar:totalCost>0?round(watchMinutes/totalCost,1):null,
    unresolvedRights:(data.rightsReview??[]).length,
    queuedJobs:Number(data.jobs?.queued??0)+Number(data.jobs?.retry??0),
    runningJobs:Number(data.jobs?.running??0),
    deadJobs:Number(data.jobs?.dead??0),
    channelStates:states,
  };
}

export function summarizeChannels(data){
  const videos=latestEconomicsRows(data.economics);
  const libraryByChannel=new Map();
  for(const row of data.library??[]){const current=libraryByChannel.get(row.channel_key)??{items:0,bytes:0,stages:{}};current.items+=Number(row.items??0);current.bytes+=Number(row.bytes??0);current.stages[row.stage]=Number(row.items??0);libraryByChannel.set(row.channel_key,current);}
  const brandByChannel=new Map();
  for(const row of data.brandAssets??[]){const current=brandByChannel.get(row.channel_id)??{};current[row.asset_type]={count:Number(row.count??0),version:Number(row.latest_version??1)};brandByChannel.set(row.channel_id,current);}
  return (data.channels??[]).map((channel)=>{
    const channelVideos=videos.filter((row)=>row.channel_id===channel.id||row.channel_key===channel.channel_key);
    const cost=channelVideos.reduce((sum,row)=>sum+Number(row.total_cost_usd??0),0);
    const revenue=channelVideos.reduce((sum,row)=>sum+Number(row.total_revenue_usd??row.youtube_revenue_usd??0),0);
    const profit=revenue-cost;
    const watchMinutes=channelVideos.reduce((sum,row)=>sum+Number(row.watch_minutes_per_dollar??0)*Number(row.total_cost_usd??0),0);
    const latestBudget=(data.budget??[]).find((row)=>row.channel_key===channel.channel_key)??null;
    const assets=brandByChannel.get(channel.id)??{};
    const brandReady=['banner','profile','watermark'].filter((key)=>Boolean(assets[key])).length;
    return {
      id:channel.id,channelKey:channel.channel_key,title:channel.title,language:channel.language,lifecycleState:channel.lifecycle_state,
      youtubeChannelId:channel.youtube_channel_id,credentialsRef:channel.credentials_ref,automationEnabled:Boolean(channel.automation_enabled),
      autonomyMode:channel.autonomy_policy?.autonomyMode??'REVIEW_REQUIRED',characterMode:channel.identity?.characterMode??'none',characterName:channel.identity?.characterName??null,
      videos:channelVideos.length,costUsd:round(cost),revenueUsd:round(revenue),profitUsd:round(profit),roi:cost>0?round(profit/cost,3):null,
      watchMinutesPerDollar:cost>0?round(watchMinutes/cost,1):null,brandReady,brandAssets:assets,library:libraryByChannel.get(channel.channel_key)??{items:0,bytes:0,stages:{}},
      budget:latestBudget&&{date:latestBudget.spend_date,reservedUsd:Number(latestBudget.reserved_usd??0),actualUsd:Number(latestBudget.actual_usd??0),jobs:Number(latestBudget.jobs_scheduled??0)},
      lastRoutedAt:channel.last_routed_at,
    };
  });
}

export function recentVideoEconomics(data,limit=12){
  return latestEconomicsRows(data.economics).slice(0,limit).map((row)=>({
    productionRunId:row.production_run_id,title:row.working_title??row.youtube_video_id??'Untitled',channelKey:row.channel_key??'unassigned',contentFormat:row.content_format??'LONG_HORIZONTAL',state:row.state??'unpublished',
    costUsd:round(row.total_cost_usd),revenueUsd:round(row.total_revenue_usd??row.youtube_revenue_usd),profitUsd:round(Number(row.total_revenue_usd??row.youtube_revenue_usd??0)-Number(row.total_cost_usd??0)),roi:row.roi==null?(Number(row.total_cost_usd)>0?round((Number(row.total_revenue_usd??row.youtube_revenue_usd??0)-Number(row.total_cost_usd))/Number(row.total_cost_usd),3):null):Number(row.roi),
    rpm:row.revenue_per_1000_views_usd==null?null:Number(row.revenue_per_1000_views_usd),watchMinutesPerDollar:row.watch_minutes_per_dollar==null?null:Number(row.watch_minutes_per_dollar),youtubeVideoId:row.youtube_video_id,
  }));
}

export function buildPipelineStages(data){
  const jobs=data.jobs??{};
  const runs=data.recentRuns??[];
  const publications=latestEconomicsRows(data.economics).filter((row)=>row.publication_id);
  const hasMarket=(data.routingDecisions??[]).length>0||runs.length>0;
  const hasProduction=runs.length>0;
  const hasLibrary=(data.library??[]).length>0;
  const hasAnalytics=(data.economics??[]).some((row)=>row.youtube_revenue_usd!=null||row.watch_minutes_per_dollar!=null);
  const dead=Number(jobs.dead??0);
  const active=Number(jobs.running??0)>0||Number(jobs.queued??0)>0||Number(jobs.retry??0)>0;
  const stage=(id,label,state,detail)=>({id,label,state,detail});
  return [
    stage('market','Market intelligence',hasMarket?'ok':active?'active':'idle',hasMarket?'Signals observed':'Waiting for live market data'),
    stage('routing','Channel routing',(data.routingDecisions??[]).length?'ok':'idle',(data.routingDecisions??[]).length?`${data.routingDecisions.length} recent decisions`:'No routing decisions yet'),
    stage('research','Research + script',hasProduction?'ok':'idle',hasProduction?'Durable production history':'No production run yet'),
    stage('audio','Voice + alignment',hasProduction?'ok':'idle',hasProduction?'Timestamp-aware voice pipeline enabled':'Waiting for first production'),
    stage('visuals','Hybrid visuals + QA',hasProduction?'ok':'idle',hasProduction?'Rights-aware visual pipeline':'Waiting for first production'),
    stage('upload','Private upload',publications.length?'ok':'idle',publications.length?`${publications.length} publication records`:'No YouTube publication yet'),
    stage('library','Drive library',hasLibrary?'ok':'idle',hasLibrary?'Artifacts archived by channel':'No archived artifacts yet'),
    stage('analytics','Analytics + economics',hasAnalytics?'ok':'idle',hasAnalytics?'Revenue/retention learning active':'Awaiting real analytics'),
    stage('learning','Learning loop',hasAnalytics?'ok':'idle',hasAnalytics?'Metrics feed future ranking':'Awaiting enough owned-channel evidence'),
    stage('ops','Autonomous ops',dead?'warn':active?'active':'ok',dead?`${dead} dead-letter jobs`:active?'Jobs currently executing':'Queue healthy'),
  ];
}
