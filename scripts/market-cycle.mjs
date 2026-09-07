import { readFile } from 'node:fs/promises';
import { calculateOpportunityScore, clusterTopics } from '@auto-ytb/core';
import { YouTubeClient } from '@auto-ytb/youtube';
import { NodePostgresSqlClient } from '../packages/runtime-node/index.mjs';

const req=(name)=>{const value=process.env[name]?.trim();if(!value)throw new Error(`${name} is required`);return value;};
const num=(name,fallback)=>{const value=Number(process.env[name]??fallback);if(!Number.isFinite(value))throw new Error(`${name} must be numeric`);return value;};
const clamp=(value,min=0,max=100)=>Math.max(min,Math.min(max,value));
const median=(values)=>{const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);if(!sorted.length)return 0;const middle=Math.floor(sorted.length/2);return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;};
const durationSeconds=(iso)=>{const match=/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso||'');return match?(Number(match[1]||0)*3600+Number(match[2]||0)*60+Number(match[3]||0)):null;};
const niche=process.env.PRIMARY_CHANNEL_KEY||'future-tech-business';
const maxQueries=Math.max(1,Math.min(12,Math.floor(num('MARKET_CYCLE_MAX_QUERIES',5))));
const recentDays=Math.max(1,Math.min(30,Math.floor(num('MARKET_CYCLE_RECENT_DAYS',7))));
const maxResults=Math.max(10,Math.min(50,Math.floor(num('MARKET_CYCLE_RESULTS_PER_QUERY',35))));
const minClusterSize=Math.max(2,Math.floor(num('MARKET_CYCLE_MIN_CLUSTER_SIZE',2)));
const clusterThreshold=clamp(num('MARKET_CYCLE_CLUSTER_THRESHOLD',45),20,90);
const db=new NodePostgresSqlClient(req('DATABASE_URL'),{ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined});
const client=new YouTubeClient(req('YOUTUBE_API_KEY'));
const seeds=JSON.parse(await readFile(`${process.cwd()}/config/niche-seeds.json`,'utf8'));
const priors=JSON.parse(await readFile(`${process.cwd()}/config/niche-priors.json`,'utf8'));
const prior=priors.find((item)=>item.id===niche);
if(!prior) throw new Error(`No niche prior for ${niche}`);
const queries=(seeds[niche]??[]).slice(0,maxQueries);
if(!queries.length) throw new Error(`No niche seed queries for ${niche}`);

try{
  const discovered=new Map();
  const publishedAfter=new Date(Date.now()-recentDays*86_400_000);
  for(const query of queries){
    const search=await client.searchVideos({query,regionCode:process.env.YOUTUBE_REGION??'US',relevanceLanguage:process.env.YOUTUBE_RELEVANCE_LANGUAGE??'en',publishedAfter,maxResults,order:'viewCount'});
    const enriched=await client.enrichVideos(search);
    for(const video of enriched){
      const current=discovered.get(video.id);
      if(!current||video.viewCount>current.viewCount) discovered.set(video.id,{...video,seedQueries:[...(current?.seedQueries??[]),query]});
    }
  }
  const videos=[...discovered.values()];
  const now=Date.now();
  const metrics=videos.map((video)=>{
    const ageHours=Math.max(1,(now-new Date(video.publishedAt).getTime())/3_600_000);
    return {...video,ageHours,viewsPerHour:video.viewCount/ageHours};
  });
  const byId=new Map(metrics.map((video)=>[video.id,video]));
  const globalMedianVph=Math.max(1,median(metrics.map((video)=>video.viewsPerHour)));
  const clusters=clusterTopics(metrics.map((video)=>({id:video.id,text:video.title})),clusterThreshold).filter((cluster)=>cluster.documentIds.length>=minClusterSize);
  const persisted=[];

  for(const cluster of clusters.slice(0,20)){
    const clusterVideos=cluster.documentIds.map((id)=>byId.get(id)).filter(Boolean);
    if(!clusterVideos.length) continue;
    const clusterVph=clusterVideos.map((video)=>video.viewsPerHour);
    const clusterMedianVph=Math.max(1,median(clusterVph));
    const maxVph=Math.max(...clusterVph);
    const totalViews=clusterVideos.reduce((sum,video)=>sum+video.viewCount,0);
    const uniqueChannels=new Set(clusterVideos.map((video)=>video.channelId)).size;
    const medianAge=median(clusterVideos.map((video)=>video.ageHours));
    const demand=clamp(Math.log10(totalViews+1)*17);
    const trendVelocity=clamp(50+Math.log2(clusterMedianVph/globalMedianVph)*18);
    const outlierStrength=clamp(30+Math.log2(Math.max(1,maxVph/globalMedianVph))*20);
    const competitionGap=clamp(78-uniqueChannels*5+demand*0.22);
    const breadthConfidence=clamp(28+uniqueChannels*7+clusterVideos.length*3,28,72);
    const signals={
      trendVelocity,
      demand,
      outlierStrength,
      competitionGap,
      retentionPotential:prior.signals.storytellingPotential,
      monetizationPotential:prior.signals.monetizationPotential,
      evergreenPotential:prior.signals.evergreenDepth,
      freshness:clamp(100-medianAge*1.3),
      channelFit:clamp((prior.signals.audienceBreadth+prior.signals.differentiationPotential)/2),
      productionFeasibility:clamp((prior.signals.automationFit+prior.signals.assetAvailability)/2),
      multiFormatPotential:prior.signals.packagingPotential,
      crossSourceConfidence:breadthConfidence,
    };
    const risks={
      copyrightRisk:prior.risks.copyrightRisk,
      policyRisk:prior.risks.policyRisk,
      factualRisk:prior.risks.expertiseRisk,
      saturationRisk:clamp((prior.risks.saturationRisk+Math.min(100,uniqueChannels*8))/2),
      productionCostRisk:prior.risks.productionCostRisk,
    };
    const score=calculateOpportunityScore(signals,risks);
    const status=score.decision==='PRODUCE'?'candidate':score.decision==='RESEARCH'?'research':score.decision==='WATCH'?'watch':'rejected';
    const representative=[...clusterVideos].sort((a,b)=>b.viewsPerHour-a.viewsPerHour)[0];
    const canonical=cluster.terms.slice(0,7).join(' ')||cluster.label.slice(0,120);
    const topicResult=await db.query(`insert into topics (canonical_name,niche,language) values ($1,$2,$3) on conflict (canonical_name) do update set niche=excluded.niche,language=excluded.language returning id`,[canonical,niche,process.env.YOUTUBE_RELEVANCE_LANGUAGE??'en']);
    const topicId=topicResult.rows[0].id;

    for(const video of clusterVideos){
      const channelResult=await db.query(`insert into channels (youtube_channel_id,title,niche,is_competitor) values ($1,$2,$3,true) on conflict (youtube_channel_id) do update set title=excluded.title,niche=excluded.niche,is_competitor=true,updated_at=now() returning id`,[video.channelId,video.channelTitle,niche]);
      const videoResult=await db.query(`insert into videos (youtube_video_id,channel_id,title,published_at,duration_seconds,language,topic_cluster) values ($1,$2,$3,$4,$5,$6,$7) on conflict (youtube_video_id) do update set channel_id=excluded.channel_id,title=excluded.title,published_at=excluded.published_at,duration_seconds=excluded.duration_seconds,topic_cluster=excluded.topic_cluster,updated_at=now() returning id`,[video.id,channelResult.rows[0].id,video.title,video.publishedAt,durationSeconds(video.duration),process.env.YOUTUBE_RELEVANCE_LANGUAGE??'en',canonical]);
      await db.query(`insert into video_snapshots (video_id,captured_at,views,likes,comments,views_per_hour) values ($1,now(),$2,$3,$4,$5)`,[videoResult.rows[0].id,video.viewCount,video.likeCount,video.commentCount,Math.round(video.viewsPerHour*10)/10]);
    }
    await db.query(`insert into trend_signals (topic_id,source,value,velocity,payload) values ($1,'youtube_market_cycle',$2,$3,$4::jsonb)`,[topicId,demand,trendVelocity,JSON.stringify({clusterSize:clusterVideos.length,uniqueChannels,totalViews,medianViewsPerHour:clusterMedianVph,maxViewsPerHour:maxVph,representativeVideoId:representative?.id,representativeTitle:representative?.title,queries})]);

    const existing=await db.query(`select id,status from opportunities where topic_id=$1 and detected_at>now()-interval '24 hours' order by detected_at desc limit 1`,[topicId]);
    const rationale=[`YouTube cluster: ${clusterVideos.length} videos across ${uniqueChannels} channels`,`Median ${Math.round(clusterMedianVph)} views/hour vs market median ${Math.round(globalMedianVph)}`,`Representative: ${representative?.title??cluster.label}`];
    let opportunityId;
    if(existing.rows[0]&&existing.rows[0].status!=='produced'){
      opportunityId=existing.rows[0].id;
      await db.query(`update opportunities set angle=$2,status=$3,score=$4,grade=$5,decision=$6,signals=$7::jsonb,risks=$8::jsonb,rationale=$9::jsonb,detected_at=now(),expires_at=now()+interval '72 hours' where id=$1`,[opportunityId,representative?.title??cluster.label,status,score.finalScore,score.grade,score.decision,JSON.stringify(signals),JSON.stringify({...risks,totalPenalty:score.riskPenalty}),JSON.stringify(rationale)]);
    } else {
      const inserted=await db.query(`insert into opportunities (topic_id,angle,status,score,grade,decision,signals,risks,rationale,expires_at) values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,now()+interval '72 hours') returning id`,[topicId,representative?.title??cluster.label,status,score.finalScore,score.grade,score.decision,JSON.stringify(signals),JSON.stringify({...risks,totalPenalty:score.riskPenalty}),JSON.stringify(rationale)]);
      opportunityId=inserted.rows[0].id;
    }
    persisted.push({opportunityId,topic:canonical,angle:representative?.title??cluster.label,score:score.finalScore,grade:score.grade,decision:score.decision,clusterSize:clusterVideos.length,uniqueChannels,medianViewsPerHour:Math.round(clusterMedianVph)});
  }
  persisted.sort((a,b)=>b.score-a.score);
  console.log(JSON.stringify({niche,queries,videosAnalyzed:videos.length,clusters:clusters.length,searchBudget:client.searchBudget.snapshot(),opportunities:persisted.slice(0,20)},null,2));
} finally {await db.close();}
