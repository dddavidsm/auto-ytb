import { NodePostgresSqlClient } from '../packages/runtime-node/index.mjs';

const req=(name)=>{const value=process.env[name]?.trim();if(!value)throw new Error(`${name} is required`);return value;};
const db=new NodePostgresSqlClient(req('DATABASE_URL'),{ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined});

function n(value){const x=Number(value??0);return Number.isFinite(x)?x:0;}
function round(value){return Math.round(value*10000)/10000;}

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
    const assets=(await db.query(`select scene_id,provider,asset_type,cost_usd::float from production_assets where production_run_id=$1`,[run.production_run_id])).rows;
    let image=0,video=0,thumbnail=0,voice=0,render=0,storage=0,otherKnown=0;
    for(const asset of assets){
      const cost=n(asset.cost_usd);
      if(String(asset.scene_id??'').startsWith('thumbnail:'))thumbnail+=cost;
      else if(String(asset.asset_type??'').startsWith('audio/'))voice+=cost;
      else if(String(asset.asset_type??'').startsWith('video/'))video+=cost;
      else if(String(asset.asset_type??'').startsWith('image/'))image+=cost;
      else otherKnown+=cost;
    }
    const runTotal=n(run.run_total_cost);
    const classified=image+video+thumbnail+voice+render+storage+otherKnown;
    const other=Math.max(otherKnown,runTotal-(image+video+thumbnail+voice+render+storage));
    const totalCost=Math.max(runTotal,image+video+thumbnail+voice+render+storage+other);
    const youtubeRevenue=n(run.revenue_usd);
    const affiliate=n(run.affiliate_revenue_usd),sponsor=n(run.sponsor_revenue_usd),externalOther=n(run.other_revenue_usd);
    const totalRevenue=youtubeRevenue+affiliate+sponsor+externalOther;
    const profit=totalRevenue-totalCost;
    const roi=totalCost>0?profit/totalCost:null;
    const views=n(run.views),watch=n(run.watch_time_minutes);
    const rpm=views>0?totalRevenue/views*1000:null;
    const watchPerDollar=totalCost>0?watch/totalCost:null;
    await db.query(`insert into video_economics (production_run_id,publication_id,image_cost_usd,video_cost_usd,voice_cost_usd,render_cost_usd,storage_cost_usd,thumbnail_cost_usd,other_cost_usd,estimated_revenue_usd,youtube_revenue_usd,affiliate_revenue_usd,sponsor_revenue_usd,other_revenue_usd,total_revenue_usd,profit_usd,roi,revenue_per_1000_views_usd,watch_minutes_per_dollar,metadata) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb)`,[run.production_run_id,run.publication_id??null,round(image),round(video),round(voice),round(render),round(storage),round(thumbnail),round(other),round(youtubeRevenue),round(affiliate),round(sponsor),round(externalOther),round(totalRevenue),round(profit),roi==null?null:round(roi),rpm==null?null:round(rpm),watchPerDollar==null?null:round(watchPerDollar),JSON.stringify({youtubeVideoId:run.youtube_video_id??null,views,watchTimeMinutes:watch,revenueStatus:run.publication_id?(run.revenue_usd==null?'pending':'reported-estimate'):'not-published',classifiedAssetCostUsd:round(classified),runTotalCostUsd:round(runTotal)})]);
    console.log(JSON.stringify({productionRunId:run.production_run_id,youtubeVideoId:run.youtube_video_id??null,totalCostUsd:round(totalCost),youtubeRevenueUsd:round(youtubeRevenue),totalRevenueUsd:round(totalRevenue),profitUsd:round(profit),roi:roi==null?null:round(roi),watchMinutesPerDollar:watchPerDollar==null?null:round(watchPerDollar)}));
  }
} finally {await db.close();}
