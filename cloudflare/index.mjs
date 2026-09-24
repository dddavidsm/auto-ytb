import { Container, ContainerProxy, getContainer } from '@cloudflare/containers';
import { env } from 'cloudflare:workers';

export { ContainerProxy };

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
    const instance = getContainer(workerEnv.AUTOYTB_WEB, 'production-web');
    return instance.fetch(request);
  },
  async scheduled(_controller, workerEnv) {
    const instance = getContainer(workerEnv.AUTOYTB_WEB, 'production-web');
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
