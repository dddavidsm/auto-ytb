import { NodePostgresSqlClient } from '../packages/runtime-node/index.mjs';
import { extractCreativeFingerprint } from '@auto-ytb/analytics';
import { planScenes } from '@auto-ytb/production';

const arg=(name)=>process.argv.find((value)=>value.startsWith(`--${name}=`))?.slice(name.length+3);
const req=(name)=>{const value=process.env[name]?.trim();if(!value)throw new Error(`${name} is required`);return value;};
const productionRunId=arg('production-run-id');if(!productionRunId)throw new Error('Use --production-run-id=<uuid>');
const db=new NodePostgresSqlClient(req('DATABASE_URL'),{ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined});

try{
  const row=(await db.query(`
    select pr.id,pr.metadata,ci.working_title,ci.opportunity_id,o.topic_id,t.canonical_name as topic,
      p.id as publication_id,p.channel_id,p.content_format,p.metadata as publication_metadata,
      s.script,s.language,
      q.report as qa_report
    from production_runs pr
    join content_ideas ci on ci.id=pr.content_idea_id
    left join opportunities o on o.id=ci.opportunity_id
    left join topics t on t.id=o.topic_id
    left join publications p on p.production_run_id=pr.id
    left join lateral (select script,language from scripts x where x.content_idea_id=ci.id order by version desc,created_at desc limit 1) s on true
    left join lateral (select report from qa_reports qx where qx.production_run_id=pr.id order by created_at desc limit 1) q on true
    where pr.id=$1 limit 1`,[productionRunId])).rows[0];
  if(!row?.script)throw new Error(`No persisted script for production run ${productionRunId}`);
  const packaging=(await db.query(`select variant_key as id,title,thumbnail_concept as "thumbnailConcept",payload from packaging_variants where content_idea_id=(select content_idea_id from production_runs where id=$1) order by variant_key`,[productionRunId])).rows.map((item)=>({...item.payload,id:item.id,title:item.title,thumbnailConcept:item.thumbnailConcept}));
  const executionPlan=row.metadata?.executionPlan??row.publication_metadata?.executionPlan??row.qa_report?.executionPlan??null;
  const contentArchetype=row.metadata?.contentArchetype??row.publication_metadata?.contentArchetype??row.qa_report?.contentArchetype??null;
  const targetSceneDurationSec=Number(executionPlan?.targetSceneDurationSec??row.metadata?.productionProfile?.targetSceneDurationSec??10);
  const planned=planScenes(row.script,{targetSceneDurationSec,visualMode:executionPlan?.visualMode,generativeSpendBias:executionPlan?.generativeSpendBias,realityMode:executionPlan?.realityMode,cameraProfile:executionPlan?.cameraProfile});
  const assets=(await db.query(`select scene_id,generated,metadata from production_assets where production_run_id=$1 and scene_id is not null and scene_id not like 'thumbnail:%'`,[productionRunId])).rows;
  const assetByScene=new Map(assets.map((asset)=>[String(asset.scene_id),asset]));
  const scenes=planned.map((scene)=>{const asset=assetByScene.get(scene.id);return asset?{...scene,kind:asset.metadata?.kind??scene.kind,generated:Boolean(asset.generated),visualValue:asset.metadata?.visualValue??scene.visualValue,selectionReason:asset.metadata?.selectionReason??scene.selectionReason}:scene;});
  const selectedPackagingId=String(row.publication_metadata?.selectedPackagingId??row.metadata?.packagingSelection?.selectedPackagingId??row.metadata?.packagingSelection?.selected?.id??packaging[0]?.id??'');
  const attentionScore=Number(row.qa_report?.attention?.score??row.qa_report?.checks?.find?.((check)=>check.id==='attention-readiness')?.score??0)||undefined;
  const contentFormat=String(row.content_format??row.metadata?.contentFormat??'LONG_HORIZONTAL');
  const fingerprint=extractCreativeFingerprint({contentFormat,script:row.script,scenes,packaging,selectedPackagingId,attentionScore,contentArchetype,executionPlan});
  await db.query(`insert into creative_fingerprints (production_run_id,channel_id,publication_id,content_format,language,topic,attention_score,hook_type,hook_retention_device,narrative_archetype,beat_count,scene_count,visual_mix,packaging,fingerprint,updated_at)
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15::jsonb,now())
    on conflict (production_run_id) do update set channel_id=excluded.channel_id,publication_id=excluded.publication_id,content_format=excluded.content_format,language=excluded.language,topic=excluded.topic,attention_score=excluded.attention_score,hook_type=excluded.hook_type,hook_retention_device=excluded.hook_retention_device,narrative_archetype=excluded.narrative_archetype,beat_count=excluded.beat_count,scene_count=excluded.scene_count,visual_mix=excluded.visual_mix,packaging=excluded.packaging,fingerprint=excluded.fingerprint,updated_at=now()`,[productionRunId,row.channel_id??null,row.publication_id??null,contentFormat,row.language??row.script.language??null,row.topic??row.working_title??null,attentionScore??null,fingerprint.hookType,fingerprint.hookRetentionDevice,fingerprint.narrativeArchetype,fingerprint.beatCount,fingerprint.sceneCount,JSON.stringify(fingerprint.visualMix),JSON.stringify(fingerprint.selectedPackaging??{}),JSON.stringify(fingerprint)]);
  console.log(JSON.stringify({productionRunId,publicationId:row.publication_id??null,contentFormat,contentArchetype:fingerprint.contentArchetype,attentionScore:attentionScore??null,hook:fingerprint.hookRetentionDevice,narrativeArchetype:fingerprint.narrativeArchetype,scenes:fingerprint.sceneCount,visualMix:fingerprint.visualMix},null,2));
}finally{await db.close();}
