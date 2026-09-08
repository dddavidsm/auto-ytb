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

const STOP_WORDS=new Set(['the','a','an','and','or','of','to','in','on','for','with','how','why','what','this','that','from','into','is','are','was','were','new','latest']);
function clean(value:string){return value.trim().toLowerCase();}
function unique(values:string[]){return [...new Set(values.map(clean).filter(Boolean))];}
function norm(values:string[]){return new Set(unique(values));}
function overlap(a:string[],b:string[]){const left=norm(a),right=norm(b);if(!left.size||!right.size)return 0;let hits=0;for(const value of left)if(right.has(value))hits++;return hits/Math.max(1,Math.min(left.size,right.size));}
function topicTerms(text:string){return unique(text.toLowerCase().replace(/[^a-z0-9\s-]/g,' ').split(/\s+/).filter((value)=>value.length>2&&!STOP_WORDS.has(value))).slice(0,12);}

export function deriveContentStyleFingerprint(input:{
  language?:string|null;
  topic:string;
  niche?:string|null;
  format:string;
  signals?:Record<string,unknown>|null;
}):ContentStyleFingerprint{
  const signals=input.signals??{};
  const explicit=(signals.styleFingerprint && typeof signals.styleFingerprint==='object' ? signals.styleFingerprint : {}) as Record<string,unknown>;
  const explicitThemes=Array.isArray(explicit.themes)?explicit.themes.map(String):Array.isArray(signals.themes)?(signals.themes as unknown[]).map(String):[];
  const explicitStyles=Array.isArray(explicit.styleTags)?explicit.styleTags.map(String):Array.isArray(signals.styleTags)?(signals.styleTags as unknown[]).map(String):[];
  const nicheTerms=input.niche?input.niche.split(/[-_/\s]+/):[];
  const themes=unique([...explicitThemes,...nicheTerms,...topicTerms(input.topic)]).slice(0,16);
  const styleTags=unique(explicitStyles.length?explicitStyles:['documentary','evidence-led','analytical']);
  const rawMode=String(explicit.characterMode??signals.characterMode??'none');
  const characterMode:ContentStyleFingerprint['characterMode']=rawMode==='persistent-character'||rawMode==='host-persona'?rawMode:'none';
  const characterName=characterMode==='none'?null:String(explicit.characterName??signals.characterName??'').trim()||null;
  return {language:String(explicit.language??input.language??'en').toLowerCase(),topic:input.topic,themes,styleTags,format:input.format,characterMode,characterName};
}

export function candidateKeyForFingerprint(fingerprint:ContentStyleFingerprint):string{
  const character=fingerprint.characterName?clean(fingerprint.characterName).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''):'';
  const seed=character||fingerprint.themes.slice(0,3).join('-')||topicTerms(fingerprint.topic).slice(0,3).join('-')||'channel';
  return `${seed}-${fingerprint.language}`.replace(/-+/g,'-').slice(0,96);
}

export function scoreChannelFit(content:ContentStyleFingerprint,channel:ChannelIdentityProfile):ChannelRouteDecision{
  if(!channel.enabled)return {mode:'REJECT',routeScore:0,rationale:['Channel disabled']};
  const rationale:string[]=[];
  const language=content.language.toLowerCase()===channel.language.toLowerCase()?1:0;
  const theme=overlap(content.themes,channel.themes);
  const style=overlap(content.styleTags,channel.styleTags);
  const format=channel.formats.includes(content.format)||channel.formats.includes('HYBRID')?1:0;
  const sameCharacterMode=(content.characterMode??'none')===(channel.characterMode??'none');
  const characterRequired=(content.characterMode??'none')!=='none';
  const sameCharacter=!characterRequired || (sameCharacterMode && Boolean(content.characterName) && clean(content.characterName??'')===clean(channel.characterName??''));
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
