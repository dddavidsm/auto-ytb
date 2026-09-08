import { NodeLocalObjectStore, FfmpegRenderer, NodeUploadAssetLoader, NodePostgresSqlClient } from './index.mjs';
import { FfmpegThumbnailComposer } from './thumbnail.mjs';
import { TavilySearchProvider, OpenAIResponsesTextModel, ElevenLabsVoiceProvider, RunwayMediaProvider, GoogleDriveLibraryProvider } from '@auto-ytb/providers';
import { GoogleOAuthTokenProvider, YouTubePublisher, YouTubeAnalyticsClient } from '@auto-ytb/youtube';

const req = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
};

export function createLiveRuntime(env = process.env) {
  const store = new NodeLocalObjectStore(env.LOCAL_STORAGE_ROOT || '.data/storage');
  const searchProvider = (env.SEARCH_PROVIDER || 'tavily').toLowerCase();
  if (searchProvider !== 'tavily') throw new Error(`Unsupported SEARCH_PROVIDER: ${searchProvider}`);
  const search = new TavilySearchProvider({ apiKey: req('SEARCH_API_KEY') });

  const modelName = env.TEXT_MODEL_RESEARCH || 'gpt-5';
  const model = new OpenAIResponsesTextModel({ apiKey: req('TEXT_MODEL_API_KEY'), model: modelName, endpoint: env.TEXT_MODEL_BASE_URL || undefined });

  const voiceProvider = (env.VOICE_PROVIDER || 'elevenlabs').toLowerCase();
  if (voiceProvider !== 'elevenlabs') throw new Error(`Unsupported VOICE_PROVIDER: ${voiceProvider}`);
  const voice = new ElevenLabsVoiceProvider({ apiKey: req('VOICE_API_KEY'), store, modelId: env.VOICE_MODEL || undefined, useTimestamps:env.VOICE_TIMESTAMPS!=='false' });

  let image;
  let video;
  if ((env.IMAGE_PROVIDER || '').toLowerCase() === 'runway' || (env.VIDEO_PROVIDER || '').toLowerCase() === 'runway') {
    const runway = new RunwayMediaProvider({ apiKey: env.IMAGE_API_KEY || env.VIDEO_API_KEY || req('VIDEO_API_KEY'), store, imageModel: env.IMAGE_MODEL || undefined, videoModel: env.VIDEO_MODEL || undefined });
    image = runway;
    video = runway;
  }

  const renderer = new FfmpegRenderer({ outputRoot: env.LOCAL_RENDER_ROOT || '.data/renders' });
  const thumbnailComposer = new FfmpegThumbnailComposer({ outputRoot: env.LOCAL_THUMBNAIL_ROOT || '.data/thumbnails' });
  const oauth = new GoogleOAuthTokenProvider({ clientId:req('YOUTUBE_CLIENT_ID'), clientSecret:req('YOUTUBE_CLIENT_SECRET'), refreshToken:req('YOUTUBE_REFRESH_TOKEN') });
  const loader = new NodeUploadAssetLoader();
  const publisher = new YouTubePublisher(oauth, loader);
  const analytics = new YouTubeAnalyticsClient(oauth);
  const library=(env.CONTENT_LIBRARY_PROVIDER||'google-drive').toLowerCase()==='google-drive'
    ? new GoogleDriveLibraryProvider({getAccessToken:()=>oauth.getAccessToken(),rootFolderName:env.DRIVE_ROOT_FOLDER||'AUTO-YTB'})
    : undefined;
  const db = env.DATABASE_URL ? new NodePostgresSqlClient(env.DATABASE_URL, { ssl: env.DATABASE_SSL === 'true' ? { rejectUnauthorized:false } : undefined }) : undefined;

  return { store, search, model, voice, image, video, renderer, thumbnailComposer, oauth, publisher, analytics, library, loader, db };
}
