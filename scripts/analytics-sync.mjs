import { GoogleOAuthTokenProvider, YouTubeAnalyticsClient } from '@auto-ytb/youtube';
import { AnalyticsRepository } from '@auto-ytb/persistence';
import { deriveLearningSignals } from '@auto-ytb/analytics';
import { NodePostgresSqlClient } from '../packages/runtime-node/index.mjs';

const req = (name) => { const v=process.env[name]?.trim(); if(!v) throw new Error(`${name} is required`); return v; };
const daysArg = process.argv.find((arg)=>arg.startsWith('--days='));
const days = Math.max(1, Math.min(90, Number(daysArg?.slice(7) || 28)));
const db = new NodePostgresSqlClient(req('DATABASE_URL'), { ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized:false } : undefined });
const oauth = new GoogleOAuthTokenProvider({clientId:req('YOUTUBE_CLIENT_ID'),clientSecret:req('YOUTUBE_CLIENT_SECRET'),refreshToken:req('YOUTUBE_REFRESH_TOKEN')});
const yt = new YouTubeAnalyticsClient(oauth);
const repo = new AnalyticsRepository(db);
const end = new Date();
const start = new Date(end.getTime()-days*86400000);
const iso = (d)=>d.toISOString().slice(0,10);
try {
  const publications = (await db.query(`select p.id,p.youtube_video_id,p.channel_id,p.metadata,coalesce(pr.total_cost_usd,0)::float as production_cost_usd from publications p left join production_runs pr on pr.id=p.production_run_id where p.youtube_video_id is not null and p.state in ('private','reviewed','scheduled','public') order by p.updated_at desc`)).rows;
  for (const pub of publications) {
    const [performance, retention, traffic] = await Promise.all([
      yt.getVideoPerformance({videoId:pub.youtube_video_id,startDate:iso(start),endDate:iso(end)}),
      yt.getRetention({videoId:pub.youtube_video_id,startDate:iso(start),endDate:iso(end)}),
      yt.getTrafficSources({videoId:pub.youtube_video_id,startDate:iso(start),endDate:iso(end)}),
    ]);
    const row = performance.rows[0] || {};
    const points = retention.rows.map((r)=>({elapsedRatio:Number(r.elapsedVideoTimeRatio||0),audienceWatchRatio:Number(r.audienceWatchRatio||0)}));
    const trafficSources = Object.fromEntries(traffic.rows.map((r)=>[String(r.insightTrafficSourceType),{views:Number(r.views||0),watchTimeMinutes:Number(r.estimatedMinutesWatched||0)}]));
    const perf = {
      videoId:pub.youtube_video_id, views:Number(row.views||0), watchTimeMinutes:Number(row.estimatedMinutesWatched||0), averageViewDurationSec:Number(row.averageViewDuration||0), averageViewPercentage:Number(row.averageViewPercentage||0), likes:Number(row.likes||0), comments:Number(row.comments||0), shares:Number(row.shares||0), subscribersGained:Number(row.subscribersGained||0), revenueUsd:Number(row.estimatedRevenue||0), productionCostUsd:Number(pub.production_cost_usd||0), retention:points,
    };
    await repo.addSnapshot({publicationId:pub.id,views:perf.views,watchTimeMinutes:perf.watchTimeMinutes,averageViewDurationSeconds:perf.averageViewDurationSec,averageViewPercentage:perf.averageViewPercentage,likes:perf.likes,comments:perf.comments,shares:perf.shares,subscribersGained:perf.subscribersGained,revenueUsd:perf.revenueUsd,trafficSources,retention:points});
    const learning=deriveLearningSignals(perf);
    for (const [featureKey, featureValue] of Object.entries(learning)) await repo.addLearningSignal({channelId:pub.channel_id,publicationId:pub.id,signalType:'video_performance',featureKey,featureValue,strength:75});
    const selectedPackagingId=pub.metadata?.selectedPackagingId ? String(pub.metadata.selectedPackagingId) : null;
    if(selectedPackagingId){
      await repo.addLearningSignal({
        channelId:pub.channel_id,
        publicationId:pub.id,
        signalType:'packaging_performance',
        featureKey:selectedPackagingId,
        featureValue:{
          views:perf.views,
          averageViewPercentage:perf.averageViewPercentage,
          subscribersGained:perf.subscribersGained,
          shares:perf.shares,
          revenueUsd:perf.revenueUsd,
          productionCostUsd:perf.productionCostUsd,
          economics:learning.economics,
          strongHook:learning.strongHook,
        },
        strength:Math.min(100,Math.max(25,Math.round(35+Math.log10(Math.max(1,perf.views))*12))),
      });
    }
    console.log(`${pub.youtube_video_id}: ${perf.views} views, ${perf.averageViewPercentage.toFixed(1)}% avg viewed, $${perf.revenueUsd.toFixed(2)} revenue${selectedPackagingId?`, packaging=${selectedPackagingId}`:''}`);
  }
} finally { await db.close(); }
