import { NodePostgresSqlClient } from '../packages/runtime-node/index.mjs';

const req=(name)=>{const value=process.env[name]?.trim();if(!value)throw new Error(`${name} is required`);return value;};
const db=new NodePostgresSqlClient(req('DATABASE_URL'),{ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined});
const n=(value)=>{const x=Number(value??0);return Number.isFinite(x)?x:0;};
const round=(value)=>Math.round(Number(value||0)*10000)/10000;

function legacyAssetCosts(assets){
  let image=0,video=0,thumbnail=0,voice=0,render=0,storage=0,otherKnown=0;
  for(const asset of assets){
    const cost=n(asset.cost_usd);
    if(String(asset.scene_id??'').startsWith('thumbnail:'))thumbnail+=cost;
    else if(String(asset.asset_type??'').startsWith('audio/'))voice+=cost;
    else if(String(asset.asset_type??'').startsWith('video/'))video+=cost;
    else if(String(asset.asset_type??'').startsWith('image/'))image+=cost;
    else otherKnown+=cost;
  }
  return {research:0,llm:0,image,video,thumbnail,voice,render,storage,other:otherKnown};
}
function ledgerCosts(events,assets,runTotal){
  const totals={research:0,llm:0,image:0,video:0,thumbnail:0,voice:0,render:0,storage:0,other:0};
  const unknown=[];
  for(const event of events){
    const stage=Object.hasOwn(totals,event.stage)?event.stage:'other';
    if(event.cost_usd==null){unknown.push({provider:event.provider,model:event.model,operation:event.operation,stage:event.stage});continue;}
    totals[stage]+=n(event.cost_usd);
  }
  for(const asset of assets){
    if(['procedural-ffmpeg','source-backed-direct'].includes(String(asset.provider??'')))totals.other+=n(asset.cost_usd);
  }
  const operational=totals.voice+totals.image+totals.video+totals.thumbnail+totals.render+totals.storage+totals.other;
  const residual=Math.max(0,n(runTotal)-operational);
  totals.other+=residual;
  return {totals,unknown};
}

try{
  const runs=(await db.query(`
    select pr.id as production_run_id,pr.total_cost_usd::float as run_total_cost,p.id as publication_id,p.youtube_video_id,
      a.views,a.watch_time_minutes::float,a.revenue_usd::float,
      prev.affiliate_revenue_usd::float as affiliate_revenue_usd,prev.sponsor_revenue_usd::float as sponsor_revenue_usd,prev.other_revenue_usd::float as other_revenue_usd
    from production_runs pr
    left join publications p on p.production_run_id=pr.id
    left join lateral (select * from analytics_snapshots x where x.publication_id=p.id order by captured_at desc limit 1) a on true
    left join lateral (select affiliate_revenue_usd,sponsor_revenue_usd,other_revenue_usd from video_economics v where v.production_run_id=pr.id order by captured_at desc limit 1) prev on true
    where pr.state in ('READY_FOR_REVIEW','private','reviewed','scheduled','public') or p.id is not null
    order by pr.created_at desc`)).rows;

  for(const run of runs){
    const [assetsResult,costResult]=await Promise.all([
      db.query(`select scene_id,provider,asset_type,cost_usd::float from production_assets where production_run_id=$1`,[run.production_run_id]),
      db.query(`select stage,provider,model,operation,cost_usd::float,estimated,pricing_source from provider_cost_events where production_run_id=$1 order by created_at,id`,[run.production_run_id]),
    ]);
    const assets=assetsResult.rows,events=costResult.rows;
    const source=events.length?ledgerCosts(events,assets,run.run_total_cost):{totals:legacyAssetCosts(assets),unknown:[]};
    const costs=source.totals;
    const totalCost=Object.values(costs).reduce((sum,value)=>sum+n(value),0);
    const youtubeRevenue=n(run.revenue_usd);
    const affiliate=n(run.affiliate_revenue_usd),sponsor=n(run.sponsor_revenue_usd),externalOther=n(run.other_revenue_usd);
    const totalRevenue=youtubeRevenue+affiliate+sponsor+externalOther;
    const profit=totalRevenue-totalCost;
    const roi=totalCost>0?profit/totalCost:null;
    const views=n(run.views),watch=n(run.watch_time_minutes);
    const rpm=views>0?totalRevenue/views*1000:null;
    const watchPerDollar=totalCost>0?watch/totalCost:null;
    await db.query(`insert into video_economics (production_run_id,publication_id,research_cost_usd,llm_cost_usd,image_cost_usd,video_cost_usd,voice_cost_usd,render_cost_usd,storage_cost_usd,thumbnail_cost_usd,other_cost_usd,estimated_revenue_usd,youtube_revenue_usd,affiliate_revenue_usd,sponsor_revenue_usd,other_revenue_usd,total_revenue_usd,profit_usd,roi,revenue_per_1000_views_usd,watch_minutes_per_dollar,metadata) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21::jsonb)`,[
      run.production_run_id,run.publication_id??null,round(costs.research),round(costs.llm),round(costs.image),round(costs.video),round(costs.voice),round(costs.render),round(costs.storage),round(costs.thumbnail),round(costs.other),round(youtubeRevenue),round(affiliate),round(sponsor),round(externalOther),round(totalRevenue),round(profit),roi==null?null:round(roi),rpm==null?null:round(rpm),watchPerDollar==null?null:round(watchPerDollar),
      JSON.stringify({youtubeVideoId:run.youtube_video_id??null,views,watchTimeMinutes:watch,revenueStatus:run.publication_id?(run.revenue_usd==null?'pending':'reported-estimate'):'not-published',costSource:events.length?'provider-ledger':'legacy-assets',providerCostEvents:events.length,unpricedProviderEvents:source.unknown,runTotalCostUsd:round(n(run.run_total_cost))}),
    ]);
    await db.query(`update production_runs set total_cost_usd=$2,metadata=metadata||$3::jsonb,updated_at=now() where id=$1`,[run.production_run_id,round(totalCost),JSON.stringify({economics:{costSource:events.length?'provider-ledger':'legacy-assets',totalCostUsd:round(totalCost),reconciledAt:new Date().toISOString(),unpricedProviderEvents:source.unknown.length}})]);
    console.log(JSON.stringify({productionRunId:run.production_run_id,youtubeVideoId:run.youtube_video_id??null,costSource:events.length?'provider-ledger':'legacy-assets',costs:Object.fromEntries(Object.entries(costs).map(([key,value])=>[key,round(value)])),totalCostUsd:round(totalCost),youtubeRevenueUsd:round(youtubeRevenue),totalRevenueUsd:round(totalRevenue),profitUsd:round(profit),roi:roi==null?null:round(roi),watchMinutesPerDollar:watchPerDollar==null?null:round(watchPerDollar),unpricedProviderEvents:source.unknown.length}));
  }
} finally {await db.close();}
