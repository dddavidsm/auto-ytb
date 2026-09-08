import { NodePostgresSqlClient } from '../packages/runtime-node/index.mjs';
import { validateEpisodeMemory } from '@auto-ytb/os';

const arg=(name,fallback)=>process.argv.find((value)=>value.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
const req=(name)=>{const value=process.env[name]?.trim();if(!value)throw new Error(`${name} is required`);return value;};
const limit=Math.max(1,Math.min(20,Number(arg('limit',process.env.SERIES_MEMORY_SYNC_LIMIT||4))));
const onlyProductionRunId=arg('production-run-id',null);
const model=process.env.TEXT_MODEL_CREATIVE||process.env.TEXT_MODEL_RESEARCH||'gpt-5';
const apiKey=req('TEXT_MODEL_API_KEY');
const db=new NodePostgresSqlClient(req('DATABASE_URL'),{ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined});

const schema={type:'object',additionalProperties:false,required:['summary','facts','arcUpdates','nextEpisodeSeeds','conflicts'],properties:{
  summary:{type:'string'},
  facts:{type:'array',items:{type:'object',additionalProperties:false,required:['type','key','importance','canonical','value','entities'],properties:{type:{type:'string',enum:['plot_fact','relationship','world_fact','prop_state','location_state','character_state','promise','open_loop']},key:{type:'string'},importance:{type:'integer',minimum:0,maximum:100},canonical:{type:'boolean'},value:{type:'string'},entities:{type:'array',items:{type:'string'}}}}},
  arcUpdates:{type:'array',items:{type:'object',additionalProperties:false,required:['arcKey','title','status','summary','stateSummary'],properties:{arcKey:{type:'string'},title:{type:'string'},status:{type:'string',enum:['planned','active','completed','abandoned']},summary:{type:'string'},stateSummary:{type:'string'}}}},
  nextEpisodeSeeds:{type:'array',items:{type:'object',additionalProperties:false,required:['title','premise','usesOpenLoops'],properties:{title:{type:'string'},premise:{type:'string'},usesOpenLoops:{type:'array',items:{type:'string'}}}}},
  conflicts:{type:'array',items:{type:'object',additionalProperties:false,required:['code','severity','message','memoryKey'],properties:{code:{type:'string'},severity:{type:'string',enum:['WARN','BLOCK']},message:{type:'string'},memoryKey:{type:['string','null']}}}}
}};
function responseText(json){if(typeof json.output_text==='string')return json.output_text;for(const item of Array.isArray(json.output)?json.output:[])for(const part of Array.isArray(item.content)?item.content:[])if(typeof part.text==='string')return part.text;throw new Error('Series memory model returned no text');}
async function compile(row,priorMemory){
  const bible=row.bible??{},kids=row.audience_mode==='MADE_FOR_KIDS';
  const instructions=`You are the continuity editor for an original recurring YouTube series. Extract only durable story facts that future episodes should remember. Never rewrite immutable character appearance, style, voice identity or world rules from a single episode. Distinguish temporary character state from invariant identity. Flag contradictions with the active bible or prior canonical memory. ${kids?'This is made for children: continuity must remain emotionally safe and age-appropriate; flag unsafe imitation, graphic danger, manipulative purchase pressure, sexual content or frightening unresolved material as BLOCK.':''}`;
  const input=`Series: ${row.series_title}. Episode ${row.episode_key}. Audience: ${row.audience_mode}.\nACTIVE BIBLE:\n${JSON.stringify(bible)}\nPRIOR CANONICAL MEMORY:\n${JSON.stringify(priorMemory)}\nFINAL SCRIPT:\n${JSON.stringify(row.script)}\nReturn a concise episode summary, canonical facts, story-arc updates, possible next-episode seeds and continuity conflicts. Facts must describe events/state only; never promote an incidental visual or costume change into character canon.`;
  const response=await fetch(process.env.TEXT_MODEL_BASE_URL||'https://api.openai.com/v1/responses',{method:'POST',headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json'},body:JSON.stringify({model,instructions,input,store:false,text:{format:{type:'json_schema',name:'series_episode_memory',strict:true,schema}}})});
  if(!response.ok)throw new Error(`Series memory model failed ${response.status}: ${(await response.text()).slice(0,900)}`);
  return JSON.parse(responseText(await response.json()));
}

try{
  const params=[];let extra='';
  if(onlyProductionRunId){params.push(onlyProductionRunId);extra=`and se.production_run_id=$${params.length}`;}
  params.push(String(limit));
  const episodes=(await db.query(`select se.id as episode_id,se.series_id,se.production_run_id,se.bible_version_id,se.episode_key,se.premise,se.status,se.continuity_snapshot,
      s.title as series_title,s.audience_mode,s.target_age_min,s.target_age_max,sb.bible,
      sc.script
    from series_episodes se join series s on s.id=se.series_id join series_bibles sb on sb.id=se.bible_version_id
    join production_runs pr on pr.id=se.production_run_id join content_ideas ci on ci.id=pr.content_idea_id
    join lateral (select script from scripts x where x.content_idea_id=ci.id order by version desc,created_at desc limit 1) sc on true
    left join series_memory_compilations smc on smc.episode_id=se.id
    where se.production_run_id is not null and smc.id is null ${extra}
    order by se.created_at asc limit $${params.length}` ,params)).rows;
  const results=[];
  for(const row of episodes){
    const prior=(await db.query(`select memory_type,memory_key,payload,importance::float,canonical,active from series_episode_memory where series_id=$1 and active=true and canonical=true order by importance desc,created_at desc limit 50`,[row.series_id])).rows;
    let compiled,status='compiled',validation;
    try{compiled=await compile(row,prior);validation=validateEpisodeMemory({facts:(compiled.facts??[]).map((fact)=>({type:fact.type,key:fact.key,importance:fact.importance,canonical:fact.canonical,payload:{value:fact.value,entities:fact.entities}})),conflicts:compiled.conflicts??[],madeForKids:row.audience_mode==='MADE_FOR_KIDS'});status=validation.passed?'compiled':'conflict';}
    catch(error){await db.query(`update series_episodes set continuity_status='blocked',updated_at=now() where id=$1`,[row.episode_id]);results.push({episodeId:row.episode_id,status:'blocked',error:error instanceof Error?error.message:String(error)});continue;}
    await db.transaction(async(tx)=>{
      await tx.query(`insert into series_memory_compilations (series_id,episode_id,bible_version_id,status,summary,canonical_facts,arc_updates,next_episode_seeds,conflicts,model,metadata)
        values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11::jsonb)
        on conflict (episode_id) do update set status=excluded.status,summary=excluded.summary,canonical_facts=excluded.canonical_facts,arc_updates=excluded.arc_updates,next_episode_seeds=excluded.next_episode_seeds,conflicts=excluded.conflicts,model=excluded.model,metadata=excluded.metadata,updated_at=now()`,[row.series_id,row.episode_id,row.bible_version_id,status,compiled.summary,JSON.stringify(compiled.facts??[]),JSON.stringify(compiled.arcUpdates??[]),JSON.stringify(compiled.nextEpisodeSeeds??[]),JSON.stringify(compiled.conflicts??[]),model,JSON.stringify({validation})]);
      await tx.query(`insert into series_episode_memory (series_id,episode_id,memory_type,memory_key,payload,importance,canonical,active)
        values ($1,$2,'episode_summary',$3,$4::jsonb,90,true,true)
        on conflict (series_id,episode_id,memory_type,memory_key) do update set payload=excluded.payload,importance=excluded.importance,canonical=true,active=true`,[row.series_id,row.episode_id,row.episode_key,JSON.stringify({summary:compiled.summary})]);
      for(const fact of compiled.facts??[]){await tx.query(`insert into series_episode_memory (series_id,episode_id,memory_type,memory_key,payload,importance,canonical,active)
        values ($1,$2,$3,$4,$5::jsonb,$6,$7,true)
        on conflict (series_id,episode_id,memory_type,memory_key) do update set payload=excluded.payload,importance=excluded.importance,canonical=excluded.canonical,active=true`,[row.series_id,row.episode_id,fact.type,fact.key,JSON.stringify({value:fact.value,entities:fact.entities??[]}),fact.importance,fact.canonical!==false]);}
      for(const arc of compiled.arcUpdates??[]){await tx.query(`insert into series_story_arcs (series_id,arc_key,title,status,summary,state) values ($1,$2,$3,$4,$5,$6::jsonb)
        on conflict (series_id,arc_key) do update set title=excluded.title,status=excluded.status,summary=excluded.summary,state=series_story_arcs.state||excluded.state,updated_at=now()`,[row.series_id,arc.arcKey,arc.title,arc.status,arc.summary,JSON.stringify({latestState:arc.stateSummary,lastEpisodeKey:row.episode_key})]);}
      await tx.query(`update series_episodes set memory_compiled_at=now(),continuity_status=$2,continuity_snapshot=continuity_snapshot||$3::jsonb,updated_at=now() where id=$1`,[row.episode_id,validation.passed?'passed':'conflict',JSON.stringify({memorySummary:compiled.summary,nextEpisodeSeeds:compiled.nextEpisodeSeeds??[],memoryCompiledAt:new Date().toISOString(),memoryValidation:validation})]);
    });
    results.push({episodeId:row.episode_id,episodeKey:row.episode_key,status:validation.passed?'passed':'conflict',facts:(compiled.facts??[]).length,conflicts:(compiled.conflicts??[]).length,nextEpisodeSeeds:(compiled.nextEpisodeSeeds??[]).length});
  }
  console.log(JSON.stringify({processed:results.length,results},null,2));
} finally {await db.close();}
