import { NodeLocalObjectStore, FfmpegRenderer, NodeUploadAssetLoader, NodePostgresSqlClient } from './index.mjs';
import { FfmpegThumbnailComposer } from './thumbnail.mjs';
import { ProviderUsageMeter, meterSearchProvider, meterTextModel, meterVoiceProvider, meterImageProvider, meterVideoProvider } from './metering.mjs';
import { TavilySearchProvider, OpenAIResponsesTextModel, ElevenLabsVoiceProvider, RunwayMediaProvider, GoogleDriveLibraryProvider } from '@auto-ytb/providers';
import { GoogleOAuthTokenProvider, YouTubePublisher, YouTubeAnalyticsClient } from '@auto-ytb/youtube';

const reqFrom = (env,name) => {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
};

export function createLiveRuntime(env = process.env) {
  const store = new NodeLocalObjectStore(env.LOCAL_STORAGE_ROOT || '.data/storage');
  const meter = new ProviderUsageMeter(env);
  const searchProvider = (env.SEARCH_PROVIDER || 'tavily').toLowerCase();
  if (searchProvider !== 'tavily') throw new Error(`Unsupported SEARCH_PROVIDER: ${searchProvider}`);
  const rawSearch = new TavilySearchProvider({ apiKey: reqFrom(env,'SEARCH_API_KEY') });
  const search = meterSearchProvider(rawSearch,meter);

  const modelName = env.TEXT_MODEL_RESEARCH || 'gpt-5';
  const rawModel = new OpenAIResponsesTextModel({ apiKey: reqFrom(env,'TEXT_MODEL_API_KEY'), model: modelName, endpoint: env.TEXT_MODEL_BASE_URL || undefined });
  const model = meterTextModel(rawModel,meter);

  const voiceProvider = (env.VOICE_PROVIDER || 'elevenlabs').toLowerCase();
  if (voiceProvider !== 'elevenlabs') throw new Error(`Unsupported VOICE_PROVIDER: ${voiceProvider}`);
  const voiceModel=env.VOICE_MODEL || 'eleven_multilingual_v2';
  const rawVoice = new ElevenLabsVoiceProvider({ apiKey: reqFrom(env,'VOICE_API_KEY'), store, modelId: voiceModel, useTimestamps:env.VOICE_TIMESTAMPS!=='false' });
  const voice = meterVoiceProvider(rawVoice,meter,{model:voiceModel});

  let image;
  let video;
  if ((env.IMAGE_PROVIDER || '').toLowerCase() === 'runway' || (env.VIDEO_PROVIDER || '').toLowerCase() === 'runway') {
    const imageModel=env.IMAGE_MODEL || 'gen4_image';
    const videoModel=env.VIDEO_MODEL || 'gen4.5';
    const runway = new RunwayMediaProvider({ apiKey: env.IMAGE_API_KEY || env.VIDEO_API_KEY || reqFrom(env,'VIDEO_API_KEY'), store, imageModel, videoModel });
    image = meterImageProvider(runway,meter,{model:imageModel});
    video = meterVideoProvider(runway,meter,{model:videoModel});
  }

  const renderer = new FfmpegRenderer({ outputRoot: env.LOCAL_RENDER_ROOT || '.data/renders' });
  const thumbnailComposer = new FfmpegThumbnailComposer({ outputRoot: env.LOCAL_THUMBNAIL_ROOT || '.data/thumbnails' });
  const oauth = new GoogleOAuthTokenProvider({ clientId:reqFrom(env,'YOUTUBE_CLIENT_ID'), clientSecret:reqFrom(env,'YOUTUBE_CLIENT_SECRET'), refreshToken:reqFrom(env,'YOUTUBE_REFRESH_TOKEN') });
  const loader = new NodeUploadAssetLoader();
  const publisher = new YouTubePublisher(oauth, loader);
  const analytics = new YouTubeAnalyticsClient(oauth);
  const library=(env.CONTENT_LIBRARY_PROVIDER||'google-drive').toLowerCase()==='google-drive'
    ? new GoogleDriveLibraryProvider({getAccessToken:()=>oauth.getAccessToken(),rootFolderName:env.DRIVE_ROOT_FOLDER||'AUTO-YTB'})
    : undefined;
  const db = env.DATABASE_URL ? new NodePostgresSqlClient(env.DATABASE_URL, { ssl: env.DATABASE_SSL === 'true' ? { rejectUnauthorized:false } : undefined }) : undefined;

  return { store, meter, search, model, voice, image, video, renderer, thumbnailComposer, oauth, publisher, analytics, library, loader, db };
}
