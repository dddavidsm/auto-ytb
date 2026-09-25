import { Container, ContainerProxy, getContainer } from '@cloudflare/containers';
import { env } from 'cloudflare:workers';

export { ContainerProxy };

const runtimeVariables = [
  'YOUTUBE_API_KEY', 'YOUTUBE_REGION', 'YOUTUBE_RELEVANCE_LANGUAGE',
  'GEMINI_API_BASE_URL', 'GEMINI_SEARCH_MODEL', 'SEARCH_PROVIDER', 'SEARCH_API_KEY',
  'TEXT_MODEL_PROVIDER', 'TEXT_MODEL_RESEARCH', 'TEXT_MODEL_CREATIVE', 'TEXT_MODEL_VISION', 'GEMINI_TEXT_MODEL', 'TEXT_MODEL_API_KEY', 'TEXT_MODEL_BASE_URL',
  'VOICE_PROVIDER', 'VOICE_ID', 'GEMINI_VOICE_ID', 'ELEVENLABS_VOICE_ID', 'VOICE_MODEL', 'VOICE_TIMESTAMPS', 'GEMINI_TRANSCRIBE_MODEL', 'VOICE_ALIGNMENT_STRICT', 'VOICE_ALIGNMENT_MIN_COVERAGE', 'VOICE_API_KEY',
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
  'JOB_MAX_ATTEMPTS', 'JOB_POLL_MS', 'JOB_STALE_MINUTES', 'JOB_TIMEOUT_MINUTES', 'JOB_RETRY_BASE_MS', 'JOB_RETRY_MAX_MS', 'DISTRIBUTION_PUBLIC_MEDIA_BASE_URL',
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
  sleepAfter = '10m';
  enableInternet = true;
  envVars = productionEnv;

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
    if (url.pathname.startsWith('/__internal/media')) {
      return handleMedia(request, workerEnv, url);
    }
    // Bump this id whenever the container image or its injected secrets change.
    // Cloudflare keeps a live named instance warm; a revisioned name ensures a
    // new deployment does not keep serving an older image/environment snapshot.
    const instance = getContainer(workerEnv.AUTOYTB_WEB, 'production-web-v2');
    const headers = new Headers(request.headers);
    headers.set('x-auto-ytb-public-origin', url.origin);
    return instance.fetch(new Request(request, { headers }));
  },
  async scheduled(_controller, workerEnv) {
    const instance = getContainer(workerEnv.AUTOYTB_WEB, 'production-web-v2');
    await instance.startAndWaitForPorts();
    instance.renewActivityTimeout();
    console.log('AUTO-YTB autonomous container activity renewed');
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
    const object = await bucket.get(key, { range: request.headers });
    if (!object) return new Response('Not found', { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    if (object.size != null) headers.set('content-length', String(object.size));
    return new Response(request.method === 'HEAD' ? null : object.body, { headers });
  }
  return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD, PUT, DELETE' } });
}
