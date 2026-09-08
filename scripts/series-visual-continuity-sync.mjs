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
async function inspect({characterRefs,styleRef,candidateUrl,styleSpec,sceneId}){
  const roster=(characterRefs??[]).map((item)=>({name:item.name,key:item.key,invariants:item.specification??{}}));
  const content=[{type:'input_text',text:`You are a strict visual continuity supervisor for an original recurring YouTube series. Compare the candidate scene against the exact canonical references selected for this scene. Scene composition and action may change. If a listed character is visible, identity must preserve face, proportions, silhouette, wardrobe/signature accessories and invariant features. Multiple listed characters must remain distinct; identity blending or swapping is BLOCK. Do NOT penalize a candidate because a listed character is genuinely absent from the frame; set characterVisible according to what is visible and focus identity scoring on visible listed characters. Style must preserve the established rendering language, shape language, palette family and visual texture without requiring identical content. Severe redesign, wrong identity, photorealism-vs-illustration drift, materially wrong signature colors/accessories, or franchise-like reinterpretation is BLOCK. Scene id: ${sceneId}. Expected cast anchors: ${JSON.stringify(roster)}. Style canon: ${JSON.stringify(styleSpec??{})}. Return calibrated scores; 100 means effectively canonical, 80 means acceptable variation, below 65 means severe drift.`}];
  for(const ref of characterRefs??[]){content.push({type:'input_text',text:`CANONICAL CHARACTER REFERENCE — ${ref.name}:`},{type:'input_image',image_url:ref.imageUrl,detail:'low'});}
  if(styleRef){content.push({type:'input_text',text:'CANONICAL STYLE REFERENCE:'},{type:'input_image',image_url:styleRef,detail:'low'});}
  content.push({type:'input_text',text:'CANDIDATE SCENE / FRAME:'},{type:'input_image',image_url:candidateUrl,detail:'low'});
  const response=await fetch(endpoint,{method:'POST',headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json'},body:JSON.stringify({model,store:false,input:[{role:'user',content}],text:{format:{type:'json_schema',name:'series_visual_continuity',strict:true,schema}}})});
  if(!response.ok)throw new Error(`Visual continuity model failed ${response.status}: ${(await response.text()).slice(0,800)}`);
  const json=await response.json();return{value:JSON.parse(responseText(json)),usage:json.usage??{}};
}
async function persistQuality(row,status,score,report){
  await db.transaction(async(tx)=>{
    await tx.query(`insert into series_episode_quality_reports (series_id,episode_id,production_run_id,report_type,status,score,report,model)
      values ($1,$2,$3,'visual_continuity',$4,$5,$6::jsonb,$7) on conflict (episode_id,report_type) do update set status=excluded.status,score=excluded.score,report=excluded.report,model=excluded.model,updated_at=now()`,[row.series_id,row.episode_id,row.production_run_id,status,score,JSON.stringify(report),model]);
    const patch={visualContinuity:{status,score,issues:report.issues??[],notApplicable:Boolean(report.notApplicable),evaluatedAt:new Date().toISOString(),model}};
    if(status==='blocked')await tx.query(`update series_episodes set continuity_status='blocked',continuity_snapshot=continuity_snapshot||$2::jsonb,updated_at=now() where id=$1`,[row.episode_id,JSON.stringify(patch)]);
    else await tx.query(`update series_episodes set continuity_snapshot=continuity_snapshot||$2::jsonb,updated_at=now() where id=$1`,[row.episode_id,JSON.stringify(patch)]);
  });
}
function assetProof(asset){return asset?.metadata?.brandContinuity&&typeof asset.metadata.brandContinuity==='object'?asset.metadata.brandContinuity:{};}
function selectedForAsset(asset,characters,styles){
  const proof=assetProof(asset),keys=Array.isArray(proof.referenceKeys)?proof.referenceKeys.map(String):[],names=Array.isArray(proof.characterNames)?proof.characterNames.map(String):[];
  let selectedCharacters=characters.filter((item)=>keys.includes(String(item.character_key))||names.includes(String(item.name)));
  if(!selectedCharacters.length&&characters.length===1)selectedCharacters=characters;
  if(!selectedCharacters.length&&characters.length>1&&!keys.length&&!names.length)throw new Error(`Asset ${asset.scene_id??asset.id} is missing cast-aware continuity proof for a multi-character series`);
  let selectedStyle=styles.find((item)=>keys.includes(String(item.style_key)))??styles[0]??null;
  return{proof,selectedCharacters,selectedStyle};
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
        const [charactersResult,stylesResult,assets]=await Promise.all([
          db.query(`select character_key,name,specification,canonical_reference_uri from series_characters where series_id=$1 and status='active' order by created_at`,[row.series_id]),
          db.query(`select style_key,name,specification,canonical_reference_uri from series_styles where series_id=$1 and status='active' order by created_at`,[row.series_id]),
          db.query(`select id,scene_id,uri,asset_type,metadata from production_assets where production_run_id=$1 and generated=true and uri is not null and coalesce(scene_id,'') not like 'thumbnail:%' order by created_at asc limit $2`,[row.production_run_id,maxAssets]),
        ]);
        const characters=charactersResult.rows,styles=stylesResult.rows;
        const missingCharacterRefs=characters.filter((item)=>!item.canonical_reference_uri);
        if(missingCharacterRefs.length)throw new Error(`Persistent characters missing canonical references: ${missingCharacterRefs.map((item)=>item.name).join(', ')}`);
        if(!assets.rows.length){
          if(characters.length)throw new Error(`Episode ${row.episode_key} has persistent characters but no generated visual assets to inspect`);
          const report={passed:true,status:'passed',score:100,notApplicable:true,issues:[],inspections:[],model:null,usage:{inputTokens:0,outputTokens:0,costUsd:0},referenceSummary:{characters:[],styles:styles.map((item)=>item.name)},reason:'No persistent character and no generated visual assets; source/procedural visuals are governed by deterministic provenance/render gates instead.'};
          await persistQuality(row,'passed',100,report);
          results.push({episodeId:row.episode_id,episodeKey:row.episode_key,status:'passed',score:100,inspected:0,costUsd:0,notApplicable:true});
          continue;
        }
        if(!characters.length&&!styles.length)throw new Error(`Series ${row.series_title} has generated visuals but no canonical visual references`);
        const missingStyleRefs=styles.filter((item)=>!item.canonical_reference_uri);
        if(missingStyleRefs.length)throw new Error(`Series styles missing canonical references: ${missingStyleRefs.map((item)=>item.name).join(', ')}`);
        const refCache=new Map();
        const refUrl=async(uri,key)=>{if(!uri)return null;if(!refCache.has(uri))refCache.set(uri,await imageDataUrl(uri,work,key));return refCache.get(uri);};
        const inspections=[];let totalInput=0,totalOutput=0,totalCost=0;
        for(let index=0;index<assets.rows.length;index+=1){
          const asset=assets.rows[index],candidateUrl=await imageDataUrl(asset.uri,work,`candidate-${index}`);
          const {selectedCharacters,selectedStyle,proof}=selectedForAsset(asset,characters,styles);
          const characterRefs=[];
          for(let charIndex=0;charIndex<selectedCharacters.length;charIndex+=1){const character=selectedCharacters[charIndex];characterRefs.push({key:character.character_key,name:character.name,specification:character.specification,imageUrl:await refUrl(character.canonical_reference_uri,`character-${character.character_key}-${charIndex}`)});}
          const styleRef=selectedStyle?.canonical_reference_uri?await refUrl(selectedStyle.canonical_reference_uri,`style-${selectedStyle.style_key}`):null;
          if(!characterRefs.length&&!styleRef)throw new Error(`Asset ${asset.scene_id??asset.id} has no resolvable canonical references`);
          const inspected=await inspect({characterRefs,styleRef,candidateUrl,styleSpec:selectedStyle?.specification,sceneId:asset.scene_id??String(asset.id)});
          const inputTokens=Number(inspected.usage.input_tokens??0),outputTokens=Number(inspected.usage.output_tokens??0),cost=inputTokens/1_000_000*inputRate+outputTokens/1_000_000*outputRate;
          totalInput+=inputTokens;totalOutput+=outputTokens;totalCost+=cost;
          inspections.push({sceneId:asset.scene_id??String(asset.id),assetId:asset.id,referenceKeys:Array.isArray(proof.referenceKeys)?proof.referenceKeys:[],expectedCharacterNames:characterRefs.map((item)=>item.name),expectedStyle:selectedStyle?.name??null,...inspected.value});
          await db.query(`insert into provider_cost_events (production_run_id,channel_id,event_key,stage,provider,model,operation,input_units,output_units,unit_name,cost_usd,estimated,pricing_source,metadata)
            values ($1,$2,$3,'llm','openai',$4,'series_visual_continuity',$5,$6,'tokens',$7,true,'env-config',$8::jsonb) on conflict (production_run_id,event_key) do nothing`,[row.production_run_id,row.channel_id,`series-visual:${row.episode_id}:${asset.id}`,model,inputTokens,outputTokens,Math.round(cost*1e6)/1e6,JSON.stringify({episodeId:row.episode_id,sceneId:asset.scene_id,detail:'low',referenceKeys:Array.isArray(proof.referenceKeys)?proof.referenceKeys:[],characterNames:characterRefs.map((item)=>item.name),styleKey:selectedStyle?.style_key??null})]);
        }
        const decision=decideVisualContinuity(inspections,{minOverall:Number(process.env.SERIES_VISUAL_MIN_OVERALL||80),minCharacter:Number(process.env.SERIES_VISUAL_MIN_CHARACTER||84),minStyle:Number(process.env.SERIES_VISUAL_MIN_STYLE||78)});
        const report={...decision,inspections,model,usage:{inputTokens:totalInput,outputTokens:totalOutput,costUsd:Math.round(totalCost*1e6)/1e6},referenceSummary:{characters:characters.map((item)=>item.name),styles:styles.map((item)=>item.name),sceneSpecific:true}};
        await persistQuality(row,decision.status,decision.score,report);
        results.push({episodeId:row.episode_id,episodeKey:row.episode_key,status:decision.status,score:decision.score,inspected:inspections.length,costUsd:Math.round(totalCost*1e6)/1e6});
      }catch(error){
        const message=error instanceof Error?error.message:String(error);
        await persistQuality(row,'blocked',0,{passed:false,status:'blocked',score:0,issues:[message],error:message,model}).catch(()=>{});
        results.push({episodeId:row.episode_id,episodeKey:row.episode_key,status:'blocked',error:message});
      }finally{await rm(work,{recursive:true,force:true});}
    }
    console.log(JSON.stringify({enabled:true,processed:results.length,model,maxAssets,results},null,2));
  }
} finally {await db.close();}
