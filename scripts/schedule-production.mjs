import { NodePostgresSqlClient } from '../packages/runtime-node/index.mjs';
import { calculateLearningBoost, rankProductionCandidates } from '@auto-ytb/os';
import { recommendContentFormat } from '@auto-ytb/core';

const req = (name) => { const v=process.env[name]?.trim(); if(!v) throw new Error(`${name} is required`); return v; };
const num = (name, fallback) => { const v=Number(process.env[name] ?? fallback); if(!Number.isFinite(v)) throw new Error(`${name} must be numeric`); return v; };
const channelKey = process.env.PRIMARY_CHANNEL_KEY || 'future-tech-business';
const minScore = num('AUTO_PRODUCTION_MIN_SCORE',82);
const maxPerDay = Math.max(0,Math.floor(num('AUTO_PRODUCTION_MAX_PER_DAY',1)));
const dailyBudget = Math.max(0,num('AUTO_PRODUCTION_DAILY_BUDGET_USD',25));
const longReserve = Math.max(0,num('AUTO_PRODUCTION_RESERVED_COST_USD',Math.min(dailyBudget,18)));
const shortReserve = Math.max(0,num('AUTO_SHORT_RESERVED_COST_USD',Math.min(dailyBudget,6)));
const maxAttempts = Math.max(1,Math.min(20,Math.floor(num('JOB_MAX_ATTEMPTS',4))));
const learningWindowDays = Math.max(14,Math.min(365,Math.floor(num('LEARNING_WINDOW_DAYS',120))));
const budgetDate = new Date().toISOString().slice(0,10);
const db = new NodePostgresSqlClient(req('DATABASE_URL'), { ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized:false } : undefined });
const clamp=(v)=>Math.max(0,Math.min(100,Number(v??0)));

function formatSignals(row){
  const s=row.signals ?? {};
  const explicit=s.formatSignals ?? {};
  const trend=clamp(s.trendVelocity ?? s.velocity ?? 50);
  const retention=clamp(s.retentionPotential ?? 60);
  const monetization=clamp(s.monetizationPotential ?? 55);
  const evergreen=clamp(s.evergreenPotential ?? 50);
  const freshness=clamp(s.freshness ?? 50);
  const multi=clamp(s.multiFormatPotential ?? 50);
  const outlier=clamp(s.outlierStrength ?? 50);
  return {
    narrativeDepth:clamp(explicit.narrativeDepth ?? Math.round((retention+evergreen)/2)),
    visualSnackability:clamp(explicit.visualSnackability ?? Math.round((trend+freshness+outlier)/3)),
    trendVelocity:clamp(explicit.trendVelocity ?? trend),
    searchIntentDepth:clamp(explicit.searchIntentDepth ?? s.demand ?? 55),
    repeatability:clamp(explicit.repeatability ?? multi),
    monetizationDepth:clamp(explicit.monetizationDepth ?? monetization),
    sponsorFit:clamp(explicit.sponsorFit ?? monetization),
    shortHookStrength:clamp(explicit.shortHookStrength ?? Math.round((trend+outlier+freshness)/3)),
    longRetentionPotential:clamp(explicit.longRetentionPotential ?? retention),
    mobileConsumptionFit:clamp(explicit.mobileConsumptionFit ?? Math.round((trend+freshness+60)/3)),
    tvConsumptionFit:clamp(explicit.tvConsumptionFit ?? Math.round((retention+evergreen+55)/3)),
    kidAudienceFit:clamp(explicit.kidAudienceFit ?? 0),
    episodicPotential:clamp(explicit.episodicPotential ?? multi),
    productionComplexity:clamp(explicit.productionComplexity ?? 50),
  };
}

function formatRisks(row){
  const risks=row.risks ?? {};
  return {
    madeForKidsRisk:clamp(risks.madeForKidsRisk ?? 0),
    copyrightRisk:clamp(risks.copyrightRisk ?? 0),
    policyRisk:clamp(risks.policyRisk ?? 0),
    lowEffortRisk:clamp(risks.lowEffortRisk ?? risks.inauthenticRisk ?? 0),
  };
}

function chooseConcreteFormat(recommendation){
  if(recommendation.primary==='LONG_HORIZONTAL') return 'LONG_HORIZONTAL';
  if(recommendation.primary==='SHORT_VERTICAL') return 'SHORT_VERTICAL';
  return recommendation.scores.LONG_HORIZONTAL >= recommendation.scores.SHORT_VERTICAL ? 'LONG_HORIZONTAL' : 'SHORT_VERTICAL';
}

try {
  await db.query(`insert into daily_budget_ledger (channel_key,spend_date) values ($1,$2::date) on conflict (channel_key,spend_date) do nothing`,[channelKey,budgetDate]);
  const ledgerResult=await db.query(`select reserved_usd::float,actual_usd::float,jobs_scheduled from daily_budget_ledger where channel_key=$1 and spend_date=$2::date`,[channelKey,budgetDate]);
  const ledger=ledgerResult.rows[0] ?? {reserved_usd:0,actual_usd:0,jobs_scheduled:0};
  let slots=Math.max(0,maxPerDay-Number(ledger.jobs_scheduled || 0));
  let budgetLeft=Math.max(0,dailyBudget-Number(ledger.reserved_usd || 0)-Number(ledger.actual_usd || 0));
  if(!slots || budgetLeft<Math.min(shortReserve,longReserve)){
    console.log(JSON.stringify({scheduled:0,reason:'daily capacity exhausted',channelKey,budgetDate,dailyBudget,budgetLeft,slots},null,2));
  } else {
    const [result, learningResult]=await Promise.all([
      db.query(`
        select o.id,o.topic_id,o.score::float,o.detected_at,o.expires_at,o.risks,o.signals,o.recommended_format,t.canonical_name,o.angle,o.status,o.decision
        from opportunities o
        left join topics t on t.id=o.topic_id
        where o.score >= $1
          and (o.expires_at is null or o.expires_at > now())
          and o.status not in ('rejected','produced')
          and (o.status='approved' or upper(coalesce(o.decision,''))='PRODUCE')
          and not exists (select 1 from jobs j where j.opportunity_id=o.id and j.kind='produce_opportunity' and j.state not in ('dead','cancelled'))
        order by o.score desc,o.detected_at desc
        limit 50`,[minScore]),
      db.query(`
        select o.topic_id,p.content_format,
          count(distinct ls.publication_id)::int as sample_size,
          avg(case when ls.feature_key='strongHook' then case when ls.feature_value #>> '{}'='true' then 1.0 else 0.0 end end)::float as strong_hook_rate,
          avg(case when ls.feature_key='averageViewPercentage' then nullif(ls.feature_value #>> '{}','')::numeric end)::float as average_view_percentage,
          avg(case when ls.feature_key='shareRate' then nullif(ls.feature_value #>> '{}','')::numeric end)::float as share_rate,
          avg(case when ls.feature_key='economics' then nullif(ls.feature_value->>'roi','')::numeric end)::float as roi
        from learning_signals ls
        join publications p on p.id=ls.publication_id
        join production_runs pr on pr.id=p.production_run_id
        join content_ideas ci on ci.id=pr.content_idea_id
        join opportunities o on o.id=ci.opportunity_id
        where o.topic_id is not null and ls.observed_at >= now()-($1::text || ' days')::interval
        group by o.topic_id,p.content_format`,[String(learningWindowDays)]),
    ]);
    const learningByTopicFormat=new Map(learningResult.rows.map((row)=>[`${row.topic_id}:${row.content_format ?? 'LONG_HORIZONTAL'}`,{
      sampleSize:Number(row.sample_size ?? 0),
      strongHookRate:row.strong_hook_rate==null?undefined:Number(row.strong_hook_rate),
      averageViewPercentage:row.average_view_percentage==null?undefined:Number(row.average_view_percentage),
      shareRate:row.share_rate==null?undefined:Number(row.share_rate),
      roi:row.roi==null?undefined:Number(row.roi),
    }]));

    const enriched=result.rows.map((row)=>{
      const recommendation=recommendContentFormat(formatSignals(row),formatRisks(row));
      const contentFormat=row.recommended_format && row.recommended_format!=='HYBRID' ? row.recommended_format : chooseConcreteFormat(recommendation);
      const learning=learningByTopicFormat.get(`${row.topic_id}:${contentFormat}`);
      const reserve=contentFormat==='SHORT_VERTICAL'?shortReserve:longReserve;
      return {row,recommendation,contentFormat,reserve,learningBoost:learning?calculateLearningBoost(learning):0};
    });
    const candidates=rankProductionCandidates(enriched.map((item)=>({id:item.row.id,score:Number(item.row.score),detectedAt:new Date(item.row.detected_at).toISOString(),expiresAt:item.row.expires_at?new Date(item.row.expires_at).toISOString():null,riskPenalty:Number(item.row.risks?.totalPenalty ?? item.row.risks?.riskPenalty ?? 0),expectedCostUsd:item.reserve,learningBoost:item.learningBoost})));
    const scheduled=[];
    for(const candidate of candidates){
      if(slots<=0) break;
      const item=enriched.find((x)=>x.row.id===candidate.id);
      if(!item) continue;
      if(item.reserve>budgetLeft) continue;
      const topic=item.row.canonical_name || item.row.angle;
      if(!topic) continue;
      const priority=Math.max(0,Math.min(100,Math.round(candidate.productionPriority)));
      const payload={topic,angle:item.row.angle,channelKey,budgetDate,score:Number(item.row.score),productionPriority:candidate.productionPriority,learningBoost:candidate.learningBoost,reservedCostUsd:item.reserve,contentFormat:item.contentFormat,formatRecommendation:item.recommendation,derivativeStrategy:item.recommendation.derivativeStrategy};
      const key=`produce-opportunity:${candidate.id}:${item.contentFormat}`;
      const insert=await db.query(`insert into jobs (job_key,kind,opportunity_id,state,priority,max_attempts,payload) values ($1,'produce_opportunity',$2,'queued',$3,$4,$5::jsonb) on conflict (job_key) do nothing returning id`,[key,candidate.id,priority,maxAttempts,JSON.stringify(payload)]);
      if(!insert.rows[0]) continue;
      await db.query(`update opportunities set status='approved',recommended_format=$2 where id=$1 and status not in ('produced')`,[candidate.id,item.recommendation.primary]);
      await db.query(`update daily_budget_ledger set reserved_usd=reserved_usd+$3,jobs_scheduled=jobs_scheduled+1,updated_at=now() where channel_key=$1 and spend_date=$2::date`,[channelKey,budgetDate,item.reserve]);
      await db.query(`insert into job_events (job_id,event_type,detail) values ($1,'scheduled',$2::jsonb)`,[insert.rows[0].id,JSON.stringify(payload)]);
      scheduled.push({jobId:insert.rows[0].id,opportunityId:candidate.id,topic,contentFormat:item.contentFormat,formatPrimary:item.recommendation.primary,formatScores:item.recommendation.scores,derivativeStrategy:item.recommendation.derivativeStrategy,priority,score:candidate.score,learningBoost:candidate.learningBoost,reservedCostUsd:item.reserve,budgetDate});
      slots-=1;
      budgetLeft-=item.reserve;
    }
    console.log(JSON.stringify({scheduled:scheduled.length,channelKey,budgetDate,minScore,dailyBudget,budgetLeft,longReserve,shortReserve,learningWindowDays,jobs:scheduled},null,2));
  }
} finally { await db.close(); }
