import { NodeLocalObjectStore, FfmpegRenderer, NodeUploadAssetLoader, NodePostgresSqlClient } from './index.mjs';
import { FfmpegThumbnailComposer } from './thumbnail.mjs';
import { ProviderUsageMeter, meterSearchProvider, meterTextModel, meterVoiceProvider, meterImageProvider, meterVideoProvider } from './metering.mjs';
import { withFinalMediaInspection } from './media-inspector.mjs';
import { bindMediaProviderToBrand, parseBrandContinuityContext } from './brand-continuity.mjs';
import { bindTextModelToSeries, parseSeriesContinuityContext } from './series-continuity.mjs';
import { withLicensedSoundtrack } from './soundtrack.mjs';
import { TavilySearchProvider, OpenAIResponsesTextModel, ElevenLabsVoiceProvider, RunwayMediaProvider, GoogleDriveLibraryProvider } from '@auto-ytb/providers';
import { GoogleOAuthTokenProvider, YouTubePublisher, YouTubeAnalyticsClient } from '@auto-ytb/youtube';

const reqFrom = (env,name) => {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
};
const numFrom=(env,name,fallback)=>{const value=Number(env[name]??fallback);return Number.isFinite(value)?value:fallback;};
function mergeBrandAndSeries(brand,series){
  if(!series?.required)return brand;
  const base=brand??{};
  return {
    ...base,
    required:Boolean(base.required||series.required),
    channelKey:base.channelKey??'',
    characterMode:base.characterMode??(series.characterContinuityKeys?.length?'persistent':'none'),
    characterName:base.characterName??null,
    continuityKey:base.continuityKey??series.continuityKey,
    referenceUris:[...new Set([...(base.referenceUris??[]),...(series.referenceUris??[])])].slice(0,8),
    styleTags:base.styleTags??[],
    styleGuidance:[base.styleGuidance,series.visualGuidance].filter(Boolean).join(' '),
    seriesKey:series.seriesKey,
    seriesContinuityKey:series.continuityKey,
    seriesBibleVersion:series.bibleVersion,
    seriesEpisodeKey:series.episodeKey,
  };
}
function bindPublisherToSeries(publisher,series){
  if(!series?.required)return publisher;
  const madeForKids=series.audienceMode==='MADE_FOR_KIDS';
  return {
    name:publisher.name,
    uploadPrivate(input){return publisher.uploadPrivate({...input,selfDeclaredMadeForKids:madeForKids});},
    setThumbnail:publisher.setThumbnail.bind(publisher),
    schedule:publisher.schedule.bind(publisher),
  };
}

export function createLiveRuntime(env = process.env) {
  const store = new NodeLocalObjectStore(env.LOCAL_STORAGE_ROOT || '.data/storage');
  const meter = new ProviderUsageMeter(env);
  const seriesContext=parseSeriesContinuityContext(env.AUTO_YTB_SERIES_CONTEXT);
  const brandContext=mergeBrandAndSeries(parseBrandContinuityContext(env.AUTO_YTB_BRAND_CONTEXT),seriesContext);
  const searchProvider = (env.SEARCH_PROVIDER || 'tavily').toLowerCase();
  if (searchProvider !== 'tavily') throw new Error(`Unsupported SEARCH_PROVIDER: ${searchProvider}`);
  const rawSearch = new TavilySearchProvider({ apiKey: reqFrom(env,'SEARCH_API_KEY') });
  const search = meterSearchProvider(rawSearch,meter);

  const modelName = env.TEXT_MODEL_RESEARCH || 'gpt-5';
  const rawModel = new OpenAIResponsesTextModel({ apiKey: reqFrom(env,'TEXT_MODEL_API_KEY'), model: modelName, endpoint: env.TEXT_MODEL_BASE_URL || undefined });
  const measuredModel = meterTextModel(rawModel,meter);
  const model = bindTextModelToSeries(measuredModel,seriesContext);

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
    image = bindMediaProviderToBrand(meterImageProvider(runway,meter,{model:imageModel}),brandContext);
    video = bindMediaProviderToBrand(meterVideoProvider(runway,meter,{model:videoModel}),brandContext);
  }

  const rawRenderer=new FfmpegRenderer({
    outputRoot: env.LOCAL_RENDER_ROOT || '.data/renders',
    ffmpeg:env.FFMPEG_BIN||'ffmpeg',
    targetLufs:numFrom(env,'AUDIO_TARGET_LUFS',-16),
    truePeakDb:numFrom(env,'AUDIO_TRUE_PEAK_DB',-1.5),
    loudnessRange:numFrom(env,'AUDIO_LOUDNESS_RANGE',7),
  });
  const soundtrackRenderer=withLicensedSoundtrack(rawRenderer,{
    catalogPath:env.SOUNDTRACK_CATALOG_PATH||'',
    ffmpeg:env.FFMPEG_BIN||'ffmpeg',
    maxAudioCostUsd:numFrom(env,'SOUNDTRACK_MAX_COST_USD',1.5),
    enableMusic:env.SOUNDTRACK_ENABLE_MUSIC!=='false',
    enableSfx:env.SOUNDTRACK_ENABLE_SFX!=='false',
    requireZeroMarginalCost:env.SOUNDTRACK_REQUIRE_ZERO_MARGINAL_COST!=='false',
  });
  const renderer = withFinalMediaInspection(soundtrackRenderer,{ffmpeg:env.FFMPEG_BIN||'ffmpeg',ffprobe:env.FFPROBE_BIN||'ffprobe'});
  const thumbnailComposer = new FfmpegThumbnailComposer({ outputRoot: env.LOCAL_THUMBNAIL_ROOT || '.data/thumbnails' });
  const oauth = new GoogleOAuthTokenProvider({ clientId:reqFrom(env,'YOUTUBE_CLIENT_ID'), clientSecret:reqFrom(env,'YOUTUBE_CLIENT_SECRET'), refreshToken:reqFrom(env,'YOUTUBE_REFRESH_TOKEN') });
  const loader = new NodeUploadAssetLoader();
  const rawPublisher = new YouTubePublisher(oauth, loader);
  const publisher = bindPublisherToSeries(rawPublisher,seriesContext);
  const analytics = new YouTubeAnalyticsClient(oauth);
  const library=(env.CONTENT_LIBRARY_PROVIDER||'google-drive').toLowerCase()==='google-drive'
    ? new GoogleDriveLibraryProvider({getAccessToken:()=>oauth.getAccessToken(),rootFolderName:env.DRIVE_ROOT_FOLDER||'AUTO-YTB'})
    : undefined;
  const db = env.DATABASE_URL ? new NodePostgresSqlClient(env.DATABASE_URL, { ssl: env.DATABASE_SSL === 'true' ? { rejectUnauthorized:false } : undefined }) : undefined;

  return { store, meter, search, model, voice, image, video, renderer, thumbnailComposer, oauth, publisher, analytics, library, loader, db, brandContext, seriesContext };
}
