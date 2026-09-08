import { GoogleOAuthTokenProvider } from '@auto-ytb/youtube';
import { NodePostgresSqlClient, NodeUploadAssetLoader } from '../packages/runtime-node/index.mjs';

const arg=(name)=>process.argv.find((value)=>value.startsWith(`--${name}=`))?.slice(name.length+3);
const req=(name)=>{const value=process.env[name]?.trim();if(!value)throw new Error(`${name} is required`);return value;};
const channelId=arg('channel-id');if(!channelId)throw new Error('Use --channel-id=<uuid>');
const db=new NodePostgresSqlClient(req('DATABASE_URL'),{ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined});
const oauth=new GoogleOAuthTokenProvider({clientId:req('YOUTUBE_CLIENT_ID'),clientSecret:req('YOUTUBE_CLIENT_SECRET'),refreshToken:req('YOUTUBE_REFRESH_TOKEN')});
const loader=new NodeUploadAssetLoader();
const asBody=(body)=>body;

try{
  const channel=(await db.query(`select id,youtube_channel_id,channel_key,title,language,country,identity,brand_assets,lifecycle_state from channels where id=$1 and is_owned=true`,[channelId])).rows[0];
  if(!channel)throw new Error(`Owned channel ${channelId} not found`);if(!channel.youtube_channel_id)throw new Error(`Channel ${channel.channel_key??channelId} is awaiting a real YouTube channel binding`);
  const banner=(await db.query(`select * from channel_brand_assets where channel_id=$1 and asset_type='banner' and active=true order by version desc limit 1`,[channelId])).rows[0];
  if(!banner)throw new Error('No active generated banner exists; run bootstrap-channel-brand first');
  const token=await oauth.getAccessToken();
  const asset=await loader.load(banner.uri);
  if(!['image/jpeg','image/png','application/octet-stream'].includes(asset.mimeType))throw new Error(`Unsupported banner MIME ${asset.mimeType}`);
  if(asset.size>6*1024*1024)throw new Error(`YouTube banner exceeds 6 MB: ${asset.size} bytes`);
  const bannerUpload=await fetch(`https://www.googleapis.com/upload/youtube/v3/channelBanners/insert?channelId=${encodeURIComponent(channel.youtube_channel_id)}&uploadType=media`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':asset.mimeType,'content-length':String(asset.size)},body:asBody(asset.body)});
  if(!bannerUpload.ok)throw new Error(`YouTube channelBanners.insert failed ${bannerUpload.status}: ${(await bannerUpload.text()).slice(0,800)}`);
  const uploaded=await bannerUpload.json();if(!uploaded.url)throw new Error('YouTube channelBanners.insert returned no banner URL');

  const currentResponse=await fetch(`https://www.googleapis.com/youtube/v3/channels?part=brandingSettings&id=${encodeURIComponent(channel.youtube_channel_id)}`,{headers:{authorization:`Bearer ${token}`}});
  if(!currentResponse.ok)throw new Error(`YouTube channels.list branding failed ${currentResponse.status}: ${(await currentResponse.text()).slice(0,800)}`);
  const currentJson=await currentResponse.json();const current=currentJson.items?.[0]?.brandingSettings??{};const existing=current.channel??{};
  const identityVersion=(await db.query(`select identity from channel_identity_versions where channel_id=$1 order by version desc limit 1`,[channelId])).rows[0]?.identity??{};
  const identity={...(channel.identity??{}),...(identityVersion??{})};
  const themes=Array.isArray(identity.themes)?identity.themes:[];
  const description=String(identity.description??identity.positioning??existing.description??channel.title).slice(0,1000);
  const keywords=[...new Set([...themes,(Array.isArray(identity.styleTags)?identity.styleTags:[])].map(String).map((value)=>value.trim()).filter(Boolean))].join(' ').slice(0,500);
  const channelSettings={
    ...(existing.country?{country:existing.country}:channel.country?{country:channel.country}:{}),
    description,
    defaultLanguage:String(channel.language??existing.defaultLanguage??'en'),
    ...(keywords?{keywords}:existing.keywords?{keywords:existing.keywords}:{}),
    ...(existing.unsubscribedTrailer?{unsubscribedTrailer:existing.unsubscribedTrailer}:{}),
  };
  const update=await fetch('https://www.googleapis.com/youtube/v3/channels?part=brandingSettings',{method:'PUT',headers:{authorization:`Bearer ${token}`,'content-type':'application/json; charset=UTF-8'},body:JSON.stringify({id:channel.youtube_channel_id,brandingSettings:{channel:channelSettings,image:{bannerExternalUrl:uploaded.url}}})});
  if(!update.ok)throw new Error(`YouTube channels.update branding failed ${update.status}: ${(await update.text()).slice(0,1000)}`);
  await db.query(`update channels set lifecycle_state='ready',brand_assets=brand_assets||$2::jsonb,updated_at=now() where id=$1`,[channelId,JSON.stringify({youtubeBannerAppliedAt:new Date().toISOString(),youtubeBannerExternalUrl:uploaded.url})]);
  await db.query(`update channel_brand_assets set metadata=metadata||$2::jsonb where id=$1`,[banner.id,JSON.stringify({youtubeAppliedAt:new Date().toISOString(),youtubeExternalUrl:uploaded.url})]);
  console.log(JSON.stringify({channelId,channelKey:channel.channel_key,youtubeChannelId:channel.youtube_channel_id,bannerApplied:true,descriptionUpdated:true,keywordsUpdated:Boolean(keywords),avatarRequiresPlatformProfileAction:true},null,2));
} finally {await db.close();}
