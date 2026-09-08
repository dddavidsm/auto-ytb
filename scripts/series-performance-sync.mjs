import { NodePostgresSqlClient } from '../packages/runtime-node/index.mjs';
import { decideSeriesContinuation } from '@auto-ytb/os';

const req=(name)=>{const value=process.env[name]?.trim();if(!value)throw new Error(`${name} is required`);return value;};
const arg=(name,fallback)=>process.argv.find((value)=>value.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
const minHours=Math.max(1,Number(arg('min-hours',process.env.SERIES_PERFORMANCE_MIN_HOURS||6)));
const db=new NodePostgresSqlClient(req('DATABASE_URL'),{ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined});
const n=(value)=>Number.isFinite(Number(value))?Number(value):0;

try{
  const series=(await db.query(`select s.id,s.series_key,s.title,s.lifecycle_state,s.automation_enabled,
      (select max(observed_at) from series_performance_snapshots x where x.series_id=s.id) as last_snapshot
    from series s where s.lifecycle_state in ('active','paused') order by s.updated_at desc`)).rows;
  const results=[];
  for(const item of series){
    if(item.last_snapshot&&Date.now()-new Date(item.last_snapshot).getTime()<minHours*3600000)continue;
    const rows=(await db.query(`select se.id as episode_id,se.episode_key,p.id as publication_id,p.content_format,
        a.views,a.watch_time_minutes::float,a.average_view_duration_seconds::float,a.average_view_percentage::float,a.shares,a.subscribers_gained,
        e.total_cost_usd::float,e.total_revenue_usd::float,e.profit_usd::float,e.roi::float,e.watch_minutes_per_dollar::float
      from series_episodes se join publications p on p.production_run_id=se.production_run_id
      left join lateral (select * from analytics_snapshots x where x.publication_id=p.id order by captured_at desc limit 1) a on true
      left join lateral (select * from video_economics x where x.production_run_id=se.production_run_id order by captured_at desc limit 1) e on true
      where se.series_id=$1 and p.state in ('public','scheduled','reviewed','private') and a.id is not null`,[item.id])).rows;
    if(!rows.length)continue;
    const byFormat=new Map();
    for(const row of rows){const key=String(row.content_format??'LONG_HORIZONTAL'),bucket=byFormat.get(key)??[];bucket.push(row);byFormat.set(key,bucket);}
    const decisions=[];
    for(const [format,items] of byFormat.entries()){
      const views=items.reduce((sum,row)=>sum+n(row.views),0),watch=items.reduce((sum,row)=>sum+n(row.watch_time_minutes),0),shares=items.reduce((sum,row)=>sum+n(row.shares),0),subs=items.reduce((sum,row)=>sum+n(row.subscribers_gained),0),cost=items.reduce((sum,row)=>sum+n(row.total_cost_usd),0),revenue=items.reduce((sum,row)=>sum+n(row.total_revenue_usd),0),profit=items.reduce((sum,row)=>sum+n(row.profit_usd),0);
      const weighted=(field)=>views>0?items.reduce((sum,row)=>sum+n(row[field])*Math.max(1,n(row.views)),0)/items.reduce((sum,row)=>sum+Math.max(1,n(row.views)),0):items.reduce((sum,row)=>sum+n(row[field]),0)/Math.max(1,items.length);
      const evidence={sampleSize:items.length,views,averageViewPercentage:weighted('average_view_percentage'),averageViewDurationSeconds:weighted('average_view_duration_seconds'),shareRate:views?shares/views*100:0,subscribersPerThousand:views?subs/views*1000:0,revenueUsd:revenue,costUsd:cost,profitUsd:profit,roi:cost?profit/cost:0,watchMinutesPerDollar:cost?watch/cost:0};
      const decision=decideSeriesContinuation(evidence);
      await db.query(`insert into series_performance_snapshots (series_id,content_format,sample_size,views,average_view_percentage,average_view_duration_seconds,share_rate,subscribers_per_thousand,revenue_usd,cost_usd,profit_usd,roi,watch_minutes_per_dollar,payload)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)`,[item.id,format,evidence.sampleSize,evidence.views,evidence.averageViewPercentage,evidence.averageViewDurationSeconds,evidence.shareRate,evidence.subscribersPerThousand,evidence.revenueUsd,evidence.costUsd,evidence.profitUsd,evidence.roi,evidence.watchMinutesPerDollar,JSON.stringify({decision})]);
      await db.query(`insert into series_strategy_decisions (series_id,decision,confidence,score,rationale,evidence) values ($1,$2,$3,$4,$5::jsonb,$6::jsonb)`,[item.id,decision.decision,decision.confidence,decision.score,JSON.stringify(decision.rationale),JSON.stringify({...evidence,contentFormat:format})]);
      decisions.push({format,...decision,evidence});
    }
    const strongest=decisions.sort((a,b)=>b.confidence-a.confidence||b.score-a.score)[0];
    if(strongest&&strongest.confidence>=0.55){
      if(strongest.decision==='SCALE')await db.query(`update series set performance_policy=performance_policy||$2::jsonb,updated_at=now() where id=$1`,[item.id,JSON.stringify({recommendedAction:'SCALE',lastDecisionAt:new Date().toISOString(),score:strongest.score,confidence:strongest.confidence})]);
      else if(strongest.decision==='PAUSE')await db.query(`update series set lifecycle_state='paused',performance_policy=performance_policy||$2::jsonb,updated_at=now() where id=$1`,[item.id,JSON.stringify({recommendedAction:'PAUSE',lastDecisionAt:new Date().toISOString(),score:strongest.score,confidence:strongest.confidence,autoPaused:true})]);
      else await db.query(`update series set performance_policy=performance_policy||$2::jsonb,updated_at=now() where id=$1`,[item.id,JSON.stringify({recommendedAction:strongest.decision,lastDecisionAt:new Date().toISOString(),score:strongest.score,confidence:strongest.confidence})]);
    }
    results.push({seriesId:item.id,seriesKey:item.series_key,decisions:decisions.map(({format,decision,score,confidence})=>({format,decision,score,confidence}))});
  }
  console.log(JSON.stringify({processed:results.length,results},null,2));
} finally {await db.close();}
