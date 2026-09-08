import { buildChannelBrandBlueprint } from '@auto-ytb/os';
import { RunwayMediaProvider } from '@auto-ytb/providers';
import { NodeLocalObjectStore, NodePostgresSqlClient } from '../packages/runtime-node/index.mjs';
import { FfmpegBrandComposer } from '../packages/runtime-node/brand.mjs';

const arg=(name)=>process.argv.find((value)=>value.startsWith(`--${name}=`))?.slice(name.length+3);
const req=(name)=>{const value=process.env[name]?.trim();if(!value)throw new Error(`${name} is required`);return value;};
const candidateId=arg('candidate-id');
const channelId=arg('channel-id');
if(!candidateId&&!channelId)throw new Error('Use --candidate-id=<uuid> or --channel-id=<uuid>');
const db=new NodePostgresSqlClient(req('DATABASE_URL'),{ssl:process.env.DATABASE_SSL==='true'?{rejectUnauthorized:false}:undefined});
const store=new NodeLocalObjectStore(process.env.LOCAL_STORAGE_ROOT||'.data/storage');
const image=new RunwayMediaProvider({apiKey:process.env.IMAGE_API_KEY||process.env.VIDEO_API_KEY||req('IMAGE_API_KEY'),store,imageModel:process.env.IMAGE_MODEL||undefined,videoModel:process.env.VIDEO_MODEL||undefined});
const composer=new FfmpegBrandComposer({outputRoot:process.env.LOCAL_BRAND_ROOT||'.data/brand'});

async function source(){
  if(candidateId){
    const row=(await db.query(`select * from channel_candidates where id=$1`,[candidateId])).rows[0];
    if(!row)throw new Error(`Channel candidate ${candidateId} not found`);
    return {kind:'candidate',id:row.id,key:row.candidate_key,name:row.proposed_name,positioning:row.proposed_positioning,fingerprint:row.style_fingerprint,row};
  }
  const row=(await db.query(`select * from channels where id=$1 and is_owned=true`,[channelId])).rows[0];
  if(!row)throw new Error(`Owned channel ${channelId} not found`);
  const identity=row.identity??{};
  const fingerprint={language:row.language??identity.language??'en',topic:row.title,themes:identity.themes??[row.niche].filter(Boolean),styleTags:identity.styleTags??identity.tone??['documentary'],format:'LONG_HORIZONTAL',characterMode:identity.characterMode??'none',characterName:identity.characterName??null};
  return {kind:'channel',id:row.id,key:row.channel_key??row.id,name:identity.channelName??row.title,positioning:identity.positioning??row.niche??row.title,fingerprint,row};
}

async function persistChannelAsset(channelId,assetType,asset,prompt,metadata={}){
  await db.query(`update channel_brand_assets set active=false where channel_id=$1 and asset_type=$2 and active=true`,[channelId,assetType]);
  const versionResult=await db.query(`select coalesce(max(version),0)+1 as version from channel_brand_assets where channel_id=$1 and asset_type=$2`,[channelId,assetType]);
  const version=Number(versionResult.rows[0]?.version??1);
  await db.query(`insert into channel_brand_assets (channel_id,asset_type,uri,provider,source_prompt,version,active,metadata) values ($1,$2,$3,$4,$5,$6,true,$7::jsonb)`,[channelId,assetType,asset.uri,asset.provider,prompt??null,version,JSON.stringify({...metadata,mimeType:asset.mimeType,bytes:asset.bytes??null,model:asset.model??null,costUsd:asset.costUsd??null})]);
}

try{
  const target=await source();
  const blueprint=buildChannelBrandBlueprint({candidateKey:target.key,proposedName:target.name,positioning:target.positioning,fingerprint:target.fingerprint});
  let characterReference=null;
  if(blueprint.prompts.characterReference){
    characterReference=await image.generate({prompt:blueprint.prompts.characterReference,aspectRatio:'16:9'});
  }
  const refs=characterReference?[characterReference.uri]:undefined;
  const [avatarBase,bannerBase]=await Promise.all([
    image.generate({prompt:blueprint.prompts.avatar,aspectRatio:'16:9',referenceUris:refs}),
    image.generate({prompt:blueprint.prompts.banner,aspectRatio:'16:9',referenceUris:refs}),
  ]);
  const [avatar,banner,socialBanner]=await Promise.all([
    composer.compose({backgroundUri:avatarBase.uri,outputKey:`${target.key}/avatar.jpg`,variant:'avatar'}),
    composer.compose({backgroundUri:bannerBase.uri,outputKey:`${target.key}/youtube-banner.jpg`,variant:'banner',title:blueprint.channelName,tagline:blueprint.tagline}),
    composer.compose({backgroundUri:bannerBase.uri,outputKey:`${target.key}/social-banner.jpg`,variant:'social_banner',title:blueprint.channelName,tagline:blueprint.tagline}),
  ]);
  const watermark=await composer.compose({backgroundUri:avatar.uri,outputKey:`${target.key}/watermark.png`,variant:'watermark'});
  const guide=await store.put({key:`brand/${target.key}/brand-blueprint.json`,contentType:'application/json',data:JSON.stringify(blueprint,null,2)});
  const assets={profile:avatar,banner,watermark,socialBanner,styleGuide:{uri:guide.uri,provider:store.name,mimeType:'application/json'},characterReference};

  if(target.kind==='candidate'){
    await db.query(`update channel_candidates set brand_plan=$2::jsonb,proposed_identity=$3::jsonb,status='awaiting_channel',updated_at=now() where id=$1`,[target.id,JSON.stringify({blueprint,assets}),JSON.stringify({...target.row.proposed_identity,channelName:blueprint.channelName,tagline:blueprint.tagline,palette:blueprint.palette,visualRules:blueprint.visualRules,character:blueprint.character})]);
    for(const platform of ['youtube','instagram','tiktok','x'])await db.query(`insert into channel_social_profiles (channel_candidate_id,platform,state,identity_payload) values ($1,$2,'planned',$3::jsonb) on conflict (channel_candidate_id,platform) where channel_candidate_id is not null do update set identity_payload=excluded.identity_payload,updated_at=now()`,[target.id,platform,JSON.stringify({channelName:blueprint.channelName,avatarUri:avatar.uri,bannerUri:socialBanner.uri,bio:platform==='youtube'?blueprint.social.youtubeDescription:platform==='instagram'?blueprint.social.instagramBio:platform==='tiktok'?blueprint.social.tiktokBio:blueprint.social.xBio})]);
  }else{
    const identityVersionResult=await db.query(`select coalesce(max(version),0)+1 as version from channel_identity_versions where channel_id=$1`,[target.id]);
    const identityVersion=Number(identityVersionResult.rows[0]?.version??1);
    await db.query(`insert into channel_identity_versions (channel_id,version,identity,reason) values ($1,$2,$3::jsonb,'Autonomous brand bootstrap')`,[target.id,identityVersion,JSON.stringify(blueprint)]);
    await persistChannelAsset(target.id,'profile',avatar,blueprint.prompts.avatar,{continuityKey:blueprint.character.continuityKey});
    await persistChannelAsset(target.id,'banner',banner,blueprint.prompts.banner,{continuityKey:blueprint.character.continuityKey});
    await persistChannelAsset(target.id,'watermark',watermark,blueprint.prompts.watermark,{continuityKey:blueprint.character.continuityKey});
    await persistChannelAsset(target.id,'social_banner',socialBanner,blueprint.prompts.socialBanner,{continuityKey:blueprint.character.continuityKey});
    await persistChannelAsset(target.id,'style_guide',{uri:guide.uri,provider:store.name,mimeType:'application/json'},null,{blueprint});
    if(characterReference)await persistChannelAsset(target.id,'character_reference',characterReference,blueprint.prompts.characterReference,{continuityKey:blueprint.character.continuityKey});
    await db.query(`update channels set identity=identity||$2::jsonb,brand_assets=$3::jsonb,lifecycle_state=case when youtube_channel_id is null then 'brand_ready' else 'ready' end,updated_at=now() where id=$1`,[target.id,JSON.stringify({channelName:blueprint.channelName,positioning:target.positioning,themes:target.fingerprint.themes,styleTags:target.fingerprint.styleTags,characterMode:blueprint.character.mode,characterName:blueprint.character.name,brandVersion:identityVersion}),JSON.stringify({profile:avatar.uri,banner:banner.uri,watermark:watermark.uri,socialBanner:socialBanner.uri,styleGuide:guide.uri,characterReference:characterReference?.uri??null})]);
  }
  console.log(JSON.stringify({targetType:target.kind,targetId:target.id,channelKey:target.key,status:target.kind==='candidate'?'awaiting_channel':'brand_ready',blueprint,assets},null,2));
} finally {await db.close();}
