import { NodePostgresSqlClient } from '../packages/runtime-node/index.mjs';

const req=(name)=>{const value=process.env[name]?.trim();if(!value)throw new Error(`${name} is required`);return value;};
const arg=(name,fallback)=>process.argv.find((value)=>value.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
const median=(values)=>{const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);if(!sorted.length)return 0;const m=Math.floor(sorted.length/2);return sorted.length%2?sorted[m]:(sorted[m-1]+sorted[m])/2;};
const bucket=(value,bounds,labels)=>{for(let i=0;i<bounds.length;i+=1)if(value<bounds[i])return labels[i];return labels[labels.length-1];};
const niche=String(arg('niche',process.env.PRIMARY_CHANNEL_KEY||'future-tech-business-en'));
const days=Math.max(1,Math.min(60,Number(arg('days',14))));
const db=new NodePostgresSqlClient(req('DATABASE_URL'),{ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined});

function titleStyle(title){const value=String(title||'').trim();if(/^why\b/i.test(value))return'why';if(/^how\b/i.test(value))return'how';if(/\?$/.test(value))return'question';if(/^\d+\b/.test(value))return'number-led';if(/\b(secret|truth|nobody|hidden|changed|collapse|race|war|failed|broke|impossible)\b/i.test(value))return'high-stakes-claim';return'direct-claim';}
function features(row,marketMedian,channelMedian){
  const duration=Math.max(0,Number(row.duration_seconds||0)),vph=Math.max(0,Number(row.views_per_hour||0)),views=Math.max(0,Number(row.views||0)),likes=Math.max(0,Number(row.likes||0)),comments=Math.max(0,Number(row.comments||0)),ageHours=Math.max(0,(Date.now()-new Date(row.published_at).getTime())/3_600_000);
  return{
    contentFormat:duration>0&&duration<=180?'SHORT_VERTICAL':'LONG_HORIZONTAL',
    durationBucket:bucket(duration,[60,180,480,900],['<60s','60-180s','3-8m','8-15m','15m+']),
    titleStyle:titleStyle(row.title),
    titleLengthBucket:bucket(String(row.title||'').length,[40,65,90],['<40','40-64','65-89','90+']),
    ageBucket:bucket(ageHours,[24,72,168,336],['<24h','1-3d','3-7d','1-2w','2w+']),
    vph,
    views,
    marketVelocityMultiple:marketMedian>0?vph/marketMedian:1,
    channelVelocityMultiple:channelMedian>0?vph/channelMedian:1,
    engagementProxy:views>0?(likes+comments)/views:0,
    punctuation:/[!?]/.test(String(row.title||''))?'punctuated':'plain',
    capsShare:(String(row.title||'').match(/[A-Z]/g)?.length||0)/Math.max(1,String(row.title||'').replace(/[^A-Za-z]/g,'').length),
  };
}

try{
  const rows=(await db.query(`select v.id as video_id,v.title,v.duration_seconds,v.published_at,c.youtube_channel_id,c.title as channel_title,vs.views,vs.likes,vs.comments,vs.views_per_hour
    from videos v join channels c on c.id=v.channel_id join lateral (
      select s.views,s.likes,s.comments,s.views_per_hour from video_snapshots s where s.video_id=v.id order by s.captured_at desc limit 1
    ) vs on true
    where c.is_competitor=true and c.niche=$1 and v.published_at>=now()-($2::text||' days')::interval`,[niche,String(days)])).rows;
  if(!rows.length){console.log(JSON.stringify({niche,days,videos:0,patterns:0},null,2));process.exit(0);}
  const marketMedian=Math.max(1,median(rows.map((row)=>Number(row.views_per_hour||0))));
  const channelMedians=new Map();
  for(const row of rows){const key=String(row.youtube_channel_id),list=channelMedians.get(key)??[];list.push(Number(row.views_per_hour||0));channelMedians.set(key,list);}
  for(const [key,list] of channelMedians)channelMedians.set(key,Math.max(1,median(list)));
  const enriched=[];
  for(const row of rows){const f=features(row,marketMedian,channelMedians.get(String(row.youtube_channel_id))||marketMedian);enriched.push({...row,...f});await db.query(`insert into market_video_features(video_id,niche,content_format,duration_bucket,title_style,title_length_bucket,age_bucket,views_per_hour,channel_velocity_multiple,market_velocity_multiple,engagement_proxy,features)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)`,[row.video_id,niche,f.contentFormat,f.durationBucket,f.titleStyle,f.titleLengthBucket,f.ageBucket,f.vph,f.channelVelocityMultiple,f.marketVelocityMultiple,f.engagementProxy,JSON.stringify({punctuation:f.punctuation,capsShare:f.capsShare,channelTitle:row.channel_title,title:row.title})]);}
  const dimensions=[['durationBucket','duration'],['titleStyle','title-style'],['titleLengthBucket','title-length'],['ageBucket','age'],['punctuation','punctuation']];
  const patterns=[];
  for(const format of ['LONG_HORIZONTAL','SHORT_VERTICAL'])for(const [field,name] of dimensions){const grouped=new Map();for(const row of enriched.filter((item)=>item.contentFormat===format)){const value=String(row[field]);const list=grouped.get(value)??[];list.push(row);grouped.set(value,list);}for(const [value,items] of grouped){const uniqueChannels=new Set(items.map((item)=>item.youtube_channel_id)).size,weightedViews=Math.round(items.reduce((sum,item)=>sum+item.views,0)),avgVph=items.reduce((sum,item)=>sum+item.vph,0)/items.length,medVph=median(items.map((item)=>item.vph)),avgMultiple=items.reduce((sum,item)=>sum+item.marketVelocityMultiple,0)/items.length,outlierRate=items.filter((item)=>item.marketVelocityMultiple>=2).length/items.length,avgEngagement=items.reduce((sum,item)=>sum+item.engagementProxy,0)/items.length,confidence=clamp((items.length/12)*0.55+(uniqueChannels/5)*0.45);await db.query(`insert into market_pattern_snapshots(niche,content_format,feature_name,feature_value,sample_size,unique_channels,weighted_views,average_views_per_hour,median_views_per_hour,average_market_velocity_multiple,outlier_rate,average_engagement_proxy,confidence,payload)
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)`,[niche,format,name,value,items.length,uniqueChannels,weightedViews,avgVph,medVph,avgMultiple,outlierRate,avgEngagement,confidence,JSON.stringify({marketMedianViewsPerHour:marketMedian})]);patterns.push({format,feature:name,value,sampleSize:items.length,uniqueChannels,averageVelocityMultiple:Math.round(avgMultiple*100)/100,outlierRate:Math.round(outlierRate*1000)/10,confidence:Math.round(confidence*100)/100});}}
  patterns.sort((a,b)=>(b.confidence*b.averageVelocityMultiple)-(a.confidence*a.averageVelocityMultiple));
  console.log(JSON.stringify({niche,days,videos:enriched.length,marketMedianViewsPerHour:Math.round(marketMedian),patterns:patterns.slice(0,30)},null,2));
}finally{await db.close();}
