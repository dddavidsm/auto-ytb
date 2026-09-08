import { buildSeriesContinuityContext, deriveSeriesFingerprint, routeContentToSeries, seriesCandidateKey } from '@auto-ytb/os';

const arr=(value)=>Array.isArray(value)?value:[];
const obj=(value)=>value&&typeof value==='object'?value:{};
const text=(value,fallback='')=>String(value??fallback).trim();
const num=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;

function characterFromRow(row){
  const spec=obj(row.specification);
  return {
    key:text(row.character_key),name:text(row.name),role:text(row.role)||undefined,continuityKey:text(row.continuity_key),
    invariantFeatures:arr(spec.invariantFeatures).map(String),personalityTraits:arr(spec.personalityTraits).map(String),speechRules:arr(spec.speechRules).map(String),
    wardrobeRules:arr(spec.wardrobeRules).map(String),forbiddenChanges:arr(spec.forbiddenChanges).map(String),voiceProfile:obj(row.voice_profile),canonicalReferenceUri:row.canonical_reference_uri??null,
  };
}
function styleFromRow(row){
  const spec=obj(row.specification);
  return {
    key:text(row.style_key),name:text(row.name),continuityKey:text(row.continuity_key),invariantFeatures:arr(spec.invariantFeatures).map(String),palette:arr(spec.palette).map(String),
    compositionRules:arr(spec.compositionRules).map(String),motionRules:arr(spec.motionRules).map(String),forbiddenChanges:arr(spec.forbiddenChanges).map(String),canonicalReferenceUri:row.canonical_reference_uri??null,
  };
}
function memoryFromRow(row){return{type:text(row.memory_type),key:text(row.memory_key),importance:num(row.importance,50),canonical:row.canonical!==false,active:row.active!==false,payload:obj(row.payload)};}

export async function loadSeriesRegistry(db,channelId){
  const rows=(await db.query(`select s.*,b.id as bible_id,b.version as bible_version,b.continuity_key as bible_continuity_key,b.bible,b.validation
    from series s join lateral (select * from series_bibles x where x.series_id=s.id and x.status='active' order by x.version desc limit 1) b on true
    where s.channel_id=$1 and s.lifecycle_state='active' and s.automation_enabled=true order by s.updated_at desc`,[channelId])).rows;
  const registry=[];
  for(const row of rows){
    const [characters,styles,memories,nextEpisode]=await Promise.all([
      db.query(`select * from series_characters where series_id=$1 and status='active' order by created_at`,[row.id]),
      db.query(`select * from series_styles where series_id=$1 and status='active' order by created_at`,[row.id]),
      db.query(`select * from series_episode_memory where series_id=$1 and active=true and canonical=true order by importance desc,created_at desc limit 30`,[row.id]),
      db.query(`select coalesce(max(episode_number),0)+1 as next_episode from series_episodes where series_id=$1 and season_number=1`,[row.id]),
    ]);
    const bible=obj(row.bible),identity=obj(row.identity),formatStrategy=obj(row.format_strategy);
    const characterRows=characters.rows.map(characterFromRow),styleRows=styles.rows.map(styleFromRow);
    registry.push({
      row,
      bible,
      characters:characterRows,
      styles:styleRows,
      memories:memories.rows.map(memoryFromRow),
      nextEpisodeNumber:Math.max(1,Math.floor(num(nextEpisode.rows[0]?.next_episode,1))),
      profile:{
        seriesId:row.id,seriesKey:text(row.series_key),channelId:row.channel_id,title:text(row.title),language:text(row.language,'en'),audienceMode:row.audience_mode==='MADE_FOR_KIDS'?'MADE_FOR_KIDS':'GENERAL',
        targetAgeMin:row.target_age_min==null?null:num(row.target_age_min),targetAgeMax:row.target_age_max==null?null:num(row.target_age_max),
        themes:arr(identity.themes).length?arr(identity.themes).map(String):arr(bible.themes).map(String),
        styleTags:arr(identity.styleTags).length?arr(identity.styleTags).map(String):styleRows.flatMap((style)=>[style.name,...style.invariantFeatures]).slice(0,18),
        formats:arr(formatStrategy.formats).length?arr(formatStrategy.formats).map(String):['LONG_HORIZONTAL','SHORT_VERTICAL'],
        characterMode:characterRows.length?'persistent-character':'none',characterNames:characterRows.map((character)=>character.name),enabled:true,
      },
    });
  }
  return registry;
}

async function reserveEpisode(db,entry,contextSeed){
  return db.transaction(async(tx)=>{
    await tx.query(`select id from series where id=$1 for update`,[entry.row.id]);
    const next=(await tx.query(`select coalesce(max(episode_number),0)+1 as next_episode from series_episodes where series_id=$1 and season_number=1`,[entry.row.id])).rows[0];
    const episodeNumber=Math.max(1,Math.floor(num(next?.next_episode,1)));
    const episodeKey=`s01e${String(episodeNumber).padStart(3,'0')}`;
    const continuityContext=buildSeriesContinuityContext({profile:entry.profile,bible:entry.bible,bibleVersion:num(entry.row.bible_version,1),continuityKey:text(entry.row.bible_continuity_key||entry.row.continuity_key),characters:entry.characters,styles:entry.styles,memories:entry.memories,seasonNumber:1,episodeNumber});
    const inserted=(await tx.query(`insert into series_episodes (series_id,bible_version_id,season_number,episode_number,episode_key,premise,status,continuity_snapshot)
      values ($1,$2,1,$3,$4,$5,'planned',$6::jsonb) returning id`,[entry.row.id,entry.row.bible_id,episodeNumber,episodeKey,contextSeed.topic,JSON.stringify(continuityContext)])).rows[0];
    return{seriesEpisodeId:inserted.id,continuityContext};
  });
}

export async function routeOpportunityToSeries({db,channelId,channelConfig,row,contentFormat,maxAttempts=4}){
  const registry=await loadSeriesRegistry(db,channelId);
  const topic=text(row.canonical_name||row.angle||row.topic||'Untitled');
  const fingerprint=deriveSeriesFingerprint({language:row.language??channelConfig.language??'en',topic,format:contentFormat,channelThemes:arr(channelConfig.themes).map(String),channelStyleTags:arr(channelConfig.styleTags).map(String),signals:obj(row.signals)});
  const decision=routeContentToSeries(fingerprint,registry.map((entry)=>entry.profile));
  if(decision.mode==='EXISTING_SERIES'&&decision.seriesId){
    const entry=registry.find((candidate)=>candidate.row.id===decision.seriesId);
    if(!entry)throw new Error(`Series ${decision.seriesId} routed but not loaded`);
    const reserved=await reserveEpisode(db,entry,{topic});
    return{mode:'EXISTING_SERIES',decision,fingerprint,seriesId:entry.row.id,seriesKey:entry.row.series_key,seriesEpisodeId:reserved.seriesEpisodeId,seriesContext:reserved.continuityContext};
  }
  if(decision.mode==='NEW_SERIES_CANDIDATE'){
    const candidateKey=seriesCandidateKey(fingerprint);
    const proposedTitle=fingerprint.characterName?`${fingerprint.characterName} Stories`:`${fingerprint.themes.slice(0,3).map((value)=>value.charAt(0).toUpperCase()+value.slice(1)).join(' ')} Series`;
    const result=await db.query(`insert into series_candidates (channel_id,source_opportunity_id,candidate_key,proposed_title,language,audience_mode,target_age_min,target_age_max,style_fingerprint,character_spec,rationale,route_score,opportunity_score,status)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12,$13,'discovered')
      on conflict (channel_id,candidate_key) do update set source_opportunity_id=excluded.source_opportunity_id,style_fingerprint=excluded.style_fingerprint,character_spec=excluded.character_spec,rationale=excluded.rationale,route_score=greatest(series_candidates.route_score,excluded.route_score),opportunity_score=greatest(series_candidates.opportunity_score,excluded.opportunity_score),updated_at=now()
      returning id,status`,[channelId,row.id,candidateKey,proposedTitle,fingerprint.language,fingerprint.audienceMode,fingerprint.targetAgeMin??null,fingerprint.targetAgeMax??null,JSON.stringify(fingerprint),JSON.stringify({characterMode:fingerprint.characterMode,characterName:fingerprint.characterName}),JSON.stringify(decision.rationale),decision.routeScore,num(row.score)]);
    const candidate=result.rows[0];
    const jobKey=`bootstrap-series:${candidate.id}`;
    const queued=await db.query(`insert into jobs (job_key,kind,channel_id,opportunity_id,state,priority,max_attempts,payload)
      values ($1,'bootstrap_series',$2,$3,'queued',86,$4,$5::jsonb) on conflict (job_key) do nothing returning id`,[jobKey,channelId,row.id,maxAttempts,JSON.stringify({candidateId:candidate.id,candidateKey,sourceOpportunityId:row.id,channelId,channelKey:channelConfig.channelKey,channelConfigPath:channelConfig.__path,fingerprint,proposedTitle})]);
    if(queued.rows[0])await db.query(`update series_candidates set status='bootstrap_queued',updated_at=now() where id=$1`,[candidate.id]);
    return{mode:'NEW_SERIES_CANDIDATE',decision,fingerprint,candidateId:candidate.id,candidateKey,jobId:queued.rows[0]?.id??null};
  }
  return{mode:'STANDALONE',decision,fingerprint,seriesId:null,seriesContext:null};
}

export function mergeSeriesIntoBrandContext(brandContext,seriesContext){
  if(!seriesContext)return brandContext;
  const references=[...new Set([...(brandContext?.referenceUris??[]),...(seriesContext.referenceUris??[])])].slice(0,8);
  return{
    ...(brandContext??{}),
    required:Boolean(brandContext?.required||seriesContext.required),
    referenceUris:references,
    styleGuidance:[brandContext?.styleGuidance,seriesContext.visualGuidance].filter(Boolean).join(' '),
    seriesKey:seriesContext.seriesKey,
    seriesContinuityKey:seriesContext.continuityKey,
    seriesBibleVersion:seriesContext.bibleVersion,
    seriesEpisodeKey:seriesContext.episodeKey,
  };
}
