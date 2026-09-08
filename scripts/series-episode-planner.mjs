import { NodePostgresSqlClient } from '../packages/runtime-node/index.mjs';

const req=(name)=>{const value=process.env[name]?.trim();if(!value)throw new Error(`${name} is required`);return value;};
const db=new NodePostgresSqlClient(req('DATABASE_URL'),{ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined});
const maxNew=Math.max(0,Math.min(12,Number(process.env.SERIES_EPISODE_PLANNER_MAX_NEW||3)));
const minConfidence=Math.max(0,Math.min(1,Number(process.env.SERIES_EPISODE_MIN_CONFIDENCE||0.45)));
const pilotEpisodes=Math.max(1,Math.min(8,Number(process.env.SERIES_PILOT_EPISODES||3)));
const safe=(value)=>String(value??'episode').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,72)||'episode';
const clamp=(v,min=0,max=100)=>Math.max(min,Math.min(max,Number(v||0)));

try{
  const rows=(await db.query(`select s.id,s.channel_id,s.series_key,s.title,s.language,s.audience_mode,s.target_age_min,s.target_age_max,s.identity,s.performance_policy,
      b.bible,
      d.decision,d.confidence::float,d.score::float,
      mc.next_episode_seeds,mc.summary as last_summary,se.episode_key as last_episode_key,
      (select count(*)::int from series_episodes ep where ep.series_id=s.id and ep.status not in ('failed','rejected')) as episode_count
    from series s join series_bibles b on b.series_id=s.id and b.status='active'
    left join lateral (select * from series_strategy_decisions x where x.series_id=s.id order by observed_at desc limit 1) d on true
    left join lateral (select x.*,e.episode_key from series_memory_compilations x join series_episodes e on e.id=x.episode_id where x.series_id=s.id and x.status='compiled' order by x.created_at desc limit 1) mc on true
    left join series_episodes se on se.id=mc.episode_id
    where s.lifecycle_state='active' and s.automation_enabled=true order by coalesce(d.score,50) desc,s.updated_at desc`)).rows;
  const created=[];
  for(const row of rows){
    if(created.length>=maxNew)break;
    const decision=String(row.decision??'LEARN'),confidence=Number(row.confidence??0),episodeCount=Number(row.episode_count??0);
    if(decision==='PAUSE'||decision==='REVIEW')continue;
    if(decision==='LEARN'&&episodeCount>=pilotEpisodes)continue;
    if(decision!=='LEARN'&&confidence<minConfidence)continue;
    const pending=(await db.query(`select 1 from opportunities o where o.signals->>'seriesId'=$1 and o.status in ('candidate','watch','research','approved') and upper(coalesce(o.decision,''))='PRODUCE' and not exists (select 1 from content_ideas ci join production_runs pr on pr.content_idea_id=ci.id where ci.opportunity_id=o.id and pr.state in ('READY_FOR_REVIEW','succeeded')) limit 1`,[String(row.id)])).rows[0];
    if(pending)continue;
    const seeds=Array.isArray(row.next_episode_seeds)?row.next_episode_seeds:[];
    if(!seeds.length)continue;
    const bible=row.bible??{},identity=row.identity??{},themes=Array.isArray(identity.themes)?identity.themes:(Array.isArray(bible.themes)?bible.themes:[]),styles=Array.isArray(identity.styleTags)?identity.styleTags:[],characters=Array.isArray(bible.characters)?bible.characters:[];
    for(const seed of seeds){
      if(created.length>=maxNew)break;
      const title=String(seed?.title??seed?.premise??'').trim(),premise=String(seed?.premise??title).trim();if(!title||!premise)continue;
      const seedKey=`${row.series_key}:${safe(title)}`;
      const exists=(await db.query(`select id from opportunities where signals->>'seriesSeedKey'=$1 and status not in ('rejected') limit 1`,[seedKey])).rows[0];if(exists)continue;
      const topicName=`${row.series_key} — ${title}`;
      const topic=(await db.query(`insert into topics (canonical_name,niche,language) values ($1,$2,$3) on conflict (canonical_name) do update set niche=excluded.niche,language=excluded.language returning id`,[topicName,`series:${row.series_key}`,row.language??'en'])).rows[0];
      const baseScore=decision==='SCALE'?Math.max(88,Number(row.score??88)):decision==='CONTINUE'?Math.max(84,Number(row.score??84)):82;
      const signals={seriesGenerated:true,seriesId:row.id,seriesKey:row.series_key,seriesSeedKey:seedKey,sourceEpisodeKey:row.last_episode_key??null,episodicPotential:100,seriesPotential:100,madeForKids:row.audience_mode==='MADE_FOR_KIDS',audienceMode:row.audience_mode,targetAgeMin:row.target_age_min,targetAgeMax:row.target_age_max,themes,styleTags:styles,characterMode:characters.length?'persistent-character':'none',characterName:characters[0]?.name??null,styleFingerprint:{language:row.language??'en',themes,styleTags:styles,characterMode:characters.length?'persistent-character':'none',characterName:characters[0]?.name??null},retentionPotential:clamp(55+Number(row.score??50)*0.35),evergreenPotential:72,multiFormatPotential:78,monetizationPotential:55,freshness:65,seed:{title,premise,usesOpenLoops:seed.usesOpenLoops??[]},previousEpisodeSummary:row.last_summary??null,pilotPhase:decision==='LEARN',episodeCountBeforePlan:episodeCount};
      const opportunity=(await db.query(`insert into opportunities (topic_id,angle,status,score,grade,decision,signals,risks,rationale,detected_at,expires_at)
        values ($1,$2,'approved',$3,$4,'PRODUCE',$5::jsonb,$6::jsonb,$7::jsonb,now(),now()+interval '21 days') returning id`,[topic.id,premise,Math.min(96,baseScore),baseScore>=90?'A+':'A',JSON.stringify(signals),JSON.stringify({copyrightRisk:5,policyRisk:row.audience_mode==='MADE_FOR_KIDS'?15:5,factualRisk:5,saturation:10,productionCost:20,totalPenalty:row.audience_mode==='MADE_FOR_KIDS'?18:8}),JSON.stringify([`Continuation seed from ${row.series_key}`,`Strategy ${decision} confidence ${(confidence*100).toFixed(0)}%`,decision==='LEARN'?`Pilot episode ${episodeCount+1}/${pilotEpisodes}`:'Strategy evidence supports continued production'])])).rows[0];
      created.push({seriesId:row.id,seriesKey:row.series_key,opportunityId:opportunity.id,title,decision,score:Math.min(96,baseScore),pilot:decision==='LEARN',episodeCountBeforePlan:episodeCount});
      break;
    }
  }
  console.log(JSON.stringify({created:created.length,pilotEpisodes,episodes:created},null,2));
} finally {await db.close();}
