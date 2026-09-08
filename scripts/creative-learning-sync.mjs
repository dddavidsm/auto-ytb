import { GoogleOAuthTokenProvider, YouTubeAnalyticsClient } from '@auto-ytb/youtube';
import { alignRetentionToCreativeSegments, featureSignalsFromObservations } from '@auto-ytb/analytics';
import { NodePostgresSqlClient } from '../packages/runtime-node/index.mjs';

const arg=(name)=>process.argv.find((value)=>value.startsWith(`--${name}=`))?.slice(name.length+3);
const req=(name)=>{const value=process.env[name]?.trim();if(!value)throw new Error(`${name} is required`);return value;};
const channelId=arg('channel-id');if(!channelId)throw new Error('Use --channel-id=<uuid>');
const days=Math.max(7,Math.min(365,Number(arg('days')??180)));
const maxVideos=Math.max(1,Math.min(100,Number(process.env.CREATIVE_ANALYTICS_MAX_VIDEOS??25)));
const db=new NodePostgresSqlClient(req('DATABASE_URL'),{ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined});
const oauth=new GoogleOAuthTokenProvider({clientId:req('YOUTUBE_CLIENT_ID'),clientSecret:req('YOUTUBE_CLIENT_SECRET'),refreshToken:req('YOUTUBE_REFRESH_TOKEN')});
const yt=new YouTubeAnalyticsClient(oauth);
const end=new Date(),start=new Date(end.getTime()-Math.min(days,90)*86400000),iso=(date)=>date.toISOString().slice(0,10);
const round=(value,digits=4)=>{const p=10**digits;return Math.round(Number(value||0)*p)/p;};
const bucket=(value,cuts,labels)=>{const n=Number(value||0);for(let i=0;i<cuts.length;i+=1)if(n<cuts[i])return labels[i];return labels.at(-1);};

function videoFeatures(fingerprint){
  const selected=fingerprint.selectedPackaging??{};
  const dominant=Object.entries(fingerprint.visualMix??{}).sort((a,b)=>Number(b[1])-Number(a[1]))[0]?.[0]??'none';
  return{
    hookRetentionDevice:String(fingerprint.hookRetentionDevice??'none'),
    narrativeArchetype:String(fingerprint.narrativeArchetype??'unknown'),
    dominantVisualKind:dominant,
    visualChangeRate:bucket(fingerprint.visualChangesPerMinute,[4,7,11,18],['<4','4-7','7-11','11-18','18+']),
    averageSceneDuration:bucket(fingerprint.averageSceneSeconds,[5,8,12,18],['<5s','5-8s','8-12s','12-18s','18s+']),
    attentionScore:bucket(fingerprint.attentionScore??0,[80,86,90,94],['<80','80-85','86-89','90-93','94+']),
    packagingCuriosity:bucket(selected.curiosity??0,[70,80,90],['<70','70-79','80-89','90+']),
    packagingClarity:bucket(selected.clarity??0,[70,80,90],['<70','70-79','80-89','90+']),
    packagingCredibility:bucket(selected.credibility??0,[70,80,90],['<70','70-79','80-89','90+']),
    packagingDifferentiation:bucket(selected.differentiation??0,[70,80,90],['<70','70-79','80-89','90+']),
  };
}
function rowMetrics(row){
  const views=Number(row.views||0),shares=Number(row.shares||0),subs=Number(row.subscribers_gained||0),cost=Number(row.total_cost_usd||0),revenue=Number(row.total_revenue_usd??row.revenue_usd??0);
  return{views,avp:Number(row.average_view_percentage||0),shareRate:views?shares/views*100:0,subsPerThousand:views?subs/views*1000:0,roi:cost?(revenue-cost)/cost:0};
}
function addGroup(map,key,sample){const current=map.get(key)??{featureName:sample.featureName,featureValue:sample.featureValue,contentFormat:sample.contentFormat,publications:new Set(),weightedViews:0,retentionDelta:[],segmentRetention:[],avp:[],shareRate:[],subs:[],roi:[]};current.publications.add(sample.publicationId);current.weightedViews+=sample.metrics.views;if(sample.retentionDelta!=null)current.retentionDelta.push(sample.retentionDelta);if(sample.averageRetention!=null)current.segmentRetention.push(sample.averageRetention);current.avp.push(sample.metrics.avp);current.shareRate.push(sample.metrics.shareRate);current.subs.push(sample.metrics.subsPerThousand);current.roi.push(sample.metrics.roi);map.set(key,current);}
const avg=(values)=>values.length?values.reduce((a,b)=>a+Number(b||0),0)/values.length:null;

async function contextRows(pub){
  const input={videoId:pub.youtube_video_id,startDate:iso(start),endDate:iso(end)};
  const specs=[['traffic',()=>yt.getTrafficSources(input),'insightTrafficSourceType'],['device',()=>yt.getDeviceTypes(input),'deviceType'],['subscribed',()=>yt.getSubscriberStatus(input),'subscribedStatus'],['country',()=>yt.getCountries(input),'country'],['playback',()=>yt.getPlaybackLocations(input),'insightPlaybackLocationType']];
  const out=[];
  for(const [type,call,dimension] of specs){try{const table=await call();for(const row of table.rows)out.push({type,value:String(row[dimension]??'UNKNOWN'),views:Number(row.views||0),watchTimeMinutes:Number(row.estimatedMinutesWatched||0),payload:row});}catch(error){out.push({type:`${type}:unavailable`,value:'API_UNAVAILABLE',views:0,watchTimeMinutes:0,payload:{error:error instanceof Error?error.message:String(error)}});}}
  return out;
}

try{
  const publications=(await db.query(`
    select p.id,p.youtube_video_id,p.production_run_id,p.content_format,cf.fingerprint,
      a.id as analytics_snapshot_id,a.views,a.average_view_percentage,a.shares,a.subscribers_gained,a.revenue_usd,
      ve.total_cost_usd,ve.total_revenue_usd
    from publications p
    join creative_fingerprints cf on cf.production_run_id=p.production_run_id
    join lateral (select * from analytics_snapshots ax where ax.publication_id=p.id order by captured_at desc limit 1) a on true
    left join lateral (select * from video_economics vx where vx.production_run_id=p.production_run_id order by captured_at desc limit 1) ve on true
    where p.channel_id=$1 and p.youtube_video_id is not null and p.created_at>=now()-($2::text||' days')::interval
    order by a.views desc,p.updated_at desc limit $3`,[channelId,String(days),maxVideos])).rows;
  const groups=new Map();let segmentRows=0,contextCount=0;
  for(const pub of publications){
    const retention=(await db.query(`select elapsed_ratio::float,audience_watch_ratio::float from retention_points where analytics_snapshot_id=$1 order by elapsed_ratio`,[pub.analytics_snapshot_id])).rows.map((row)=>({elapsedRatio:Number(row.elapsed_ratio),audienceWatchRatio:Number(row.audience_watch_ratio)}));
    const fingerprint=pub.fingerprint;if(!fingerprint||!retention.length)continue;
    await db.query(`delete from creative_segment_observations where analytics_snapshot_id=$1`,[pub.analytics_snapshot_id]);
    const observations=alignRetentionToCreativeSegments(fingerprint,retention);const metrics=rowMetrics(pub);
    for(const observation of observations){
      await db.query(`insert into creative_segment_observations (analytics_snapshot_id,production_run_id,publication_id,channel_id,segment_type,segment_key,start_seconds,end_seconds,start_ratio,end_ratio,start_retention,end_retention,average_retention,retention_delta,local_dips,local_spikes,features) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb)`,[pub.analytics_snapshot_id,pub.production_run_id,pub.id,channelId,observation.segmentType,observation.segmentKey,observation.startSeconds,observation.endSeconds,observation.startRatio,observation.endRatio,observation.startRetention,observation.endRetention,observation.averageRetention,observation.retentionDelta,observation.localDips,observation.localSpikes,JSON.stringify(observation.features)]);
      segmentRows+=1;
    }
    for(const signal of featureSignalsFromObservations(observations))addGroup(groups,`${pub.content_format}|segment:${signal.segmentType}:${signal.featureName}|${signal.featureValue}`,{featureName:`segment:${signal.segmentType}:${signal.featureName}`,featureValue:signal.featureValue,contentFormat:pub.content_format,publicationId:pub.id,metrics,retentionDelta:signal.retentionDelta,averageRetention:signal.averageRetention});
    for(const [featureName,featureValue] of Object.entries(videoFeatures(fingerprint)))addGroup(groups,`${pub.content_format}|video:${featureName}|${featureValue}`,{featureName:`video:${featureName}`,featureValue:String(featureValue),contentFormat:pub.content_format,publicationId:pub.id,metrics,retentionDelta:null,averageRetention:null});
    await db.query(`delete from audience_context_snapshots where analytics_snapshot_id=$1`,[pub.analytics_snapshot_id]);
    for(const ctx of await contextRows(pub)){await db.query(`insert into audience_context_snapshots (publication_id,analytics_snapshot_id,context_type,context_value,views,watch_time_minutes,payload) values ($1,$2,$3,$4,$5,$6,$7::jsonb)`,[pub.id,pub.analytics_snapshot_id,ctx.type,ctx.value,ctx.views,ctx.watchTimeMinutes,JSON.stringify(ctx.payload)]);contextCount+=1;}
  }
  for(const group of groups.values()){
    const sampleSize=group.publications.size,totalViews=group.weightedViews;const confidence=Math.min(1,sampleSize/12)*Math.min(1,Math.log10(totalViews+1)/4);
    const payload={sampleSize,totalViews,confidence,guardrail:sampleSize<3?'OBSERVE':confidence<0.45?'LOW_CONFIDENCE':'USABLE'};
    await db.query(`insert into creative_feature_snapshots (channel_id,content_format,feature_name,feature_value,sample_size,weighted_views,average_retention_delta,average_segment_retention,average_video_avp,average_share_rate,average_subscribers_per_thousand,average_roi,confidence,payload) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)`,[channelId,group.contentFormat,group.featureName,group.featureValue,sampleSize,totalViews,avg(group.retentionDelta),avg(group.segmentRetention),avg(group.avp),avg(group.shareRate),avg(group.subs),avg(group.roi),confidence,JSON.stringify(payload)]);
    await db.query(`insert into learning_signals (channel_id,publication_id,signal_type,feature_key,feature_value,strength,observed_at) values ($1,null,'creative_feature_performance',$2,$3::jsonb,$4,now())`,[channelId,`${group.contentFormat}:${group.featureName}:${group.featureValue}`,JSON.stringify({contentFormat:group.contentFormat,featureName:group.featureName,featureValue:group.featureValue,sampleSize,totalViews,averageRetentionDelta:avg(group.retentionDelta),averageSegmentRetention:avg(group.segmentRetention),averageVideoAvp:avg(group.avp),averageShareRate:avg(group.shareRate),averageSubscribersPerThousand:avg(group.subs),averageRoi:avg(group.roi),confidence}),Math.round(confidence*100)]);
  }
  console.log(JSON.stringify({channelId,windowDays:days,videos:publications.length,segmentObservations:segmentRows,audienceContexts:contextCount,featureGroups:groups.size},null,2));
}finally{await db.close();}
