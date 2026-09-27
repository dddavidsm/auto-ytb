import { Container, ContainerProxy, getContainer } from '@cloudflare/containers';
import { env } from 'cloudflare:workers';

export { ContainerProxy };

const runtimeVariables = [
  'YOUTUBE_API_KEY', 'YOUTUBE_REGION', 'YOUTUBE_RELEVANCE_LANGUAGE',
  'GEMINI_API_BASE_URL', 'GEMINI_SEARCH_MODEL', 'SEARCH_PROVIDER', 'SEARCH_API_KEY', 'PEXELS_API_KEY', 'PIXABAY_API_KEY',
  'TEXT_MODEL_PROVIDER', 'TEXT_MODEL_RESEARCH', 'TEXT_MODEL_CREATIVE', 'TEXT_MODEL_VISION', 'GEMINI_TEXT_MODEL', 'TEXT_MODEL_API_KEY', 'TEXT_MODEL_BASE_URL',
  'VOICE_PROVIDER', 'VOICE_ID', 'GEMINI_VOICE_ID', 'ELEVENLABS_VOICE_ID', 'ELEVENLABS_VOICE_ID_ES', 'ELEVENLABS_VOICE_ID_EN', 'VOICE_MODEL', 'ELEVENLABS_VOICE_MODEL', 'VOICE_TIMESTAMPS', 'GEMINI_TRANSCRIBE_MODEL', 'VOICE_ALIGNMENT_STRICT', 'VOICE_ALIGNMENT_MIN_COVERAGE', 'VOICE_API_KEY', 'ELEVENLABS_API_KEY',
  'IMAGE_PROVIDER', 'IMAGE_MODEL', 'GEMINI_IMAGE_SIZE', 'IMAGE_API_KEY',
  'VIDEO_PROVIDER', 'VIDEO_MODEL', 'GEMINI_VIDEO_RESOLUTION', 'VIDEO_API_KEY', 'HIGGSFIELD_VIDEO_MODEL', 'HIGGSFIELD_API_BASE_URL', 'HIGGSFIELD_USD_PER_SECOND', 'HF_CREDENTIALS', 'HF_API_KEY_ID', 'HF_API_KEY_SECRET', 'RUNWAY_API_KEY',
  'OBJECT_STORE', 'RENDERER', 'FFMPEG_BIN', 'FFPROBE_BIN', 'LOCAL_STORAGE_ROOT', 'LOCAL_RENDER_ROOT', 'LOCAL_THUMBNAIL_ROOT', 'LOCAL_BRAND_ROOT',
  'MIN_ATTENTION_SCORE', 'MAX_ATTENTION_REVISION_PASSES', 'AUDIO_TARGET_LUFS', 'AUDIO_TRUE_PEAK_DB', 'AUDIO_LOUDNESS_RANGE', 'AUDIO_LIBRARY_MANIFEST', 'AUDIO_MAX_COST_USD_PER_VIDEO', 'AUDIO_MUSIC_ENABLED', 'AUDIO_SFX_ENABLED', 'AUDIO_REQUIRE_ZERO_MARGINAL_COST',
  'CONTENT_LIBRARY_ENABLED', 'CONTENT_LIBRARY_PROVIDER', 'DRIVE_ROOT_FOLDER', 'DRIVE_ROOT_FOLDER_ID', 'DRIVE_CLIENT_ID', 'DRIVE_CLIENT_SECRET', 'DRIVE_REFRESH_TOKEN', 'DRIVE_REDIRECT_URI',
  'YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET', 'YOUTUBE_REFRESH_TOKEN', 'YOUTUBE_CHANNEL_ID', 'YOUTUBE_REDIRECT_URI',
  'MAX_PRODUCTION_COST_USD', 'PRIMARY_CHANNEL_KEY', 'PORTFOLIO_DAILY_BUDGET_USD', 'PORTFOLIO_MAX_VIDEOS_PER_DAY', 'AUTO_CHANNEL_DISCOVERY_ENABLED', 'AUTO_NEW_CHANNEL_MIN_SCORE',
  'SERIES_PILOT_EPISODES', 'SERIES_EPISODE_PLANNER_MAX_NEW', 'SERIES_EPISODE_MIN_CONFIDENCE', 'SERIES_MEMORY_SYNC_LIMIT', 'SERIES_KIDS_QUALITY_SYNC_LIMIT', 'SERIES_PERFORMANCE_MIN_HOURS', 'SERIES_RELEASE_RECHECK_LIMIT', 'SERIES_VISUAL_CONTINUITY_ENABLED', 'SERIES_VISUAL_CONTINUITY_MAX_ASSETS', 'SERIES_VISUAL_MIN_OVERALL', 'SERIES_VISUAL_MIN_CHARACTER', 'SERIES_VISUAL_MIN_STYLE',
  'MARKET_CYCLE_INTERVAL_HOURS', 'MARKET_JOB_PRIORITY', 'MARKET_MAX_QUERIES', 'MARKET_LOOKBACK_DAYS', 'MARKET_CYCLE_MAX_QUERIES', 'MARKET_CYCLE_RECENT_DAYS', 'MARKET_CYCLE_RESULTS_PER_QUERY', 'MARKET_PATTERN_LOOKBACK_DAYS',
  'AUTO_PRODUCTION_MIN_SCORE', 'AUTO_PRODUCTION_MAX_PER_DAY', 'AUTO_PRODUCTION_DAILY_BUDGET_USD', 'AUTO_PRODUCTION_RESERVED_COST_USD', 'AUTO_SHORT_RESERVED_COST_USD', 'LEARNING_WINDOW_DAYS', 'ALLOW_COST_EXPERIMENTS', 'ANALYTICS_SYNC_DAYS', 'ANALYTICS_JOB_PRIORITY', 'SHORT_TO_LONG_MIN_VIEWS', 'SHORT_TO_LONG_MIN_AVP', 'LONG_TO_SHORT_MIN_VIEWS', 'LONG_TO_SHORT_MIN_AVP',
  'JOB_MAX_ATTEMPTS', 'JOB_POLL_MS', 'JOB_STALE_MINUTES', 'JOB_TIMEOUT_MINUTES', 'JOB_RETRY_BASE_MS', 'JOB_RETRY_MAX_MS', 'DISTRIBUTION_PUBLIC_MEDIA_BASE_URL', 'AUTO_YTB_VIDEO_ONLY', 'AUTO_YTB_PRODUCTION_MODE', 'SOURCE_FOOTAGE_MAX_CLIPS', 'AUTO_YTB_SOURCE_CACHE_MIRROR',
];

const productionEnv = {
  NODE_ENV: 'production',
  PORT: '3000',
  CONTROL_PLANE_HOST: '0.0.0.0',
  CONTROL_PLANE_PORT: '3000',
  REAL_GENERATION_ENABLED: env.REAL_GENERATION_ENABLED || 'false',
  AUTO_UPLOAD_PRIVATE: env.AUTO_UPLOAD_PRIVATE || 'false',
  DATABASE_URL: env.DATABASE_URL || '',
  DATABASE_SSL: env.DATABASE_SSL || 'true',
  SESSION_SECRET: env.SESSION_SECRET || '',
  CONTROL_PLANE_TOKEN: env.CONTROL_PLANE_TOKEN || '',
  CONTROL_GOOGLE_ALLOWED_EMAILS: env.CONTROL_GOOGLE_ALLOWED_EMAILS || '',
  CONTROL_GOOGLE_CLIENT_ID: env.CONTROL_GOOGLE_CLIENT_ID || '',
  CONTROL_GOOGLE_CLIENT_SECRET: env.CONTROL_GOOGLE_CLIENT_SECRET || '',
  CONTROL_GOOGLE_REDIRECT_URI: env.CONTROL_GOOGLE_REDIRECT_URI || '',
  GEMINI_API_KEY: env.GEMINI_API_KEY || '',
  AUTO_YTB_RUNTIME_REVISION: env.AUTO_YTB_RUNTIME_REVISION || 'unknown',
  HF_CREDENTIALS: env.HF_CREDENTIALS || '',
  HF_API_KEY_ID: env.HF_API_KEY_ID || '',
  HF_API_KEY_SECRET: env.HF_API_KEY_SECRET || '',
  RUNWAY_API_KEY: env.RUNWAY_API_KEY || '',
  YOUTUBE_CLIENT_ID: env.YOUTUBE_CLIENT_ID || '',
  YOUTUBE_CLIENT_SECRET: env.YOUTUBE_CLIENT_SECRET || '',
  DRIVE_CLIENT_ID: env.DRIVE_CLIENT_ID || '',
  DRIVE_CLIENT_SECRET: env.DRIVE_CLIENT_SECRET || '',
  RUN_BACKGROUND_WORKERS: env.RUN_BACKGROUND_WORKERS || 'false',
  SCHEDULER_INTERVAL_MS: env.SCHEDULER_INTERVAL_MS || '900000',
  SCHEDULER_RUN_IMMEDIATELY: env.SCHEDULER_RUN_IMMEDIATELY || 'false',
  AUTO_YTB_MEDIA_PROXY_URL: env.AUTO_YTB_MEDIA_PROXY_URL || '',
  ...Object.fromEntries(runtimeVariables.map((name) => [name, env[name] || ''])),
};

export class AutoYtbProductionWebContainer extends Container {
  defaultPort = 3000;
  // Production jobs can spend several minutes in external research, media
  // downloads, voice fallback and FFmpeg. Keep the instance alive for the
  // same upper bound as JOB_TIMEOUT_MINUTES so an idle HTTP period cannot
  // SIGTERM a valid background production.
  sleepAfter = '2h';
  enableInternet = true;
  envVars = productionEnv;

  constructor(ctx, containerEnv) {
    super(ctx, containerEnv);
    // Bindings can change independently of the Worker module snapshot. Keep
    // the container's startup environment aligned with the current deployment
    // while letting Container#fetch() own the idempotent start lifecycle.
    this.envVars = Object.fromEntries(Object.keys(productionEnv).map((name) => [name, containerEnv[name] ?? productionEnv[name]]));
  }

  onStart() {
    console.log('AUTO-YTB web container started');
  }

  onStop(stopParams) {
    console.log('AUTO-YTB web container stopped', stopParams);
  }

  onError(error) {
    console.error('AUTO-YTB web container error', error);
  }
}

export default {
  async fetch(request, workerEnv) {
    const url = new URL(request.url);
    if (url.pathname === '/__internal/stop-production-web-v6') {
      const expected = String(workerEnv.CONTROL_PLANE_TOKEN || '');
      const supplied = String(request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
      if (!expected || supplied !== expected) return new Response('Unauthorized', { status: 401 });
      await getContainer(workerEnv.AUTOYTB_WEB, 'production-web-v2').stop();
      await getContainer(workerEnv.AUTOYTB_WEB, 'production-web-v3').stop();
      await getContainer(workerEnv.AUTOYTB_WEB, 'production-web-v4').stop();
      await getContainer(workerEnv.AUTOYTB_WEB, 'production-web-v5').stop();
      await getContainer(workerEnv.AUTOYTB_WEB, 'production-web-v6').stop();
      await getContainer(workerEnv.AUTOYTB_WEB, 'production-web-v7').stop();
      await getContainer(workerEnv.AUTOYTB_WEB, 'production-web-v8').stop();
      await getContainer(workerEnv.AUTOYTB_WEB, 'production-web-v9').stop();
      await getContainer(workerEnv.AUTOYTB_WEB, 'production-web-v10').stop();
      await getContainer(workerEnv.AUTOYTB_WEB, 'production-web-v11').stop();
      return new Response('stopped');
    }
    if (url.pathname.startsWith('/__internal/media')) {
      return handleMedia(request, workerEnv, url);
    }
    // Bump this id whenever the container image or its injected secrets change.
    // Cloudflare keeps a live named instance warm; a revisioned name ensures a
    // new deployment does not keep serving an older image/environment snapshot.
    const instance = getContainer(workerEnv.AUTOYTB_WEB, 'production-web-v11');
    const headers = new Headers(request.headers);
    headers.delete('x-auto-ytb-control-authorized');
    if (url.pathname === '/api/session' && request.method === 'POST') {
      const body = await request.clone().json().catch(() => ({}));
      const supplied = String(body?.token || '');
      const expected = String(workerEnv.CONTROL_PLANE_TOKEN || '');
      if (expected && supplied === expected) headers.set('x-auto-ytb-control-authorized', '1');
    }
    headers.set('x-auto-ytb-public-origin', url.origin);
    return instance.fetch(new Request(request, { headers }));
  },
  async scheduled(_controller, workerEnv) {
    const instance = getContainer(workerEnv.AUTOYTB_WEB, 'production-web-v11');
    const currentEnv = Object.fromEntries(Object.keys(productionEnv).map((name) => [name, workerEnv[name] ?? productionEnv[name]]));
    const state = await instance.getState();
    if (state.status === 'stopped' || state.status === 'stopped_with_code') {
      await instance.start({ envVars: currentEnv });
    }
    instance.renewActivityTimeout();
    console.log(`AUTO-YTB autonomous container activity renewed (${state.status})`);
  },
};

async function handleMedia(request, workerEnv, url) {
  const expected = String(workerEnv.CONTROL_PLANE_TOKEN || '');
  const received = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (!expected || received !== expected) return new Response('Unauthorized', { status: 401 });
  const bucket = workerEnv.AUTOYTB_MEDIA;
  if (!bucket) return new Response('Media storage is not configured', { status: 503 });
  const key = url.searchParams.get('key')?.replace(/^\/+/, '');
  if (!key || key.length > 1024 || key.includes('..')) return new Response('Invalid media key', { status: 400 });
  if (request.method === 'PUT') {
    await bucket.put(key, request.body, { httpMetadata: { contentType: request.headers.get('content-type') || 'application/octet-stream' } });
    return Response.json({ ok: true, key });
  }
  if (request.method === 'DELETE') {
    await bucket.delete(key);
    return Response.json({ ok: true, key });
  }
  if (request.method === 'GET' || request.method === 'HEAD') {
    const requestedRange = request.headers.get('range');
    const head = requestedRange ? await bucket.head(key) : null;
    const object = await bucket.get(key, { range: requestedRange ? request.headers : undefined });
    if (!object) return new Response('Not found', { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('accept-ranges', 'bytes');
    if (requestedRange) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(requestedRange.trim());
      const totalSize = Number(head?.size ?? object.size ?? 0);
      const suffixLength = match?.[1] ? null : Number(match?.[2] ?? 0);
      const offset = match?.[1] ? Number(match[1]) : Math.max(0, totalSize - (suffixLength ?? 0));
      const requestedEnd = match?.[2] ? Number(match[2]) : totalSize - 1;
      const end = Math.min(totalSize - 1, requestedEnd);
      const length = Number(object.range?.length ?? (end >= offset ? end - offset + 1 : 0));
      if (!match || !totalSize || offset < 0 || offset >= totalSize || end < offset || !length) {
        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${totalSize || '*'}` } });
      }
      headers.set('content-length', String(length));
      headers.set('content-range', `bytes ${offset}-${offset + length - 1}/${totalSize}`);
      return new Response(request.method === 'HEAD' ? null : object.body, { status: 206, headers });
    }
    if (object.size != null) headers.set('content-length', String(object.size));
    return new Response(request.method === 'HEAD' ? null : object.body, { status: 200, headers });
  }
  return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD, PUT, DELETE' } });
}
