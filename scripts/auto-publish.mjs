import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { decideAutonomousPublication } from '@auto-ytb/os';
import { NodePostgresSqlClient } from '../packages/runtime-node/index.mjs';
import { auditFinalManifestReleaseSafety } from './lib/release-safety.mjs';

const arg=(name,fallback)=>process.argv.find((value)=>value.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
const req=(name)=>{const value=process.env[name]?.trim();if(!value)throw new Error(`${name} is required`);return value;};
const finite=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
const productionRunId=arg('production-run-id');if(!productionRunId)throw new Error('Use --production-run-id=<uuid>');
const configPath=resolve(arg('channel-config','config/channels/future-tech-business.example.json'));
const channel=JSON.parse(await readFile(configPath,'utf8'));const publishing=channel.publishing??{};const credentialsRef=String(channel.credentialsRef??process.env.CHANNEL_CREDENTIALS_REF??'PRIMARY');
const db=new NodePostgresSqlClient(req('DATABASE_URL'),{ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined});

try{
  const row=(await db.query(`select p.id as publication_id,p.youtube_video_id,p.state,q.score::float as qa_score,q.blockers,q.report,r.research_confidence::float as research_confidence,pr.total_cost_usd::float as total_cost_usd,pr.state as production_state,pr.metadata as production_metadata from production_runs pr left join publications p on p.production_run_id=pr.id left join lateral (select score,blockers,report from qa_reports where production_run_id=pr.id order by created_at desc limit 1) q on true left join content_ideas ci on ci.id=pr.content_idea_id left join lateral (select research_confidence from research_dossiers rd where rd.opportunity_id=ci.opportunity_id order by rd.created_at desc limit 1) r on true where pr.id=$1`,[productionRunId])).rows[0];
  if(!row)throw new Error(`Production run ${productionRunId} not found`);
  const rights=await db.query(`select id from production_assets where production_run_id=$1 and provider='source-backed-direct' and (license is null or license='verify-before-public')`,[productionRunId]);
  const seriesEpisode=(await db.query(`select se.id,se.episode_key,se.continuity_status,se.memory_compiled_at,s.series_key,s.title as series_title from series_episodes se join series s on s.id=se.series_id where se.production_run_id=$1 limit 1`,[productionRunId])).rows[0]??null;
  const seriesContinuity=seriesEpisode?{required:true,passed:seriesEpisode.continuity_status==='passed'&&Boolean(seriesEpisode.memory_compiled_at),episodeId:seriesEpisode.id,episodeKey:seriesEpisode.episode_key,seriesKey:seriesEpisode.series_key,seriesTitle:seriesEpisode.series_title,status:seriesEpisode.continuity_status,memoryCompiledAt:seriesEpisode.memory_compiled_at??null}:{required:false,passed:true};
  const manifestPath=resolve(process.env.LOCAL_STORAGE_ROOT||'.data/storage','projects',productionRunId,'manifest.json');
  let manifest=null,manifestReadError=null;
  try{manifest=JSON.parse(await readFile(manifestPath,'utf8'));}catch(error){manifestReadError=error instanceof Error?error.message:String(error);}
  const manifestRights=(manifest?.assets??[]).filter((asset)=>asset.provider==='source-backed-direct'&&(!asset.license||asset.license==='verify-before-public')).length;
  const unresolvedRights=Math.max(rights.rows.length,manifestRights);
  const releaseSafety=manifest
    ? auditFinalManifestReleaseSafety(manifest,channel)
    : {passed:false,audioReady:false,brandReady:false,issues:[`Final manifest unavailable: ${manifestReadError??'unknown error'}`],warnings:[],audio:{cueCount:0,rightsReady:false},brand:{required:false,generatedAssetCount:0,compliantAssetCount:0,continuityKey:null}};
  const checks=Array.isArray(row.report?.checks)?row.report.checks:[];
  const policyWarnings=checks.filter((check)=>check?.status==='WARN'&&['policy','advertiser-friendly','synthetic-disclosure'].includes(check?.id)).length;
  const attention=row.report?.attention??row.production_metadata?.attention??null;
  const finalInspection=row.report?.finalInspection??row.production_metadata?.finalInspection??null;
  const minimumAttentionScore=finite(publishing.minimumAttentionScoreForAutoPublish,Math.max(86,finite(process.env.MIN_ATTENTION_SCORE,86)));
  const minimumFinalMediaScore=finite(publishing.minimumFinalMediaScoreForAutoPublish,90);
  const maximumAutoPublishCostUsd=finite(publishing.maximumAutoPublishCostUsd,finite(channel.maxProductionCostUsd,finite(process.env.MAX_PRODUCTION_COST_USD,25)));

  const policy={
    autonomyMode:publishing.autonomyMode==='FULL_AUTONOMOUS'?'FULL_AUTONOMOUS':'REVIEW_REQUIRED',
    allowAutomaticPublicScheduling:Boolean(publishing.allowAutomaticPublicScheduling),
    minimumQaScoreForAutoPublish:Number(publishing.minimumQaScoreForAutoPublish??88),
    minimumResearchConfidenceForAutoPublish:Number(publishing.minimumResearchConfidenceForAutoPublish??78),
    minimumAttentionScoreForAutoPublish:minimumAttentionScore,
    minimumFinalMediaScoreForAutoPublish:minimumFinalMediaScore,
    maximumAutoPublishCostUsd,
    blockOnUnresolvedRights:publishing.blockOnUnresolvedRights!==false,
    blockOnPolicyWarning:publishing.blockOnPolicyWarning!==false,
    autoPublishDelayMinutes:Number(publishing.autoPublishDelayMinutes??30),
  };
  const releaseBlockers=releaseSafety.passed?[]:releaseSafety.issues.map((issue)=>`release-safety: ${issue}`);
  if(seriesContinuity.required&&!seriesContinuity.passed)releaseBlockers.push(`series-continuity: ${seriesContinuity.seriesKey}/${seriesContinuity.episodeKey} memory is ${seriesContinuity.status} and must be compiled/passed before public scheduling`);
  const context={
    qaScore:Number(row.qa_score??0),researchConfidence:Number(row.research_confidence??0),qaBlockers:[...(row.blockers??[]),...releaseBlockers],
    attentionScore:finite(attention?.score,0),attentionReady:attention?.ready===true,
    finalMediaScore:finite(finalInspection?.score,0),finalMediaPassed:finalInspection?.passed===true,
    totalCostUsd:finite(row.total_cost_usd,0),productionState:row.production_state,
    unresolvedRights,policyWarnings,youtubeVideoId:row.youtube_video_id,
  };
  const decision=decideAutonomousPublication(policy,context);
  const gateSnapshot={...context,maximumAutoPublishCostUsd,minimumAttentionScore,minimumFinalMediaScore,minimumQaScore:policy.minimumQaScoreForAutoPublish,minimumResearchConfidence:policy.minimumResearchConfidenceForAutoPublish,releaseSafety,seriesContinuity};

  if(decision.action==='SCHEDULE'&&row.publication_id&&decision.publishAt){
    const jobKey=`schedule-publication:${row.publication_id}:${decision.publishAt}`;
    const payload={publicationId:row.publication_id,publishAt:decision.publishAt,source:'full-autonomous',credentialsRef,channelKey:channel.channelKey??channel.id,gateSnapshot};
    const inserted=await db.query(`insert into jobs (job_key,kind,state,priority,max_attempts,payload) values ($1,'schedule_publication','queued',98,4,$2::jsonb) on conflict (job_key) do nothing returning id`,[jobKey,JSON.stringify(payload)]);
    if(inserted.rows[0])await db.query(`insert into job_events (job_id,event_type,detail) values ($1,'autonomous_publish_scheduled',$2::jsonb)`,[inserted.rows[0].id,JSON.stringify({productionRunId,publicationId:row.publication_id,publishAt:decision.publishAt,reasons:decision.reasons,credentialsRef,gateSnapshot})]);
    await db.query(`update production_runs set metadata=metadata||$2::jsonb,updated_at=now() where id=$1`,[productionRunId,JSON.stringify({autonomousPublication:{...decision,evaluatedAt:new Date().toISOString(),credentialsRef,gateSnapshot}})]);
    console.log(JSON.stringify({...decision,jobId:inserted.rows[0]?.id??null,productionRunId,publicationId:row.publication_id,credentialsRef,gateSnapshot},null,2));
  }else{
    await db.query(`update production_runs set metadata=metadata||$2::jsonb,updated_at=now() where id=$1`,[productionRunId,JSON.stringify({autonomousPublication:{...decision,evaluatedAt:new Date().toISOString(),credentialsRef,gateSnapshot}})]);
    console.log(JSON.stringify({...decision,productionRunId,publicationId:row.publication_id??null,credentialsRef,gateSnapshot},null,2));
  }
} finally {await db.close();}
