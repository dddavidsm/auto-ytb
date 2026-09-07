import { NodePostgresSqlClient } from '../packages/runtime-node/index.mjs';
import { rankProductionCandidates } from '@auto-ytb/os';

const req = (name) => { const v=process.env[name]?.trim(); if(!v) throw new Error(`${name} is required`); return v; };
const num = (name, fallback) => { const v=Number(process.env[name] ?? fallback); if(!Number.isFinite(v)) throw new Error(`${name} must be numeric`); return v; };
const channelKey = process.env.PRIMARY_CHANNEL_KEY || 'future-tech-business';
const minScore = num('AUTO_PRODUCTION_MIN_SCORE',82);
const maxPerDay = Math.max(0,Math.floor(num('AUTO_PRODUCTION_MAX_PER_DAY',1)));
const dailyBudget = Math.max(0,num('AUTO_PRODUCTION_DAILY_BUDGET_USD',25));
const reservePerJob = Math.max(0,num('AUTO_PRODUCTION_RESERVED_COST_USD',Math.min(dailyBudget,18)));
const maxAttempts = Math.max(1,Math.min(20,Math.floor(num('JOB_MAX_ATTEMPTS',4))));
const db = new NodePostgresSqlClient(req('DATABASE_URL'), { ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized:false } : undefined });

try {
  await db.query(`insert into daily_budget_ledger (channel_key,spend_date) values ($1,current_date) on conflict (channel_key,spend_date) do nothing`,[channelKey]);
  const ledgerResult=await db.query(`select reserved_usd::float,actual_usd::float,jobs_scheduled from daily_budget_ledger where channel_key=$1 and spend_date=current_date`,[channelKey]);
  const ledger=ledgerResult.rows[0] ?? {reserved_usd:0,actual_usd:0,jobs_scheduled:0};
  const slots=Math.max(0,maxPerDay-Number(ledger.jobs_scheduled || 0));
  const budgetLeft=Math.max(0,dailyBudget-Number(ledger.reserved_usd || 0)-Number(ledger.actual_usd || 0));
  const budgetSlots=reservePerJob > 0 ? Math.floor(budgetLeft/reservePerJob) : slots;
  const capacity=Math.max(0,Math.min(slots,budgetSlots));
  if(!capacity){
    console.log(JSON.stringify({scheduled:0,reason:'daily capacity exhausted',channelKey,dailyBudget,budgetLeft,slots},null,2));
    process.exitCode=0;
  } else {
    const result=await db.query(`
      select o.id,o.score::float,o.detected_at,o.expires_at,o.risks,t.canonical_name,o.angle,o.status,o.decision
      from opportunities o
      left join topics t on t.id=o.topic_id
      where o.score >= $1
        and (o.expires_at is null or o.expires_at > now())
        and o.status not in ('rejected','produced')
        and (o.status='approved' or upper(coalesce(o.decision,''))='PRODUCE')
        and not exists (select 1 from jobs j where j.opportunity_id=o.id and j.kind='produce_opportunity' and j.state not in ('dead','cancelled'))
      order by o.score desc,o.detected_at desc
      limit 50`,[minScore]);
    const candidates=rankProductionCandidates(result.rows.map((row)=>({
      id:row.id,
      score:Number(row.score),
      detectedAt:new Date(row.detected_at).toISOString(),
      expiresAt:row.expires_at?new Date(row.expires_at).toISOString():null,
      riskPenalty:Number(row.risks?.totalPenalty ?? row.risks?.riskPenalty ?? 0),
      expectedCostUsd:reservePerJob,
    })));
    const selected=candidates.slice(0,capacity);
    const scheduled=[];
    for(const candidate of selected){
      const row=result.rows.find((item)=>item.id===candidate.id);
      const topic=row?.canonical_name || row?.angle;
      if(!topic) continue;
      const priority=Math.max(0,Math.min(100,Math.round(candidate.productionPriority)));
      const payload={topic,angle:row.angle,channelKey,score:Number(row.score),productionPriority:candidate.productionPriority,reservedCostUsd:reservePerJob};
      const insert=await db.query(`insert into jobs (job_key,kind,opportunity_id,state,priority,max_attempts,payload) values ($1,'produce_opportunity',$2,'queued',$3,$4,$5::jsonb) on conflict (job_key) do nothing returning id`,[`produce-opportunity:${candidate.id}`,candidate.id,priority,maxAttempts,JSON.stringify(payload)]);
      if(!insert.rows[0]) continue;
      await db.query(`update opportunities set status='approved' where id=$1 and status not in ('approved','produced')`,[candidate.id]);
      await db.query(`update daily_budget_ledger set reserved_usd=reserved_usd+$2,jobs_scheduled=jobs_scheduled+1,updated_at=now() where channel_key=$1 and spend_date=current_date`,[channelKey,reservePerJob]);
      await db.query(`insert into job_events (job_id,event_type,detail) values ($1,'scheduled',$2::jsonb)`,[insert.rows[0].id,JSON.stringify(payload)]);
      scheduled.push({jobId:insert.rows[0].id,opportunityId:candidate.id,topic,priority,score:candidate.score,reservedCostUsd:reservePerJob});
    }
    console.log(JSON.stringify({scheduled:scheduled.length,channelKey,minScore,dailyBudget,reservedCostUsd:reservePerJob,jobs:scheduled},null,2));
  }
} finally { await db.close(); }
