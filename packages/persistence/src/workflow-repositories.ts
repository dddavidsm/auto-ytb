import type { SqlClient } from './sql.js';

export class ResearchRepository {
  constructor(private readonly db: SqlClient) {}
  async create(input: { opportunityId?: string | null; topic:string; researchConfidence:number; executiveSummary:string; blockingIssues:string[]; dossier:unknown }):Promise<string> {
    const r=await this.db.query<{id:string}>(`insert into research_dossiers (opportunity_id,topic,research_confidence,executive_summary,blocking_issues,dossier) values ($1,$2,$3,$4,$5::jsonb,$6::jsonb) returning id`,[input.opportunityId??null,input.topic,input.researchConfidence,input.executiveSummary,JSON.stringify(input.blockingIssues),JSON.stringify(input.dossier)]);
    if(!r.rows[0]) throw new Error('Research dossier insert returned no row'); return r.rows[0].id;
  }
}

export class ScriptRepository {
  constructor(private readonly db: SqlClient) {}
  async create(input:{contentIdeaId?:string|null;researchDossierId?:string|null;version?:number;language:string;targetDurationSeconds:number;script:unknown}):Promise<string>{
    const r=await this.db.query<{id:string}>(`insert into scripts (content_idea_id,research_dossier_id,version,language,target_duration_seconds,script) values ($1,$2,$3,$4,$5,$6::jsonb) returning id`,[input.contentIdeaId??null,input.researchDossierId??null,input.version??1,input.language,input.targetDurationSeconds,JSON.stringify(input.script)]); if(!r.rows[0]) throw new Error('Script insert returned no row'); return r.rows[0].id;
  }
}

export class ProductionRepository {
  constructor(private readonly db:SqlClient){}
  async createRun(input:{contentIdeaId:string;state:string;totalCostUsd?:number;metadata?:unknown}):Promise<string>{const r=await this.db.query<{id:string}>(`insert into production_runs (content_idea_id,state,total_cost_usd,metadata) values ($1,$2,$3,$4::jsonb) returning id`,[input.contentIdeaId,input.state,input.totalCostUsd??0,JSON.stringify(input.metadata??{})]);if(!r.rows[0])throw new Error('Production run insert returned no row');return r.rows[0].id;}
  async updateRun(id:string,input:{state:string;totalCostUsd?:number;metadata?:unknown}):Promise<void>{await this.db.query(`update production_runs set state=$2,total_cost_usd=coalesce($3,total_cost_usd),metadata=case when $4::jsonb is null then metadata else metadata||$4::jsonb end,updated_at=now() where id=$1`,[id,input.state,input.totalCostUsd??null,input.metadata===undefined?null:JSON.stringify(input.metadata)]);}
  async addAsset(input:{productionRunId:string;sceneId?:string;assetType:string;uri:string;provider?:string;model?:string;generated:boolean;sourceIds?:string[];license?:string;sourceUrl?:string;costUsd?:number;metadata?:unknown}):Promise<string>{const r=await this.db.query<{id:string}>(`insert into production_assets (production_run_id,scene_id,asset_type,uri,provider,model,generated,source_ids,license,source_url,cost_usd,metadata) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12::jsonb) returning id`,[input.productionRunId,input.sceneId??null,input.assetType,input.uri,input.provider??null,input.model??null,input.generated,JSON.stringify(input.sourceIds??[]),input.license??null,input.sourceUrl??null,input.costUsd??0,JSON.stringify(input.metadata??{})]);if(!r.rows[0])throw new Error('Production asset insert returned no row');return r.rows[0].id;}
  async addQaReport(input:{productionRunId:string;passed:boolean;score:number;containsSyntheticMedia:boolean;blockers:string[];report:unknown}):Promise<string>{const r=await this.db.query<{id:string}>(`insert into qa_reports (production_run_id,passed,score,contains_synthetic_media,blockers,report) values ($1,$2,$3,$4,$5::jsonb,$6::jsonb) returning id`,[input.productionRunId,input.passed,input.score,input.containsSyntheticMedia,JSON.stringify(input.blockers),JSON.stringify(input.report)]);if(!r.rows[0])throw new Error('QA report insert returned no row');return r.rows[0].id;}
}

export class PublicationRepository {
  constructor(private readonly db:SqlClient){}
  async create(input:{productionRunId?:string|null;channelId:string;youtubeVideoId?:string|null;state:'rendered'|'private'|'reviewed'|'scheduled'|'public'|'failed';publishAt?:Date|null;containsSyntheticMedia:boolean;contentFormat?:'LONG_HORIZONTAL'|'SHORT_VERTICAL'|null;metadata?:unknown}):Promise<string>{const r=await this.db.query<{id:string}>(`insert into publications (production_run_id,channel_id,youtube_video_id,state,publish_at,contains_synthetic_media,content_format,metadata) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) returning id`,[input.productionRunId??null,input.channelId,input.youtubeVideoId??null,input.state,input.publishAt??null,input.containsSyntheticMedia,input.contentFormat??null,JSON.stringify(input.metadata??{})]);if(!r.rows[0])throw new Error('Publication insert returned no row');return r.rows[0].id;}
  async setState(id:string,state:'rendered'|'private'|'reviewed'|'scheduled'|'public'|'failed',publishAt?:Date|null):Promise<void>{await this.db.query(`update publications set state=$2,publish_at=coalesce($3,publish_at),updated_at=now() where id=$1`,[id,state,publishAt??null]);}
}

export class AnalyticsRepository {
  constructor(private readonly db:SqlClient){}
  async addSnapshot(input:{publicationId:string;capturedAt?:Date;views:number;watchTimeMinutes:number;averageViewDurationSeconds?:number|null;averageViewPercentage?:number|null;likes?:number|null;comments?:number|null;shares?:number|null;subscribersGained?:number|null;revenueUsd?:number|null;trafficSources?:unknown;retention?:Array<{elapsedRatio:number;audienceWatchRatio:number}>}):Promise<number>{
    const r=await this.db.query<{id:number}>(`insert into analytics_snapshots (publication_id,captured_at,views,watch_time_minutes,average_view_duration_seconds,average_view_percentage,likes,comments,shares,subscribers_gained,revenue_usd,traffic_sources) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb) returning id`,[input.publicationId,input.capturedAt??new Date(),input.views,input.watchTimeMinutes,input.averageViewDurationSeconds??null,input.averageViewPercentage??null,input.likes??null,input.comments??null,input.shares??null,input.subscribersGained??null,input.revenueUsd??null,JSON.stringify(input.trafficSources??{})]);if(!r.rows[0])throw new Error('Analytics snapshot insert returned no row');const id=r.rows[0].id;
    for(const point of input.retention??[]) await this.db.query(`insert into retention_points (analytics_snapshot_id,elapsed_ratio,audience_watch_ratio) values ($1,$2,$3)`,[id,point.elapsedRatio,point.audienceWatchRatio]); return id;
  }
  async addLearningSignal(input:{channelId:string;publicationId?:string|null;signalType:string;featureKey:string;featureValue:unknown;strength?:number;observedAt?:Date}):Promise<void>{await this.db.query(`insert into learning_signals (channel_id,publication_id,signal_type,feature_key,feature_value,strength,observed_at) values ($1,$2,$3,$4,$5::jsonb,$6,$7)`,[input.channelId,input.publicationId??null,input.signalType,input.featureKey,JSON.stringify(input.featureValue),input.strength??50,input.observedAt??new Date()]);}
}
