import { NextResponse } from 'next/server';
import { createUniversalProductionGraph } from '@auto-ytb/production';
import { currentSession } from '../../../../lib/auth';
import { transaction } from '../../../../lib/db';

export const runtime = 'nodejs';

function inferFormat(prompt: string) {
  const text = prompt.toLowerCase();
  if (/short|vertical|tiktok|reel|shorts/.test(text)) return 'SHORT_VERTICAL';
  return 'LONG_HORIZONTAL';
}

function safeText(value: unknown, fallback: string, max: number) {
  const text = typeof value === 'string' ? value.trim() : '';
  return (text || fallback).slice(0, max);
}

export async function POST(request: Request) {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
  if (prompt.length < 8) return NextResponse.json({ error: 'Describe el vídeo que quieres crear.' }, { status: 400 });

  const requestedFormat = typeof body?.format === 'string' ? body.format.toUpperCase() : '';
  const opportunityId = safeText(body?.opportunityId, '', 80);
  const contentFormat = ['SHORT_VERTICAL', 'SHORT_HORIZONTAL', 'LONG_HORIZONTAL'].includes(requestedFormat) ? requestedFormat : inferFormat(prompt);
  const requestedMode = safeText(body?.productionMode, 'AUTO', 40).toUpperCase();
  const sourceMode = safeText(body?.sourceMode, requestedMode, 40).toUpperCase();
  const visualStyle = safeText(body?.visualStyle, 'documentary', 80);
  // AUTO-YTB is a video product: never accept a request that silently permits
  // stills, slides or generated-image filler inside the final video.
  const videoOnly = true;
  const aspectRatio = contentFormat === 'SHORT_VERTICAL' ? '9:16' : '16:9';
  const durationSec = Math.max(10, Math.min(3600, Math.round(Number(body?.durationSec) || (contentFormat === 'SHORT_VERTICAL' ? 45 : 180))));
  const qualityMode = safeText(body?.qualityMode, 'MAX_QUALITY', 40).toUpperCase();
  const briefId = `brief-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const jobKey = `ui-production:${briefId}`;
  const topic = prompt.slice(0, 240);
  const workingTitle = prompt.slice(0, 180);
  const opportunitySignals = { source: 'control-plane-ui', userPrompt: prompt, requestedMode, sourceMode, visualStyle, aspectRatio, durationSec, qualityMode, videoOnly };
  const formatRecommendation = { primary: contentFormat, scores: { LONG_HORIZONTAL: contentFormat === 'LONG_HORIZONTAL' ? 100 : 0, SHORT_VERTICAL: contentFormat === 'SHORT_VERTICAL' ? 100 : 0 }, reason: 'Explicit control-plane request' };
  const graph = createUniversalProductionGraph([contentFormat, 'PACKAGING', 'ANALYTICS']);

  try {
    const queued = await transaction(async (client) => {
      const channel = (await client.query(`select id,channel_key,credentials_ref,config_path from channels where is_owned=true and automation_enabled=true and lifecycle_state='ready' order by updated_at desc limit 1`)).rows[0];
      if (!channel) throw new Error('No hay ningún canal propio listo para producir. Configura primero un canal en el control plane.');
      let opportunity;
      let productionTopic = topic;
      let productionAngle = prompt;
      let productionFormat = contentFormat;
      if (opportunityId) {
        opportunity = (await client.query(`select o.id,o.topic_id,o.angle,o.recommended_format,o.signals from opportunities o where o.id=$1 for update`, [opportunityId])).rows[0];
        if (opportunity?.topic_id) {
          const topicRow = (await client.query(`select canonical_name from topics where id=$1`, [opportunity.topic_id])).rows[0];
          opportunity.canonical_name = topicRow?.canonical_name ?? null;
        }
        if (!opportunity) throw new Error('La idea seleccionada ya no existe.');
        productionTopic = String(opportunity.canonical_name || prompt).slice(0, 240);
        productionAngle = String(opportunity.angle || prompt).slice(0, 1200);
        if (!requestedFormat && (opportunity.recommended_format === 'SHORT_VERTICAL' || opportunity.recommended_format === 'LONG_HORIZONTAL')) productionFormat = opportunity.recommended_format;
      } else {
        const topicRow = (await client.query(`insert into topics (canonical_name,niche,language) values ($1,$2,'en') on conflict (canonical_name) do update set niche=coalesce(excluded.niche,topics.niche) returning id`, [topic, 'control-plane-request'])).rows[0];
        opportunity = (await client.query(`insert into opportunities (topic_id,angle,status,score,grade,decision,signals,risks,rationale,expires_at,recommended_format) values ($1,$2,'approved',100,'A',$3,$4::jsonb,'{}'::jsonb,$5::jsonb,now()+interval '7 days',$6) returning id`, [topicRow.id, prompt, 'PRODUCE', JSON.stringify(opportunitySignals), JSON.stringify(['Solicitado desde la interfaz de AUTO-YTB']), productionFormat])).rows[0];
      }
      const seriesProfile = opportunity.signals?.ideaLab?.seriesProfile ?? null;
      const ideaFormat = seriesProfile ? 'series' : productionFormat === 'SHORT_VERTICAL' ? 'short' : 'long';
      const idea = (await client.query(`insert into content_ideas (opportunity_id,format,working_title,premise,target_viewer,hook_hypothesis,status) values ($1,$2,$3,$4,$5,$6,'approved') returning id`, [opportunity.id, ideaFormat, workingTitle, productionAngle, seriesProfile?.ageRange || 'Defined by the control-plane request', seriesProfile?.episodeEngine || 'Open with the strongest concrete promise from the requested brief'])).rows[0];
       const fastTrack = productionFormat === 'SHORT_VERTICAL' && requestedMode !== 'GENERATIVE';
       // Interactive production must not wait behind scheduled market/analytics work
       // or an older autonomous production. The worker still keeps one render at a
       // time, but this priority makes the next user request deterministic.
       // The database intentionally constrains priorities to 0..100. Keep the
       // interactive fast track at the ceiling instead of writing an invalid
       // value that makes the whole request fail before it can be queued.
       const jobPriority = fastTrack ? 100 : 85;
      const payload = { topic: productionTopic, angle: productionAngle, channelId: channel.id, channelKey: channel.channel_key, channelConfigPath: channel.config_path || 'config/channels/future-tech-business.example.json', credentialsRef: channel.credentials_ref || 'PRIMARY', budgetDate: new Date().toISOString().slice(0, 10), score: 100, productionPriority: jobPriority, learningBoost: 0, reservedCostUsd: 0, contentFormat: productionFormat, formatRecommendation: { ...formatRecommendation, primary: productionFormat }, derivativeStrategy: 'NONE', styleFingerprint: { source: 'control-plane-ui', format: productionFormat, visualStyle, sourceMode }, brandContext: {}, seriesContext: seriesProfile ? { ...seriesProfile, seriesKey: String(seriesProfile.seriesName || workingTitle).slice(0, 120), automationProfileVersion: 'idea-lab-v1' } : null, ui: { briefId, requestedMode, sourceMode, visualStyle, aspectRatio, durationSec, qualityMode, videoOnly, prompt, opportunityId: opportunity.id, fastTrack } };
       const job = (await client.query(`insert into jobs (job_key,kind,channel_id,opportunity_id,state,priority,max_attempts,payload) values ($1,'produce_opportunity',$2,$3,'queued',$4,$5,$6::jsonb) returning id,state,created_at`, [jobKey, channel.id, opportunity.id, jobPriority, Math.max(1, Math.min(20, Number(process.env.JOB_MAX_ATTEMPTS || 4))), JSON.stringify(payload)])).rows[0];
      await client.query(`insert into job_events (job_id,event_type,detail) values ($1,'ui_request_queued',$2::jsonb)`, [job.id, JSON.stringify({ briefId, opportunityId: opportunity.id, contentIdeaId: idea.id, channelKey: channel.channel_key })]);
      return { job, channelKey: channel.channel_key };
    });
    return NextResponse.json({ ok: true, runId: `ui-${briefId}`, jobId: queued.job.id, pipeline: 'AUTONOMOUS_PRODUCTION_CANONICAL', requestedMode, artifactRoot: null, status: queued.job.state, brief: { briefId, prompt, format: contentFormat, channelKey: queued.channelKey, durationSec, qualityMode, productionMode: requestedMode, createdAt: new Date().toISOString() }, graph, quote: { qualityMode, durationSec, format: contentFormat, knownPaidCostUsd: 0, note: requestedMode === 'GENERATIVE' ? 'Modo generativo habilitado: el coste real de Gemini/Veo se registra por proveedor cuando el worker ejecuta el trabajo.' : 'El coste real se registra por proveedor cuando el worker ejecuta el trabajo.' }, progress: ['BRIEF_ACCEPTED', 'FORMAT_SELECTED', 'JOB_PERSISTED', 'WORKER_PENDING'] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo crear la producción.';
    console.error('[production/brief]', message);
    return NextResponse.json({ error: message }, { status: message.startsWith('No hay ningún canal') ? 409 : 500 });
  }
}
