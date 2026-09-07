import { GoogleOAuthTokenProvider, YouTubeAnalyticsClient } from '@auto-ytb/youtube';
import { AnalyticsRepository } from '@auto-ytb/persistence';
import { deriveLearningSignals } from '@auto-ytb/analytics';
import { NodePostgresSqlClient } from '../packages/runtime-node/index.mjs';

const req = (name) => { const v=process.env[name]?.trim(); if(!v) throw new Error(`${name} is required`); return v; };
const num = (name,fallback) => { const v=Number(process.env[name] ?? fallback); return Number.isFinite(v)?v:fallback; };
const daysArg = process.argv.find((arg)=>arg.startsWith('--days='));
const days = Math.max(1, Math.min(90, Number(daysArg?.slice(7) || 28)));
const db = new NodePostgresSqlClient(req('DATABASE_URL'), { ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized:false } : undefined });
const oauth = new GoogleOAuthTokenProvider({clientId:req('YOUTUBE_CLIENT_ID'),clientSecret:req('YOUTUBE_CLIENT_SECRET'),refreshToken:req('YOUTUBE_REFRESH_TOKEN')});
const yt = new YouTubeAnalyticsClient(oauth);
const repo = new AnalyticsRepository(db);
const end = new Date();
const start = new Date(end.getTime()-days*86400000);
const iso = (d)=>d.toISOString().slice(0,10);
const shortPromoteViews=num('SHORT_TO_LONG_MIN_VIEWS',5000);
const shortPromoteAvp=num('SHORT_TO_LONG_MIN_AVP',70);
const longPromoteViews=num('LONG_TO_SHORT_MIN_VIEWS',3000);
const longPromoteAvp=num('LONG_TO_SHORT_MIN_AVP',50);

async function maybePromoteCrossFormat(pub,perf,learning,outcomeScore){
  if(!pub.opportunity_id || !pub.topic_id) return null;
  const format=pub.content_format ?? pub.metadata?.contentFormat ?? 'LONG_HORIZONTAL';
  let target=null;
  let reason=null;
  if(format==='SHORT_VERTICAL' && perf.views>=shortPromoteViews && perf.averageViewPercentage>=shortPromoteAvp && (learning.shareRate>=0.5 || learning.subscriberConversionPerThousand>=3)){
    target='LONG_HORIZONTAL';
    reason='Short breakout demonstrated enough demand and retention to justify a deeper long-form expansion.';
  } else if(format==='LONG_HORIZONTAL' && perf.views>=longPromoteViews && perf.averageViewPercentage>=longPromoteAvp && (learning.strongHook || learning.shareRate>=0.5)){
    target='SHORT_VERTICAL';
    reason='Long-form performance demonstrated a strong hook/payoff suitable for a native Shorts derivative.';
  }
  if(!target) return null;
  const exists=await db.query(`select id from opportunities where signals->>'promotedFromPublicationId'=$1 and recommended_format=$2 limit 1`,[String(pub.id),target]);
  if(exists.rows[0]) return exists.rows[0].id;
  const score=Math.max(82,Math.min(100,Number(pub.opportunity_score ?? 82)+Math.min(8,Math.max(0,(outcomeScore-60)/5))));
  const signals={...(pub.opportunity_signals ?? {}),promotedFromPublicationId:String(pub.id),promotedFromVideoId:String(pub.youtube_video_id),promotedFromFormat:format,targetFormat:target,promotionOutcomeScore:outcomeScore,sourcePerformance:{views:perf.views,averageViewPercentage:perf.averageViewPercentage,shareRate:learning.shareRate,subscriberConversionPerThousand:learning.subscriberConversionPerThousand}};
  const inserted=await db.query(`insert into opportunities (topic_id,angle,status,score,grade,decision,signals,risks,rationale,detected_at,expires_at,recommended_format) values ($1,$2,'approved',$3,'A','PRODUCE',$4::jsonb,$5::jsonb,$6::jsonb,now(),now()+interval '14 days',$7) returning id`,[pub.topic_id,`${pub.opportunity_angle ?? 'Proven topic'} — ${target==='LONG_HORIZONTAL'?'deep-dive expansion':'native Shorts derivative'}`,score,JSON.stringify(signals),JSON.stringify(pub.opportunity_risks ?? {}),JSON.stringify([reason]),target]);
  return inserted.rows[0]?.id ?? null;
}

try {
  const publications = (await db.query(`
    select p.id,p.youtube_video_id,p.channel_id,p.production_run_id,p.metadata,p.content_format,
      coalesce(pr.total_cost_usd,0)::float as production_cost_usd,
      ci.opportunity_id,o.topic_id,o.score::float as opportunity_score,o.angle as opportunity_angle,o.signals as opportunity_signals,o.risks as opportunity_risks
    from publications p
    left join production_runs pr on pr.id=p.production_run_id
    left join content_ideas ci on ci.id=pr.content_idea_id
    left join opportunities o on o.id=ci.opportunity_id
    where p.youtube_video_id is not null and p.state in ('private','reviewed','scheduled','public')
    order by p.updated_at desc`)).rows;
  for (const pub of publications) {
    const [performance, retention, traffic] = await Promise.all([
      yt.getVideoPerformance({videoId:pub.youtube_video_id,startDate:iso(start),endDate:iso(end)}),
      yt.getRetention({videoId:pub.youtube_video_id,startDate:iso(start),endDate:iso(end)}),
      yt.getTrafficSources({videoId:pub.youtube_video_id,startDate:iso(start),endDate:iso(end)}),
    ]);
    const row = performance.rows[0] || {};
    const points = retention.rows.map((r)=>({elapsedRatio:Number(r.elapsedVideoTimeRatio||0),audienceWatchRatio:Number(r.audienceWatchRatio||0)}));
    const trafficSources = Object.fromEntries(traffic.rows.map((r)=>[String(r.insightTrafficSourceType),{views:Number(r.views||0),watchTimeMinutes:Number(r.estimatedMinutesWatched||0)}]));
    const perf = {videoId:pub.youtube_video_id,views:Number(row.views||0),watchTimeMinutes:Number(row.estimatedMinutesWatched||0),averageViewDurationSec:Number(row.averageViewDuration||0),averageViewPercentage:Number(row.averageViewPercentage||0),likes:Number(row.likes||0),comments:Number(row.comments||0),shares:Number(row.shares||0),subscribersGained:Number(row.subscribersGained||0),revenueUsd:Number(row.estimatedRevenue||0),productionCostUsd:Number(pub.production_cost_usd||0),retention:points};
    await repo.addSnapshot({publicationId:pub.id,views:perf.views,watchTimeMinutes:perf.watchTimeMinutes,averageViewDurationSeconds:perf.averageViewDurationSec,averageViewPercentage:perf.averageViewPercentage,likes:perf.likes,comments:perf.comments,shares:perf.shares,subscribersGained:perf.subscribersGained,revenueUsd:perf.revenueUsd,trafficSources,retention:points});
    const learning=deriveLearningSignals(perf);
    const contentFormat=pub.content_format ?? pub.metadata?.contentFormat ?? 'LONG_HORIZONTAL';
    for (const [featureKey, featureValue] of Object.entries(learning)) await repo.addLearningSignal({channelId:pub.channel_id,publicationId:pub.id,signalType:`video_performance:${contentFormat}`,featureKey,featureValue,strength:75});
    const strength=Math.min(100,Math.max(25,Math.round(35+Math.log10(Math.max(1,perf.views))*12)));
    const outcomeScore=Math.round(Math.max(0,Math.min(100,perf.averageViewPercentage*0.55+Math.min(100,learning.subscriberConversionPerThousand*12)*0.15+Math.min(100,learning.shareRate*20)*0.10+(learning.strongHook?100:35)*0.20))*10)/10;

    const selectedPackagingId=pub.metadata?.selectedPackagingId ? String(pub.metadata.selectedPackagingId) : null;
    if(selectedPackagingId){
      const variantResult=await db.query(`select pv.payload from packaging_variants pv join production_runs pr on pr.content_idea_id=pv.content_idea_id where pr.id=$1 and pv.variant_key=$2 limit 1`,[pub.production_run_id,selectedPackagingId]);
      const variant=variantResult.rows[0]?.payload ?? null;
      await repo.addLearningSignal({channelId:pub.channel_id,publicationId:pub.id,signalType:`packaging_performance:${contentFormat}`,featureKey:selectedPackagingId,featureValue:{contentFormat,views:perf.views,averageViewPercentage:perf.averageViewPercentage,subscribersGained:perf.subscribersGained,shares:perf.shares,revenueUsd:perf.revenueUsd,productionCostUsd:perf.productionCostUsd,economics:learning.economics,strongHook:learning.strongHook,outcomeScore},strength});
      if(variant){for(const attribute of ['curiosity','clarity','credibility','differentiation']){const attributeValue=Number(variant[attribute]);if(!Number.isFinite(attributeValue))continue;await repo.addLearningSignal({channelId:pub.channel_id,publicationId:pub.id,signalType:'packaging_attribute_performance',featureKey:attribute,featureValue:{contentFormat,attributeValue,outcomeScore,variantKey:selectedPackagingId},strength});}}
      await db.query(`update model_experiments set outcome=coalesce(outcome,'{}'::jsonb) || $2::jsonb, completed_at=case when $3::int >= 500 then now() else completed_at end where experiment_type='packaging_bandit' and outcome->>'productionRunId'=$1`,[String(pub.production_run_id),JSON.stringify({status:perf.views>=500?'completed':'observing',contentFormat,publicationId:pub.id,youtubeVideoId:pub.youtube_video_id,views:perf.views,outcomeScore,averageViewPercentage:perf.averageViewPercentage,strongHook:learning.strongHook,shareRate:learning.shareRate,subscriberConversionPerThousand:learning.subscriberConversionPerThousand,economics:learning.economics,capturedAt:new Date().toISOString()}),perf.views]);
    }

    const structural=pub.metadata?.structuralExperiment ?? null;
    if(structural?.selected?.axis && structural?.selected?.arm){
      const axis=String(structural.selected.axis), arm=String(structural.selected.arm);
      await repo.addLearningSignal({channelId:pub.channel_id,publicationId:pub.id,signalType:'structural_experiment_performance',featureKey:`${contentFormat}:${axis}:${arm}`,featureValue:{contentFormat,axis,arm,mode:structural.mode,views:perf.views,outcomeScore,averageViewPercentage:perf.averageViewPercentage,averageViewDurationSec:perf.averageViewDurationSec,strongHook:learning.strongHook,shareRate:learning.shareRate,subscriberConversionPerThousand:learning.subscriberConversionPerThousand,economics:learning.economics,productionCostUsd:perf.productionCostUsd},strength});
      await db.query(`update model_experiments set outcome=coalesce(outcome,'{}'::jsonb) || $2::jsonb, completed_at=case when $3::int >= 500 then now() else completed_at end where experiment_type='structural_bandit' and outcome->>'productionRunId'=$1`,[String(pub.production_run_id),JSON.stringify({status:perf.views>=500?'completed':'observing',contentFormat,publicationId:pub.id,youtubeVideoId:pub.youtube_video_id,axis,arm,mode:structural.mode,views:perf.views,outcomeScore,averageViewPercentage:perf.averageViewPercentage,strongHook:learning.strongHook,shareRate:learning.shareRate,subscriberConversionPerThousand:learning.subscriberConversionPerThousand,economics:learning.economics,productionCostUsd:perf.productionCostUsd,capturedAt:new Date().toISOString()}),perf.views]);
    }
    const promotedOpportunityId=await maybePromoteCrossFormat(pub,perf,learning,outcomeScore);
    console.log(`${pub.youtube_video_id} [${contentFormat}]: ${perf.views} views, ${perf.averageViewPercentage.toFixed(1)}% avg viewed, $${perf.revenueUsd.toFixed(2)} revenue${promotedOpportunityId?`, promoted=${promotedOpportunityId}`:''}`);
  }

  await db.query(`
    insert into format_performance_snapshots (channel_id,content_format,publication_count,views,average_view_percentage,average_view_duration_seconds,share_rate,subscribers_per_thousand,revenue_usd,production_cost_usd,roi,payload)
    select p.channel_id,coalesce(p.content_format,'LONG_HORIZONTAL'),count(*)::int,sum(a.views)::bigint,avg(a.average_view_percentage),avg(a.average_view_duration_seconds),
      case when sum(a.views)>0 then sum(coalesce(a.shares,0))::numeric/sum(a.views)*100 else 0 end,
      case when sum(a.views)>0 then sum(coalesce(a.subscribers_gained,0))::numeric/sum(a.views)*1000 else 0 end,
      sum(coalesce(a.revenue_usd,0)),sum(coalesce(pr.total_cost_usd,0)),
      case when sum(coalesce(pr.total_cost_usd,0))>0 then (sum(coalesce(a.revenue_usd,0))-sum(coalesce(pr.total_cost_usd,0)))/sum(coalesce(pr.total_cost_usd,0)) else null end,
      jsonb_build_object('windowDays',$1::int)
    from publications p
    join production_runs pr on pr.id=p.production_run_id
    join lateral (select distinct on (publication_id) * from analytics_snapshots x where x.publication_id=p.id order by publication_id,captured_at desc) a on true
    where p.created_at>=now()-($1::text || ' days')::interval
    group by p.channel_id,coalesce(p.content_format,'LONG_HORIZONTAL')`,[String(days)]);
} finally { await db.close(); }
