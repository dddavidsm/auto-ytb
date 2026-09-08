export type ChannelIdentityProfile = {
  channelId: string;
  channelKey: string;
  language: string;
  positioning: string;
  characterMode?: 'none' | 'persistent-character' | 'host-persona';
  characterName?: string | null;
  themes: string[];
  styleTags: string[];
  formats: string[];
  enabled: boolean;
};

export type ContentStyleFingerprint = {
  language: string;
  topic: string;
  themes: string[];
  styleTags: string[];
  format: string;
  characterMode?: 'none' | 'persistent-character' | 'host-persona';
  characterName?: string | null;
};

export type ChannelRouteDecision = {
  mode: 'EXISTING_CHANNEL' | 'NEW_CHANNEL_CANDIDATE' | 'REJECT';
  channelId?: string;
  channelKey?: string;
  routeScore: number;
  rationale: string[];
};

function norm(values:string[]){return new Set(values.map((value)=>value.trim().toLowerCase()).filter(Boolean));}
function overlap(a:string[],b:string[]){const left=norm(a),right=norm(b);if(!left.size||!right.size)return 0;let hits=0;for(const value of left)if(right.has(value))hits++;return hits/Math.max(1,Math.min(left.size,right.size));}

export function scoreChannelFit(content:ContentStyleFingerprint,channel:ChannelIdentityProfile):ChannelRouteDecision{
  if(!channel.enabled)return {mode:'REJECT',routeScore:0,rationale:['Channel disabled']};
  const rationale:string[]=[];
  const language=content.language.toLowerCase()===channel.language.toLowerCase()?1:0;
  const theme=overlap(content.themes,channel.themes);
  const style=overlap(content.styleTags,channel.styleTags);
  const format=channel.formats.includes(content.format)?1:0;
  const sameCharacterMode=(content.characterMode??'none')===(channel.characterMode??'none');
  const characterRequired=(content.characterMode??'none')!=='none';
  const sameCharacter=!characterRequired || (sameCharacterMode && Boolean(content.characterName) && content.characterName===channel.characterName);
  if(language)rationale.push('Language matches channel DNA');
  if(theme>=0.5)rationale.push('Strong thematic overlap');
  if(style>=0.5)rationale.push('Strong visual/narrative style overlap');
  if(format)rationale.push('Format supported by channel');
  if(characterRequired&&sameCharacter)rationale.push('Persistent character identity matches');
  if(characterRequired&&!sameCharacter)rationale.push('Character identity conflicts with this channel');
  const characterScore=characterRequired?(sameCharacter?1:0):(sameCharacterMode?1:0.7);
  const score=Math.round((language*28+theme*24+style*22+format*12+characterScore*14)*10)/10;
  return {mode:score>=72?'EXISTING_CHANNEL':'NEW_CHANNEL_CANDIDATE',channelId:score>=72?channel.channelId:undefined,channelKey:score>=72?channel.channelKey:undefined,routeScore:score,rationale};
}

export function routeContentToChannel(content:ContentStyleFingerprint,channels:ChannelIdentityProfile[]):ChannelRouteDecision{
  const ranked=channels.map((channel)=>scoreChannelFit(content,channel)).sort((a,b)=>b.routeScore-a.routeScore);
  const best=ranked[0];
  if(!best||best.routeScore<72){
    const character=content.characterMode&&content.characterMode!=='none';
    return {mode:'NEW_CHANNEL_CANDIDATE',routeScore:best?.routeScore??0,rationale:[...(best?.rationale??[]),character?'Distinct character/persona should receive an isolated channel identity.':'No existing channel clears the identity-fit threshold.']};
  }
  return best;
}
