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
  HF_CREDENTIALS: env.HF_CREDENTIALS || '',
  HF_API_KEY_ID: env.HF_API_KEY_ID || '',
  HF_API_KEY_SECRET: env.HF_API_KEY_SECRET || '',
  RUNWAY_API_KEY: env.RUNWAY_API_KEY || '',
  YOUTUBE_CLIENT_ID: env.YOUTUBE_CLIENT_ID || '',
  YOUTUBE_CLIENT_SECRET: env.YOUTUBE_CLIENT_SECRET || '',
  DRIVE_CLIENT_ID: env.DRIVE_CLIENT_ID || '',
  DRIVE_CLIENT_SECRET: env.DRIVE_CLIENT_SECRET || '',
};

export class AutoYtbProductionWebContainer extends Container {
  defaultPort = 3000;
  sleepAfter = '30m';
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
    const instance = getContainer(workerEnv.AUTOYTB_WEB, 'production-web');
    return instance.fetch(request);
  },
};
