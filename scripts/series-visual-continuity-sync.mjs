import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { NodePostgresSqlClient, NodeUploadAssetLoader } from '../packages/runtime-node/index.mjs';
import { decideVisualContinuity } from '../packages/runtime-node/visual-continuity.mjs';

const req=(name)=>{const value=process.env[name]?.trim();if(!value)throw new Error(`${name} is required`);return value;};
const enabled=process.env.SERIES_VISUAL_CONTINUITY_ENABLED!=='false';
const limit=Math.max(1,Math.min(20,Number(process.env.SERIES_VISUAL_CONTINUITY_SYNC_LIMIT||4)));
const maxAssets=Math.max(1,Math.min(6,Number(process.env.SERIES_VISUAL_CONTINUITY_MAX_ASSETS||3)));
const model=process.env.TEXT_MODEL_VISION||process.env.TEXT_MODEL_CREATIVE||process.env.TEXT_MODEL_RESEARCH||'gpt-5';
const apiKey=req('TEXT_MODEL_API_KEY');
const endpoint=process.env.TEXT_MODEL_BASE_URL||'https://api.openai.com/v1/responses';
const inputRate=Math.max(0,Number(process.env.TEXT_MODEL_INPUT_USD_PER_MILLION||1.25));
const outputRate=Math.max(0,Number(process.env.TEXT_MODEL_OUTPUT_USD_PER_MILLION||10));
const ffmpeg=process.env.FFMPEG_BIN||'ffmpeg';
const db=new NodePostgresSqlClient(req('DATABASE_URL'),{ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined});
const loader=new NodeUploadAssetLoader();

function responseText(json){if(typeof json.output_text==='string')return json.output_text;for(const item of Array.isArray(json.output)?json.output:[])for(const part of Array.isArray(item.content)?item.content:[])if(typeof part.text==='string')return part.text;throw new Error('Visual continuity model returned no text');}
function run(command,args){return new Promise((resolve,reject)=>{const child=spawn(command,args,{stdio:['ignore','ignore','pipe']});let stderr='';child.stderr.on('data',(d)=>stderr=(stderr+d.toString()).slice(-4000));child.on('error',reject);child.on('exit',(code)=>code===0?resolve():reject(new Error(`${command} failed ${code}: ${stderr}`)));});}
function dataUrl(bytes,mime){return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;}
async function imageDataUrl(uri,work,key){
  const loaded=await loader.load(uri);
  if(loaded.mimeType.startsWith('image/'))return dataUrl(loaded.body,loaded.mimeType);
  if(!loaded.mimeType.startsWith('video/'))throw new Error(`Unsupported visual mime ${loaded.mimeType}`);
  const source=join(work,`${key}.mp4`),frame=join(work,`${key}.jpg`);await writeFile(source,loaded.body);
  await run(ffmpeg,['-y','-ss','0.35','-i',source,'-frames:v','1','-vf','scale=min(1024\\,iw):-2',frame]);
  return dataUrl(await readFile(frame),'image/jpeg');
}
const schema={type:'object',additionalProperties:false,required:['overallScore','characterVisible','characterIdentityScore','styleScore','paletteScore','compositionScore','confidence','issues','observations'],properties:{
  overallScore:{type:'integer',minimum:0,maximum:100},characterVisible:{type:'boolean'},characterIdentityScore:{type:'integer',minimum:0,maximum:100},styleScore:{type:'integer',minimum:0,maximum:100},paletteScore:{type:'integer',minimum:0,maximum:100},compositionScore:{type:'integer',minimum:0,maximum:100},confidence:{type:'integer',minimum:0,maximum:100},
  issues:{type:'array',items:{type:'object',additionalProperties:false,required:['code','severity','message'],properties:{code:{type:'string'},severity:{type:'string',enum:['WARN','BLOCK']},message:{type:'string'}}}},observations:{type:'array',items:{type:'string'}}
}};
async function inspect({characterRef,styleRef,candidateUrl,characterName,characterSpec,styleSpec,sceneId}){
  const content=[{type:'input_text',text:`You are a strict visual continuity supervisor for an original recurring YouTube series. Compare the candidate scene against canonical references. Scene composition and action may change. Do NOT penalize a candidate merely because the character is absent; set characterVisible=false. If visible, identity must preserve face, proportions, silhouette, wardrobe/signature accessories and invariant features. Style must preserve the established rendering language, shape language, palette family and visual texture without requiring identical content. Severe redesign, wrong identity, photorealism-vs-illustration drift, materially wrong signature colors/accessories, or franchise-like reinterpretation is BLOCK. Scene id: ${sceneId}. Character: ${characterName??'none'}. Character invariants: ${JSON.stringify(characterSpec??{})}. Style canon: ${JSON.stringify(styleSpec??{})}. Return calibrated scores; 100 means effectively canonical, 80 means acceptable variation, below 65 means severe drift.`}];
  if(characterRef){content.push({type:'input_text',text:'CANONICAL CHARACTER REFERENCE:'},{type:'input_image',image_url:characterRef,detail:'low'});}
  if(styleRef){content.push({type:'input_text',text:'CANONICAL STYLE REFERENCE:'},{type:'input_image',image_url:styleRef,detail:'low'});}
  content.push({type:'input_text',text:'CANDIDATE SCENE / FRAME:'},{type:'input_image',image_url:candidateUrl,detail:'low'});
  const response=await fetch(endpoint,{method:'POST',headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json'},body:JSON.stringify({model,store:false,input:[{role:'user',content}],text:{format:{type:'json_schema',name:'series_visual_continuity',strict:true,schema}}})});
  if(!response.ok)throw new Error(`Visual continuity model failed ${response.status}: ${(await response.text()).slice(0,800)}`);
  const json=await response.json();return{value:JSON.parse(responseText(json)),usage:json.usage??{}};
}

try{
  if(!enabled){console.log(JSON.stringify({enabled:false,processed:0}));process.exitCode=0;}
  else{
    const episodes=(await db.query(`select se.id as episode_id,se.series_id,se.production_run_id,se.episode_key,s.channel_id,s.title as series_title
      from series_episodes se join series s on s.id=se.series_id
      left join series_episode_quality_reports qr on qr.episode_id=se.id and qr.report_type='visual_continuity'
      where se.production_run_id is not null and qr.id is null and se.status not in ('failed','rejected')
      order by se.created_at asc limit $1`,[limit])).rows;
    const results=[];
    for(const row of episodes){
      const work=await mkdtemp(join(tmpdir(),`auto-ytb-visual-${row.episode_id}-`));
      try{
        const [characters,styles,assets]=await Promise.all([
          db.query(`select name,specification,canonical_reference_uri from series_characters where series_id=$1 and status='active' and canonical_reference_uri is not null order by created_at limit 1`,[row.series_id]),
          db.query(`select name,specification,canonical_reference_uri from series_styles where series_id=$1 and status='active' and canonical_reference_uri is not null order by created_at limit 1`,[row.series_id]),
          db.query(`select id,scene_id,uri,asset_type,metadata from production_assets where production_run_id=$1 and generated=true and uri is not null and coalesce(scene_id,'') not like 'thumbnail:%' order by created_at asc limit $2`,[row.production_run_id,maxAssets]),
        ]);
        const character=characters.rows[0]??null,style=styles.rows[0]??null;
        if(!character&&!style)throw new Error(`Series ${row.series_title} has no canonical visual references`);
        if(!assets.rows.length)throw new Error(`Episode ${row.episode_key} has no generated visual assets to inspect`);
        const characterRef=character?.canonical_reference_uri?await imageDataUrl(character.canonical_reference_uri,work,'character-ref'):null;
        const styleRef=style?.canonical_reference_uri?await imageDataUrl(style.canonical_reference_uri,work,'style-ref'):null;
        const inspections=[];let totalInput=0,totalOutput=0,totalCost=0;
        for(let index=0;index<assets.rows.length;index+=1){
          const asset=assets.rows[index],candidateUrl=await imageDataUrl(asset.uri,work,`candidate-${index}`);
          const inspected=await inspect({characterRef,styleRef,candidateUrl,characterName:character?.name,characterSpec:character?.specification,styleSpec:style?.specification,sceneId:asset.scene_id??String(asset.id)});
          const inputTokens=Number(inspected.usage.input_tokens??0),outputTokens=Number(inspected.usage.output_tokens??0),cost=inputTokens/1_000_000*inputRate+outputTokens/1_000_000*outputRate;
          totalInput+=inputTokens;totalOutput+=outputTokens;totalCost+=cost;
          inspections.push({sceneId:asset.scene_id??String(asset.id),assetId:asset.id,...inspected.value});
          await db.query(`insert into provider_cost_events (production_run_id,channel_id,event_key,stage,provider,model,operation,input_units,output_units,unit_name,cost_usd,estimated,pricing_source,metadata)
            values ($1,$2,$3,'llm','openai',$4,'series_visual_continuity',$5,$6,'tokens',$7,true,'env-config',$8::jsonb) on conflict (production_run_id,event_key) do nothing`,[row.production_run_id,row.channel_id,`series-visual:${row.episode_id}:${asset.id}`,model,inputTokens,outputTokens,Math.round(cost*1e6)/1e6,JSON.stringify({episodeId:row.episode_id,sceneId:asset.scene_id,detail:'low'})]);
        }
        const decision=decideVisualContinuity(inspections,{minOverall:Number(process.env.SERIES_VISUAL_MIN_OVERALL||80),minCharacter:Number(process.env.SERIES_VISUAL_MIN_CHARACTER||84),minStyle:Number(process.env.SERIES_VISUAL_MIN_STYLE||78)});
        const report={...decision,inspections,model,usage:{inputTokens:totalInput,outputTokens:totalOutput,costUsd:Math.round(totalCost*1e6)/1e6},referenceSummary:{character:character?.name??null,style:style?.name??null}};
        await db.transaction(async(tx)=>{
          await tx.query(`insert into series_episode_quality_reports (series_id,episode_id,production_run_id,report_type,status,score,report,model)
            values ($1,$2,$3,'visual_continuity',$4,$5,$6::jsonb,$7) on conflict (episode_id,report_type) do update set status=excluded.status,score=excluded.score,report=excluded.report,model=excluded.model,updated_at=now()`,[row.series_id,row.episode_id,row.production_run_id,decision.status,decision.score,JSON.stringify(report),model]);
          const patch={visualContinuity:{status:decision.status,score:decision.score,issues:decision.issues,evaluatedAt:new Date().toISOString(),model}};
          if(!decision.passed)await tx.query(`update series_episodes set continuity_status='blocked',continuity_snapshot=continuity_snapshot||$2::jsonb,updated_at=now() where id=$1`,[row.episode_id,JSON.stringify(patch)]);
          else await tx.query(`update series_episodes set continuity_snapshot=continuity_snapshot||$2::jsonb,updated_at=now() where id=$1`,[row.episode_id,JSON.stringify(patch)]);
        });
        results.push({episodeId:row.episode_id,episodeKey:row.episode_key,status:decision.status,score:decision.score,inspected:inspections.length,costUsd:Math.round(totalCost*1e6)/1e6});
      }catch(error){
        await db.query(`insert into series_episode_quality_reports (series_id,episode_id,production_run_id,report_type,status,score,report,model) values ($1,$2,$3,'visual_continuity','blocked',0,$4::jsonb,$5) on conflict (episode_id,report_type) do update set status='blocked',score=0,report=excluded.report,model=excluded.model,updated_at=now()`,[row.series_id,row.episode_id,row.production_run_id,JSON.stringify({error:error instanceof Error?error.message:String(error)}),model]).catch(()=>{});
        await db.query(`update series_episodes set continuity_status='blocked',continuity_snapshot=continuity_snapshot||$2::jsonb,updated_at=now() where id=$1`,[row.episode_id,JSON.stringify({visualContinuity:{status:'blocked',score:0,error:error instanceof Error?error.message:String(error),evaluatedAt:new Date().toISOString()}})]).catch(()=>{});
        results.push({episodeId:row.episode_id,episodeKey:row.episode_key,status:'blocked',error:error instanceof Error?error.message:String(error)});
      }finally{await rm(work,{recursive:true,force:true});}
    }
    console.log(JSON.stringify({enabled:true,processed:results.length,model,maxAssets,results},null,2));
  }
} finally {await db.close();}
