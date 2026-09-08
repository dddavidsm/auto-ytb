import { NodePostgresSqlClient } from '../packages/runtime-node/index.mjs';

const arg=(name)=>process.argv.find((value)=>value.startsWith(`--${name}=`))?.slice(name.length+3);
const req=(name)=>{const value=process.env[name]?.trim();if(!value)throw new Error(`${name} is required`);return value;};
const productionRunId=arg('production-run-id');if(!productionRunId)throw new Error('Use --production-run-id=<uuid>');
const db=new NodePostgresSqlClient(req('DATABASE_URL'),{ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined});
const model=process.env.TEXT_MODEL_CREATIVE||process.env.TEXT_MODEL_RESEARCH||'gpt-5';
const apiKey=req('TEXT_MODEL_API_KEY');
const schema={type:'object',additionalProperties:false,required:['episodeSummary','memories'],properties:{episodeSummary:{type:'string'},memories:{type:'array',maxItems:24,items:{type:'object',additionalProperties:false,required:['type','key','importance','payload'],properties:{type:{type:'string',enum:['event','relationship','prop','location','world_fact','character_change','open_loop','resolved_loop','lesson']},key:{type:'string'},importance:{type:'number'},payload:{type:'object',additionalProperties:false,required:['fact','entities'],properties:{fact:{type:'string'},entities:{type:'array',items:{type:'string'}}}}}}}}};
function responseText(json){if(typeof json.output_text==='string')return json.output_text;for(const item of Array.isArray(json.output)?json.output:[])for(const part of Array.isArray(item.content)?item.content:[])if(typeof part.text==='string')return part.text;throw new Error('Episode memory model returned no output text');}
const slug=(value)=>String(value??'memory').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,96)||'memory';

try{
  const row=(await db.query(`select pr.metadata,ci.id as content_idea_id,ci.series_id,s.script,se.id as episode_id,se.episode_key,se.status as episode_status,p.state as publication_state
    from production_runs pr join content_ideas ci on ci.id=pr.content_idea_id
    left join lateral (select script from scripts x where x.content_idea_id=ci.id order by version desc,created_at desc limit 1) s on true
    left join series_episodes se on se.production_run_id=pr.id
    left join lateral (select state from publications x where x.production_run_id=pr.id order by updated_at desc limit 1) p on true
    where pr.id=$1`,[productionRunId])).rows[0];
  if(!row)throw new Error(`Production run ${productionRunId} not found`);
  const seriesContext=row.metadata?.seriesContext??null;if(!row.series_id||!row.episode_id||!seriesContext){console.log(JSON.stringify({productionRunId,skipped:true,reason:'not-series-production'},null,2));process.exit(0);}
  const script=row.script??{};const narration=Array.isArray(script.beats)?script.beats.map((beat)=>`[${beat.purpose}] ${beat.narration}`).join('\n'):JSON.stringify(script);
  const prior=Array.isArray(seriesContext.canonicalMemory)?seriesContext.canonicalMemory:[];
  const prompt=`Extract continuity memory from the FINAL APPROVED EPISODE SCRIPT below. Record only facts explicitly established by this episode. Do not infer off-screen events. Do not invent character traits, relationships or props that are not stated. Use stable concise keys. Focus on facts future episodes must remember: events, relationships, recurring props, locations, world facts, real character changes, unresolved/open loops, resolved loops, and lessons that the series intentionally remembers. Previous canon is supplied only to avoid restating unchanged facts.\nSERIES: ${seriesContext.seriesTitle??seriesContext.seriesKey}\nEPISODE: ${seriesContext.episodeKey}\nPREVIOUS CANON: ${JSON.stringify(prior)}\nFINAL SCRIPT:\n${narration}`;
  const response=await fetch(process.env.TEXT_MODEL_BASE_URL||'https://api.openai.com/v1/responses',{method:'POST',headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json'},body:JSON.stringify({model,instructions:'You are a strict series continuity archivist. Extract only canon established by the supplied final script.',input:prompt,store:false,text:{format:{type:'json_schema',name:'series_episode_memory',strict:true,schema}}})});
  if(!response.ok)throw new Error(`Episode memory model failed ${response.status}: ${(await response.text()).slice(0,800)}`);
  const extracted=JSON.parse(responseText(await response.json()));
  const canonical=['scheduled','public'].includes(String(row.publication_state??''));
  await db.transaction(async(tx)=>{
    await tx.query(`delete from series_episode_memory where episode_id=$1`,[row.episode_id]);
    for(const item of extracted.memories??[]){const key=slug(item.key||item.payload?.fact);await tx.query(`insert into series_episode_memory (series_id,episode_id,memory_type,memory_key,payload,importance,canonical,active) values ($1,$2,$3,$4,$5::jsonb,$6,$7,true)`,[row.series_id,row.episode_id,item.type,key,JSON.stringify(item.payload??{}),Math.max(0,Math.min(100,Number(item.importance??50))),canonical]);}
    await tx.query(`update series_episodes set continuity_snapshot=continuity_snapshot||$2::jsonb,status=$3,updated_at=now() where id=$1`,[row.episode_id,JSON.stringify({episodeSummary:extracted.episodeSummary,memoryExtractedAt:new Date().toISOString(),memoryCanonical:canonical,memoryCount:(extracted.memories??[]).length}),canonical?'scheduled':String(row.episode_status??'private')]);
  });
  console.log(JSON.stringify({productionRunId,seriesId:row.series_id,episodeId:row.episode_id,episodeKey:row.episode_key,canonical,publicationState:row.publication_state??null,episodeSummary:extracted.episodeSummary,memoryCount:(extracted.memories??[]).length},null,2));
}finally{await db.close();}
