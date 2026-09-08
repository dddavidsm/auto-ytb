import { NodePostgresSqlClient } from '../packages/runtime-node/index.mjs';
import { calculateLearningBoost, candidateKeyForFingerprint, deriveContentStyleFingerprint, rankProductionCandidates, routeContentToChannel } from '@auto-ytb/os';
import { recommendContentFormat } from '@auto-ytb/core';
import { ensureOwnedChannelRows, loadChannelConfigs } from './lib/channel-registry.mjs';

const req=(name)=>{const v=process.env[name]?.trim();if(!v)throw new Error(`${name} is required`);return v;};
const num=(name,fallback)=>{const v=Number(process.env[name]??fallback);if(!Number.isFinite(v))throw new Error(`${name} must be numeric`);return v;};
const clamp=(v)=>Math.max(0,Math.min(100,Number(v??0)));
const minScore=num('AUTO_PRODUCTION_MIN_SCORE',82);
const defaultMaxPerChannel=Math.max(0,Math.floor(num('AUTO_PRODUCTION_MAX_PER_DAY',1)));
const portfolioMaxVideos=Math.max(0,Math.floor(num('PORTFOLIO_MAX_VIDEOS_PER_DAY',3)));
const portfolioDailyBudget=Math.max(0,num('PORTFOLIO_DAILY_BUDGET_USD',num('AUTO_PRODUCTION_DAILY_BUDGET_USD',25)));
const defaultLongReserve=Math.max(0,num('AUTO_PRODUCTION_RESERVED_COST_USD',18));
const defaultShortReserve=Math.max(0,num('AUTO_SHORT_RESERVED_COST_USD',6));
const maxAttempts=Math.max(1,Math.min(20,Math.floor(num('JOB_MAX_ATTEMPTS',4))));
const learningWindowDays=Math.max(14,Math.min(365,Math.floor(num('LEARNING_WINDOW_DAYS',120))));
const discoverNewChannels=process.env.AUTO_CHANNEL_DISCOVERY_ENABLED!=='false';
const newChannelMinScore=Math.max(minScore,num('AUTO_NEW_CHANNEL_MIN_SCORE',90));
const budgetDate=new Date().toISOString().slice(0,10);
const db=new NodePostgresSqlClient(req('DATABASE_URL'),{ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined});

function formatSignals(row){
  const s=row.signals??{}; const explicit=s.formatSignals??{};
  const trend=clamp(s.trendVelocity??s.velocity??50),retention=clamp(s.retentionPotential??60),monetization=clamp(s.monetizationPotential??55),evergreen=clamp(s.evergreenPotential??50),freshness=clamp(s.freshness??50),multi=clamp(s.multiFormatPotential??50),outlier=clamp(s.outlierStrength??50);
  return {narrativeDepth:clamp(explicit.narrativeDepth??Math.round((retention+evergreen)/2)),visualSnackability:clamp(explicit.visualSnackability??Math.round((trend+freshness+outlier)/3)),trendVelocity:clamp(explicit.trendVelocity??trend),searchIntentDepth:clamp(explicit.searchIntentDepth??s.demand??55),repeatability:clamp(explicit.repeatability??multi),monetizationDepth:clamp(explicit.monetizationDepth??monetization),sponsorFit:clamp(explicit.sponsorFit??monetization),shortHookStrength:clamp(explicit.shortHookStrength??Math.round((trend+outlier+freshness)/3)),longRetentionPotential:clamp(explicit.longRetentionPotential??retention),mobileConsumptionFit:clamp(explicit.mobileConsumptionFit??Math.round((trend+freshness+60)/3)),tvConsumptionFit:clamp(explicit.tvConsumptionFit??Math.round((retention+evergreen+55)/3)),kidAudienceFit:clamp(explicit.kidAudienceFit??0),episodicPotential:clamp(explicit.episodicPotential??multi),productionComplexity:clamp(explicit.productionComplexity??50)};
}
function formatRisks(row){const risks=row.risks??{};return {madeForKidsRisk:clamp(risks.madeForKidsRisk??0),copyrightRisk:clamp(risks.copyrightRisk??0),policyRisk:clamp(risks.policyRisk??0),lowEffortRisk:clamp(risks.lowEffortRisk??risks.inauthenticRisk??0)};}
function chooseConcreteFormat(rec){if(rec.primary==='LONG_HORIZONTAL'||rec.primary==='SHORT_VERTICAL')return rec.primary;return rec.scores.LONG_HORIZONTAL>=rec.scores.SHORT_VERTICAL?'LONG_HORIZONTAL':'SHORT_VERTICAL';}
function titleCase(value){return String(value).split(/[-_\s]+/).filter(Boolean).slice(0,4).map((word)=>word.charAt(0).toUpperCase()+word.slice(1)).join(' ');}

async function persistNewChannelCandidate(item,fingerprint,route){
  if(!discoverNewChannels||Number(item.row.score)<newChannelMinScore)return null;
  const candidateKey=candidateKeyForFingerprint(fingerprint);
  const proposedName=fingerprint.characterName||`${titleCase(fingerprint.themes.slice(0,3).join(' '))||'New'} Stories`;
  const positioning=fingerprint.characterName
    ? `English-first channel built around the persistent ${fingerprint.characterName} character and a consistent ${fingerprint.styleTags.join(', ')} identity.`
    : `English-first channel focused on ${fingerprint.themes.slice(0,5).join(', ')} with a consistent ${fingerprint.styleTags.join(', ')} identity.`;
  const result=await db.query(`insert into channel_candidates (candidate_key,source_opportunity_id,language,proposed_name,proposed_positioning,character_mode,character_name,style_fingerprint,proposed_identity,route_score,opportunity_score,status) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,'discovered') on conflict (candidate_key) do update set source_opportunity_id=excluded.source_opportunity_id,style_fingerprint=excluded.style_fingerprint,route_score=greatest(channel_candidates.route_score,excluded.route_score),opportunity_score=greatest(channel_candidates.opportunity_score,excluded.opportunity_score),updated_at=now() returning id,status`,[candidateKey,item.row.id,fingerprint.language,proposedName,positioning,fingerprint.characterMode??'none',fingerprint.characterName??null,JSON.stringify(fingerprint),JSON.stringify({themes:fingerprint.themes,styleTags:fingerprint.styleTags,characterMode:fingerprint.characterMode,characterName:fingerprint.characterName}),route.routeScore,Number(item.row.score)]);
  const candidate=result.rows[0];
  await db.query(`insert into content_routing_decisions (opportunity_id,channel_key,route_score,route_mode,style_fingerprint,rationale) values ($1,$2,$3,'NEW_CHANNEL_CANDIDATE',$4::jsonb,$5::jsonb)`,[item.row.id,candidateKey,route.routeScore,JSON.stringify(fingerprint),JSON.stringify(route.rationale)]);
  const jobKey=`bootstrap-channel-brand:${candidate.id}`;
  const queued=await db.query(`insert into jobs (job_key,kind,state,priority,max_attempts,payload) values ($1,'bootstrap_channel_brand','queued',75,$2,$3::jsonb) on conflict (job_key) do nothing returning id`,[jobKey,maxAttempts,JSON.stringify({candidateId:candidate.id,candidateKey,proposedName,positioning,fingerprint,sourceOpportunityId:item.row.id})]);
  if(queued.rows[0]){
    await db.query(`update channel_candidates set status='brand_queued',updated_at=now() where id=$1`,[candidate.id]);
    await db.query(`insert into job_events (job_id,event_type,detail) values ($1,'channel_candidate_brand_queued',$2::jsonb)`,[queued.rows[0].id,JSON.stringify({candidateId:candidate.id,candidateKey,sourceOpportunityId:item.row.id})]);
  }
  return {candidateId:candidate.id,candidateKey,jobId:queued.rows[0]?.id??null};
}

try{
  const configs=await loadChannelConfigs();
  const registered=await ensureOwnedChannelRows(db,configs,process.env);
  const profiles=registered.map((entry)=>entry.profile);
  const bindingById=new Map(registered.map((entry)=>[entry.row.id,entry]));
  const [result,learningResult,portfolioUsage]=await Promise.all([
    db.query(`select o.id,o.topic_id,o.score::float,o.detected_at,o.expires_at,o.risks,o.signals,o.recommended_format,t.canonical_name,t.niche,t.language,o.angle,o.status,o.decision from opportunities o left join topics t on t.id=o.topic_id where o.score >= $1 and (o.expires_at is null or o.expires_at > now()) and o.status not in ('rejected','produced') and (o.status='approved' or upper(coalesce(o.decision,''))='PRODUCE') and not exists (select 1 from jobs j where j.opportunity_id=o.id and j.kind='produce_opportunity' and j.state not in ('dead','cancelled')) order by o.score desc,o.detected_at desc limit 80`,[minScore]),
    db.query(`select p.channel_id,o.topic_id,p.content_format,count(distinct ls.publication_id)::int as sample_size,avg(case when ls.feature_key='strongHook' then case when ls.feature_value #>> '{}'='true' then 1.0 else 0.0 end end)::float as strong_hook_rate,avg(case when ls.feature_key='averageViewPercentage' then nullif(ls.feature_value #>> '{}','')::numeric end)::float as average_view_percentage,avg(case when ls.feature_key='shareRate' then nullif(ls.feature_value #>> '{}','')::numeric end)::float as share_rate,avg(case when ls.feature_key='economics' then nullif(ls.feature_value->>'roi','')::numeric end)::float as roi from learning_signals ls join publications p on p.id=ls.publication_id join production_runs pr on pr.id=p.production_run_id join content_ideas ci on ci.id=pr.content_idea_id join opportunities o on o.id=ci.opportunity_id where o.topic_id is not null and ls.observed_at >= now()-($1::text || ' days')::interval group by p.channel_id,o.topic_id,p.content_format`,[String(learningWindowDays)]),
    db.query(`select coalesce(sum(reserved_usd+actual_usd),0)::float as used,coalesce(sum(jobs_scheduled),0)::int as jobs from daily_budget_ledger where spend_date=$1::date`,[budgetDate]),
  ]);
  let portfolioBudgetLeft=Math.max(0,portfolioDailyBudget-Number(portfolioUsage.rows[0]?.used??0));
  let portfolioSlots=Math.max(0,portfolioMaxVideos-Number(portfolioUsage.rows[0]?.jobs??0));
  const learningByChannelTopicFormat=new Map(learningResult.rows.map((row)=>[`${row.channel_id}:${row.topic_id}:${row.content_format??'LONG_HORIZONTAL'}`,{sampleSize:Number(row.sample_size??0),strongHookRate:row.strong_hook_rate==null?undefined:Number(row.strong_hook_rate),averageViewPercentage:row.average_view_percentage==null?undefined:Number(row.average_view_percentage),shareRate:row.share_rate==null?undefined:Number(row.share_rate),roi:row.roi==null?undefined:Number(row.roi)}]));

  const routed=[]; const newChannelCandidates=[];
  for(const row of result.rows){
    const recommendation=recommendContentFormat(formatSignals(row),formatRisks(row));
    const contentFormat=row.recommended_format&&row.recommended_format!=='HYBRID'?row.recommended_format:chooseConcreteFormat(recommendation);
    const fingerprint=deriveContentStyleFingerprint({language:row.language??'en',topic:row.canonical_name||row.angle,niche:row.niche,format:contentFormat,signals:row.signals});
    const route=routeContentToChannel(fingerprint,profiles);
    if(route.mode!=='EXISTING_CHANNEL'||!route.channelId){
      const candidate=await persistNewChannelCandidate({row,recommendation,contentFormat},fingerprint,route);
      if(candidate)newChannelCandidates.push({...candidate,opportunityId:row.id,score:Number(row.score)});
      continue;
    }
    const binding=bindingById.get(route.channelId);
    if(!binding)continue;
    await db.query(`insert into content_routing_decisions (opportunity_id,channel_id,channel_key,route_score,route_mode,style_fingerprint,rationale) values ($1,$2,$3,$4,'EXISTING_CHANNEL',$5::jsonb,$6::jsonb)`,[row.id,route.channelId,route.channelKey,route.routeScore,JSON.stringify(fingerprint),JSON.stringify(route.rationale)]);
    if(binding.row.lifecycle_state!=='ready'||binding.row.automation_enabled===false)continue;
    const learning=learningByChannelTopicFormat.get(`${route.channelId}:${row.topic_id}:${contentFormat}`);
    const config=binding.config;
    const reserve=Math.min(Number(config.maxProductionCostUsd??defaultLongReserve),contentFormat==='SHORT_VERTICAL'?defaultShortReserve:defaultLongReserve);
    routed.push({row,recommendation,contentFormat,fingerprint,route,binding,reserve,learningBoost:learning?calculateLearningBoost(learning):0});
  }

  const ranked=rankProductionCandidates(routed.map((item)=>({id:item.row.id,score:Number(item.row.score),detectedAt:new Date(item.row.detected_at).toISOString(),expiresAt:item.row.expires_at?new Date(item.row.expires_at).toISOString():null,riskPenalty:Number(item.row.risks?.totalPenalty??item.row.risks?.riskPenalty??0),expectedCostUsd:item.reserve,learningBoost:item.learningBoost})));
  const scheduled=[];
  for(const candidate of ranked){
    if(portfolioSlots<=0||portfolioBudgetLeft<=0)break;
    const item=routed.find((entry)=>entry.row.id===candidate.id); if(!item)continue;
    const {config,binding}=item.binding; const channelKey=String(config.channelKey);
    const channelDailyBudget=Math.max(0,Number(config.portfolio?.maximumDailyBudgetUsd??portfolioDailyBudget));
    const channelMaxVideos=Math.max(0,Math.floor(Number(config.portfolio?.maximumVideosPerDay??defaultMaxPerChannel)));
    await db.query(`insert into daily_budget_ledger (channel_key,spend_date) values ($1,$2::date) on conflict (channel_key,spend_date) do nothing`,[channelKey,budgetDate]);
    const ledger=(await db.query(`select reserved_usd::float,actual_usd::float,jobs_scheduled from daily_budget_ledger where channel_key=$1 and spend_date=$2::date`,[channelKey,budgetDate])).rows[0]??{reserved_usd:0,actual_usd:0,jobs_scheduled:0};
    const channelBudgetLeft=Math.max(0,channelDailyBudget-Number(ledger.reserved_usd??0)-Number(ledger.actual_usd??0));
    const channelSlots=Math.max(0,channelMaxVideos-Number(ledger.jobs_scheduled??0));
    if(channelSlots<=0||item.reserve>channelBudgetLeft||item.reserve>portfolioBudgetLeft)continue;
    const topic=item.row.canonical_name||item.row.angle; if(!topic)continue;
    const priority=Math.max(0,Math.min(100,Math.round(candidate.productionPriority)));
    const payload={topic,angle:item.row.angle,channelId:item.route.channelId,channelKey,channelConfigPath:config.__path,credentialsRef:config.credentialsRef??'PRIMARY',budgetDate,score:Number(item.row.score),productionPriority:candidate.productionPriority,learningBoost:candidate.learningBoost,reservedCostUsd:item.reserve,contentFormat:item.contentFormat,formatRecommendation:item.recommendation,derivativeStrategy:item.recommendation.derivativeStrategy,styleFingerprint:item.fingerprint};
    const key=`produce-opportunity:${candidate.id}:${channelKey}:${item.contentFormat}`;
    const insert=await db.query(`insert into jobs (job_key,kind,channel_id,opportunity_id,state,priority,max_attempts,payload) values ($1,'produce_opportunity',$2,$3,'queued',$4,$5,$6::jsonb) on conflict (job_key) do nothing returning id`,[key,item.route.channelId,candidate.id,priority,maxAttempts,JSON.stringify(payload)]);
    if(!insert.rows[0])continue;
    await db.query(`update opportunities set status='approved',recommended_format=$2 where id=$1 and status<>'produced'`,[candidate.id,item.recommendation.primary]);
    await db.query(`update channels set last_routed_at=now() where id=$1`,[item.route.channelId]);
    await db.query(`update daily_budget_ledger set reserved_usd=reserved_usd+$3,jobs_scheduled=jobs_scheduled+1,updated_at=now() where channel_key=$1 and spend_date=$2::date`,[channelKey,budgetDate,item.reserve]);
    await db.query(`insert into job_events (job_id,event_type,detail) values ($1,'scheduled',$2::jsonb)`,[insert.rows[0].id,JSON.stringify(payload)]);
    scheduled.push({jobId:insert.rows[0].id,opportunityId:candidate.id,channelKey,topic,contentFormat:item.contentFormat,routeScore:item.route.routeScore,priority,score:candidate.score,learningBoost:candidate.learningBoost,reservedCostUsd:item.reserve});
    portfolioSlots-=1; portfolioBudgetLeft-=item.reserve;
  }
  console.log(JSON.stringify({scheduled:scheduled.length,newChannelCandidates:newChannelCandidates.length,budgetDate,minScore,portfolioDailyBudget,portfolioBudgetLeft,portfolioSlots,jobs:scheduled,channelCandidates:newChannelCandidates},null,2));
} finally {await db.close();}
