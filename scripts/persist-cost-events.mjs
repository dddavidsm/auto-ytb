import { readFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NodePostgresSqlClient } from '../packages/runtime-node/index.mjs';

const arg=(name,fallback)=>process.argv.find((value)=>value.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
const req=(name)=>{const value=process.env[name]?.trim();if(!value)throw new Error(`${name} is required`);return value;};
const productionRunId=arg('production-run-id');
const session=arg('session');
if(!productionRunId||!session)throw new Error('Use --production-run-id=<uuid> --session=<id>');
const journal=resolve(process.env.COST_METER_ROOT||'.data/cost-meter',`${String(session).replace(/[^a-zA-Z0-9_.-]+/g,'-')}.jsonl`);
const db=new NodePostgresSqlClient(req('DATABASE_URL'),{ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined});

try{
  let text='';
  try{text=await readFile(journal,'utf8');}catch(error){if(error?.code==='ENOENT'){console.log(JSON.stringify({productionRunId,session,persisted:0,reason:'no meter journal'}));process.exitCode=0;}else throw error;}
  if(text){
    const events=text.split(/\r?\n/).filter(Boolean).map((line)=>JSON.parse(line));
    const channel=(await db.query(`select p.channel_id from production_runs pr left join publications p on p.production_run_id=pr.id where pr.id=$1 order by p.created_at desc nulls last limit 1`,[productionRunId])).rows[0];
    let persisted=0;
    for(const event of events){
      const result=await db.query(`insert into provider_cost_events (production_run_id,channel_id,event_key,stage,provider,model,operation,input_units,output_units,unit_name,duration_seconds,quantity,cost_usd,estimated,pricing_source,metadata,created_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,coalesce($17::timestamptz,now())) on conflict (production_run_id,event_key) do update set channel_id=coalesce(excluded.channel_id,provider_cost_events.channel_id),cost_usd=excluded.cost_usd,estimated=excluded.estimated,pricing_source=excluded.pricing_source,metadata=excluded.metadata returning id`,[
        productionRunId,channel?.channel_id??null,String(event.eventKey),String(event.stage||'other'),String(event.provider||'unknown'),event.model??null,String(event.operation||'unknown'),event.inputUnits??null,event.outputUnits??null,event.unitName??null,event.durationSeconds??null,event.quantity??null,event.costUsd??null,event.estimated!==false,event.pricingSource??null,JSON.stringify({...event.metadata,meterSession:session}),event.recordedAt??null,
      ]);
      if(result.rows[0])persisted+=1;
    }
    await db.query(`update production_runs set metadata=metadata||$2::jsonb,updated_at=now() where id=$1`,[productionRunId,JSON.stringify({costMeter:{session,persisted,journal,finalizedAt:new Date().toISOString()}})]);
    await unlink(journal).catch(()=>{});
    console.log(JSON.stringify({productionRunId,session,persisted},null,2));
  }
} finally {await db.close();}
