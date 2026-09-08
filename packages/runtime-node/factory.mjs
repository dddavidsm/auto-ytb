import { NodeLocalObjectStore, FfmpegRenderer, NodeUploadAssetLoader, NodePostgresSqlClient } from './index.mjs';
import { FfmpegThumbnailComposer } from './thumbnail.mjs';
import { ProviderUsageMeter, meterSearchProvider, meterTextModel, meterVoiceProvider, meterImageProvider, meterVideoProvider } from './metering.mjs';
import { withFinalMediaInspection } from './media-inspector.mjs';
import { bindMediaProviderToBrand, parseBrandContinuityContext } from './brand-continuity.mjs';
import { bindTextModelToSeries, parseSeriesContinuityContext } from './series-continuity.mjs';
import { bindDialogueVoiceProviderToSeries } from './series-dialogue-voice.mjs';
import { withElevenLabsVoiceControls } from './elevenlabs-voice-controls.mjs';
import { bindImageProviderToContentArchetype, bindTextModelToContentArchetype, bindVideoProviderToContentArchetype, normalizeContentArchetypeProfile } from './content-archetype.mjs';
import { withCaptureAesthetic } from './capture-aesthetic.mjs';
import { withContinuityBridgeVideo } from './continuity-video.mjs';
import { withLicensedSoundtrack } from './soundtrack.mjs';
import { inferContentArchetype } from '@auto-ytb/os';
import { TavilySearchProvider, OpenAIResponsesTextModel, ElevenLabsVoiceProvider, RunwayMediaProvider, GoogleDriveLibraryProvider } from '@auto-ytb/providers';
import { GoogleOAuthTokenProvider, YouTubePublisher, YouTubeAnalyticsClient } from '@auto-ytb/youtube';

const reqFrom = (env,name) => {
  const value = env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
};
const numFrom=(env,name,fallback)=>{const value=Number(env[name]??fallback);return Number.isFinite(value)?value:fallback;};
const first=(...values)=>values.find((value)=>String(value??'').trim()!=='');
const cliArg=(name)=>process.argv.find((value)=>value.startsWith(`--${name}=`))?.slice(name.length+3)??'';
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
    referenceCatalog:[...(base.referenceCatalog??[]),...(series.visualReferences??[])],
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
  const explicitArchetype=normalizeContentArchetypeProfile(env.AUTO_YTB_CONTENT_ARCHETYPE_PROFILE);
  const inferredArchetype=explicitArchetype?null:inferContentArchetype({
    topic:String(env.AUTO_YTB_CONTENT_TOPIC||cliArg('topic')||''),
    contentFormat:String(env.AUTO_YTB_CONTENT_FORMAT||cliArg('format')||''),
    channelNiche:String(env.AUTO_YTB_CHANNEL_NICHE||''),
    seriesContext:seriesContext??undefined,
  });
  const archetypeProfile=explicitArchetype??inferredArchetype?.profile??null;
  const archetypeDecision=explicitArchetype?{archetype:explicitArchetype.id,confidence:100,reasons:['Explicit runtime archetype profile'],profile:explicitArchetype}:inferredArchetype;
  const brandContext=mergeBrandAndSeries(parseBrandContinuityContext(env.AUTO_YTB_BRAND_CONTEXT),seriesContext);
  const searchProvider = (env.SEARCH_PROVIDER || 'tavily').toLowerCase();
  if (searchProvider !== 'tavily') throw new Error(`Unsupported SEARCH_PROVIDER: ${searchProvider}`);
  const rawSearch = new TavilySearchProvider({ apiKey: reqFrom(env,'SEARCH_API_KEY') });
  const search = meterSearchProvider(rawSearch,meter);

  const modelName = env.TEXT_MODEL_RESEARCH || 'gpt-5';
  const rawModel = new OpenAIResponsesTextModel({ apiKey: reqFrom(env,'TEXT_MODEL_API_KEY'), model: modelName, endpoint: env.TEXT_MODEL_BASE_URL || undefined });
  const measuredModel = meterTextModel(rawModel,meter);
  const seriesModel = bindTextModelToSeries(measuredModel,seriesContext);
  const model = bindTextModelToContentArchetype(seriesModel,archetypeProfile);

  const voiceProvider = (env.VOICE_PROVIDER || 'elevenlabs').toLowerCase();
  if (voiceProvider !== 'elevenlabs') throw new Error(`Unsupported VOICE_PROVIDER: ${voiceProvider}`);
  const voiceModel=env.VOICE_MODEL || 'eleven_multilingual_v2';
  const voiceApiKey=reqFrom(env,'VOICE_API_KEY');
  const rawVoice = new ElevenLabsVoiceProvider({ apiKey:voiceApiKey, store, modelId:voiceModel, useTimestamps:env.VOICE_TIMESTAMPS!=='false' });
  const controlledVoice=withElevenLabsVoiceControls(rawVoice,{apiKey:voiceApiKey,store,modelId:voiceModel});
  const meteredVoice=meterVoiceProvider(controlledVoice,meter,{model:voiceModel});
  const voice=bindDialogueVoiceProviderToSeries(meteredVoice,seriesContext,{store,ffmpeg:env.FFMPEG_BIN||'ffmpeg'});

  let image;
  let video;
  if ((env.IMAGE_PROVIDER || '').toLowerCase() === 'runway' || (env.VIDEO_PROVIDER || '').toLowerCase() === 'runway') {
    const imageModel=env.IMAGE_MODEL || 'gen4_image';
    const videoModel=env.VIDEO_MODEL || 'gen4.5';
    const runway = new RunwayMediaProvider({ apiKey: env.IMAGE_API_KEY || env.VIDEO_API_KEY || reqFrom(env,'VIDEO_API_KEY'), store, imageModel, videoModel });
    const meteredImage=meterImageProvider(runway,meter,{model:imageModel});
    const meteredVideo=meterVideoProvider(runway,meter,{model:videoModel});
    const archetypeImage=bindImageProviderToContentArchetype(meteredImage,archetypeProfile);
    const archetypeVideo=bindVideoProviderToContentArchetype(meteredVideo,archetypeProfile);
    const captureVideo=withCaptureAesthetic(archetypeVideo,archetypeProfile,{store,ffmpeg:env.FFMPEG_BIN||'ffmpeg'});
    image = bindMediaProviderToBrand(archetypeImage,brandContext);
    video = (brandContext?.referenceUris?.length??0)>=2
      ? withContinuityBridgeVideo(captureVideo,image,brandContext)
      : bindMediaProviderToBrand(captureVideo,brandContext);
  }

  const rawRenderer=new FfmpegRenderer({
    outputRoot: env.LOCAL_RENDER_ROOT || '.data/renders',
    ffmpeg:env.FFMPEG_BIN||'ffmpeg',
    targetLufs:numFrom(env,'AUDIO_TARGET_LUFS',-16),
    truePeakDb:numFrom(env,'AUDIO_TRUE_PEAK_DB',-1.5),
    loudnessRange:numFrom(env,'AUDIO_LOUDNESS_RANGE',7),
  });
  const soundtrackCatalog=String(first(env.AUDIO_LIBRARY_MANIFEST,env.SOUNDTRACK_CATALOG_PATH,'')??'');
  const soundtrackRenderer=withLicensedSoundtrack(rawRenderer,{
    catalogPath:soundtrackCatalog,
    ffmpeg:env.FFMPEG_BIN||'ffmpeg',
    maxAudioCostUsd:Number(first(env.AUDIO_MAX_COST_USD_PER_VIDEO,env.SOUNDTRACK_MAX_COST_USD,1.5)),
    enableMusic:String(first(env.AUDIO_MUSIC_ENABLED,env.SOUNDTRACK_ENABLE_MUSIC,'true'))!=='false',
    enableSfx:String(first(env.AUDIO_SFX_ENABLED,env.SOUNDTRACK_ENABLE_SFX,'true'))!=='false',
    requireZeroMarginalCost:String(first(env.AUDIO_REQUIRE_ZERO_MARGINAL_COST,env.SOUNDTRACK_REQUIRE_ZERO_MARGINAL_COST,'true'))!=='false',
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

  return { store, meter, search, model, voice, image, video, renderer, thumbnailComposer, oauth, publisher, analytics, library, loader, db, brandContext, seriesContext, archetypeProfile, archetypeDecision };
}
