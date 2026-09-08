import { NodePostgresSqlClient } from '../packages/runtime-node/index.mjs';
import { reviewKidsFamilyQuality } from '@auto-ytb/qa/kids';

const req=(name)=>{const value=process.env[name]?.trim();if(!value)throw new Error(`${name} is required`);return value;};
const limit=Math.max(1,Math.min(30,Number(process.env.SERIES_KIDS_QUALITY_SYNC_LIMIT||8)));
const db=new NodePostgresSqlClient(req('DATABASE_URL'),{ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined});

try{
  const rows=(await db.query(`select se.id as episode_id,se.series_id,se.production_run_id,se.episode_key,se.continuity_status,
      s.title as series_title,s.target_age_min,s.target_age_max,b.bible,ci.id as content_idea_id,sc.script
    from series_episodes se
    join series s on s.id=se.series_id and s.audience_mode='MADE_FOR_KIDS'
    join series_bibles b on b.id=se.bible_version_id
    join production_runs pr on pr.id=se.production_run_id
    join content_ideas ci on ci.id=pr.content_idea_id
    join lateral (select script from scripts x where x.content_idea_id=ci.id order by version desc,created_at desc limit 1) sc on true
    left join series_episode_quality_reports qr on qr.episode_id=se.id and qr.report_type='kids_family'
    where se.production_run_id is not null and qr.id is null
    order by se.created_at asc limit $1`,[limit])).rows;
  const results=[];
  for(const row of rows){
    const packaging=(await db.query(`select variant_key as id,title,thumbnail_concept as "thumbnailConcept",payload->>'thumbnailText' as "thumbnailText",coalesce(payload->>'promise','') as promise,
      coalesce((payload->>'curiosity')::numeric,score)::float as curiosity,coalesce((payload->>'clarity')::numeric,score)::float as clarity,
      coalesce((payload->>'credibility')::numeric,score)::float as credibility,coalesce((payload->>'differentiation')::numeric,score)::float as differentiation,score::float
      from packaging_variants where content_idea_id=$1 order by score desc`,[row.content_idea_id])).rows;
    const audience=row.bible?.audience??{};
    const review=reviewKidsFamilyQuality({script:row.script,packaging,audience:{mode:'MADE_FOR_KIDS',targetAgeMin:row.target_age_min??audience.targetAgeMin??null,targetAgeMax:row.target_age_max??audience.targetAgeMax??null,vocabularyRules:audience.vocabularyRules??[],safetyRules:audience.safetyRules??[],emotionalRules:audience.emotionalRules??[]}});
    const status=!review.passed?'blocked':review.issues.length?'warn':'passed';
    await db.transaction(async(tx)=>{
      await tx.query(`insert into series_episode_quality_reports (series_id,episode_id,production_run_id,report_type,status,score,report)
        values ($1,$2,$3,'kids_family',$4,$5,$6::jsonb)
        on conflict (episode_id,report_type) do update set status=excluded.status,score=excluded.score,report=excluded.report,updated_at=now()`,[row.series_id,row.episode_id,row.production_run_id,status,review.score,JSON.stringify(review)]);
      const patch={kidsFamilyQuality:{status,score:review.score,issues:review.issues,metrics:review.metrics,evaluatedAt:new Date().toISOString()}};
      if(status==='blocked')await tx.query(`update series_episodes set continuity_status='blocked',continuity_snapshot=continuity_snapshot||$2::jsonb,updated_at=now() where id=$1`,[row.episode_id,JSON.stringify(patch)]);
      else await tx.query(`update series_episodes set continuity_snapshot=continuity_snapshot||$2::jsonb,updated_at=now() where id=$1`,[row.episode_id,JSON.stringify(patch)]);
    });
    results.push({episodeId:row.episode_id,episodeKey:row.episode_key,seriesTitle:row.series_title,status,score:review.score,issues:review.issues.map((issue)=>issue.code)});
  }
  console.log(JSON.stringify({processed:results.length,results},null,2));
} finally {await db.close();}
