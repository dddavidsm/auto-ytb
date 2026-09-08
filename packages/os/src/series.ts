export type SeriesAudienceMode = 'GENERAL' | 'MADE_FOR_KIDS';

export type SeriesCharacterSpec = {
  key: string;
  name: string;
  role?: string;
  continuityKey: string;
  invariantFeatures: string[];
  personalityTraits: string[];
  speechRules: string[];
  wardrobeRules: string[];
  forbiddenChanges: string[];
  voiceProfile?: Record<string, unknown>;
  canonicalReferenceUri?: string | null;
};

export type SeriesStyleSpec = {
  key: string;
  name: string;
  continuityKey: string;
  invariantFeatures: string[];
  palette: string[];
  compositionRules: string[];
  motionRules: string[];
  forbiddenChanges: string[];
  canonicalReferenceUri?: string | null;
};

export type SeriesBible = {
  title: string;
  language: string;
  premise: string;
  audience: {
    mode: SeriesAudienceMode;
    targetAgeMin?: number | null;
    targetAgeMax?: number | null;
    developmentalStage?: string | null;
    vocabularyRules: string[];
    safetyRules: string[];
    emotionalRules: string[];
  };
  tone: string[];
  themes: string[];
  worldRules: string[];
  episodeStructure: string[];
  continuityRules: string[];
  recurringDevices: string[];
  characters: SeriesCharacterSpec[];
  styles: SeriesStyleSpec[];
  promptPack: {
    script: string[];
    storyboard: string[];
    image: string[];
    video: string[];
    voice: string[];
    qa: string[];
  };
};

export type SeriesProfile = {
  seriesId: string;
  seriesKey: string;
  channelId: string;
  title: string;
  language: string;
  audienceMode: SeriesAudienceMode;
  targetAgeMin?: number | null;
  targetAgeMax?: number | null;
  themes: string[];
  styleTags: string[];
  formats: string[];
  characterMode?: 'none' | 'persistent-character' | 'host-persona';
  characterNames?: string[];
  enabled: boolean;
};

export type SeriesContentFingerprint = {
  language: string;
  topic: string;
  themes: string[];
  styleTags: string[];
  format: string;
  audienceMode: SeriesAudienceMode;
  targetAgeMin?: number | null;
  targetAgeMax?: number | null;
  characterMode?: 'none' | 'persistent-character' | 'host-persona';
  characterName?: string | null;
  episodicPotential: number;
};

export type SeriesRouteDecision = {
  mode: 'EXISTING_SERIES' | 'NEW_SERIES_CANDIDATE' | 'STANDALONE';
  seriesId?: string;
  seriesKey?: string;
  routeScore: number;
  rationale: string[];
};

export type EpisodeMemory = {
  type: string;
  key: string;
  importance: number;
  canonical: boolean;
  payload: Record<string, unknown>;
};

export type SeriesContinuityContext = {
  required: boolean;
  seriesId: string;
  seriesKey: string;
  seriesTitle: string;
  bibleVersion: number;
  continuityKey: string;
  audienceMode: SeriesAudienceMode;
  targetAgeMin?: number | null;
  targetAgeMax?: number | null;
  seasonNumber: number;
  episodeNumber: number;
  episodeKey: string;
  characterContinuityKeys: string[];
  styleContinuityKeys: string[];
  referenceUris: string[];
  canonicalMemory: EpisodeMemory[];
  scriptGuidance: string;
  visualGuidance: string;
  qaGuidance: string;
};

const STOP_WORDS = new Set(['the','a','an','and','or','of','to','in','on','for','with','how','why','what','this','that','from','into','is','are','was','were','new','latest','episode','story']);
const clean=(value:string)=>value.trim().toLowerCase();
const unique=(values:string[])=>[...new Set(values.map(clean).filter(Boolean))];
const normalizeSet=(values:string[])=>new Set(unique(values));
function overlap(a:string[],b:string[]){const left=normalizeSet(a),right=normalizeSet(b);if(!left.size||!right.size)return 0;let hits=0;for(const value of left)if(right.has(value))hits+=1;return hits/Math.max(1,Math.min(left.size,right.size));}
function topicTerms(text:string){return unique(text.toLowerCase().replace(/[^a-z0-9\s-]/g,' ').split(/\s+/).filter((value)=>value.length>2&&!STOP_WORDS.has(value))).slice(0,14);}
function clamp(value:number,min=0,max=100){return Math.max(min,Math.min(max,value));}
function slug(value:string){return clean(value).replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').replace(/-+/g,'-').slice(0,84)||'series';}
function stableHash(value:string){let hash=2166136261;for(let i=0;i<value.length;i+=1){hash^=value.charCodeAt(i);hash=Math.imul(hash,16777619);}return (hash>>>0).toString(36);}
export function continuityKey(namespace:string,value:string){return `${slug(namespace)}-${stableHash(`${namespace}:${value}`)}`;}

export function deriveSeriesFingerprint(input:{
  language?:string|null;
  topic:string;
  format:string;
  channelThemes?:string[];
  channelStyleTags?:string[];
  signals?:Record<string,unknown>|null;
}):SeriesContentFingerprint{
  const signals=input.signals??{};
  const styleFingerprint=(signals.styleFingerprint&&typeof signals.styleFingerprint==='object'?signals.styleFingerprint:{}) as Record<string,unknown>;
  const explicitThemes=Array.isArray(styleFingerprint.themes)?styleFingerprint.themes.map(String):Array.isArray(signals.themes)?(signals.themes as unknown[]).map(String):[];
  const explicitStyles=Array.isArray(styleFingerprint.styleTags)?styleFingerprint.styleTags.map(String):Array.isArray(signals.styleTags)?(signals.styleTags as unknown[]).map(String):[];
  const rawMode=String(styleFingerprint.characterMode??signals.characterMode??'none');
  const characterMode:SeriesContentFingerprint['characterMode']=rawMode==='persistent-character'||rawMode==='host-persona'?rawMode:'none';
  const characterName=characterMode==='none'?null:String(styleFingerprint.characterName??signals.characterName??'').trim()||null;
  const madeForKids=Boolean(signals.madeForKids===true||signals.audienceMode==='MADE_FOR_KIDS'||signals.kidAudience===true||Number(signals.kidAudienceFit??0)>=65);
  const ageMinRaw=Number(signals.targetAgeMin??signals.ageMin);
  const ageMaxRaw=Number(signals.targetAgeMax??signals.ageMax);
  const episodicPotential=clamp(Number(signals.episodicPotential??signals.seriesPotential??(characterMode!=='none'?82:madeForKids?72:35)));
  return {
    language:String(styleFingerprint.language??input.language??'en').toLowerCase(),
    topic:input.topic,
    themes:unique([...explicitThemes,...(input.channelThemes??[]),...topicTerms(input.topic)]).slice(0,18),
    styleTags:unique([...explicitStyles,...(input.channelStyleTags??[])]).slice(0,16),
    format:input.format,
    audienceMode:madeForKids?'MADE_FOR_KIDS':'GENERAL',
    targetAgeMin:Number.isFinite(ageMinRaw)?Math.max(0,Math.floor(ageMinRaw)):null,
    targetAgeMax:Number.isFinite(ageMaxRaw)?Math.max(0,Math.floor(ageMaxRaw)):null,
    characterMode,
    characterName,
    episodicPotential,
  };
}

function ageOverlap(content:SeriesContentFingerprint,series:SeriesProfile){
  if(content.audienceMode!==series.audienceMode)return 0;
  if(content.targetAgeMin==null||content.targetAgeMax==null||series.targetAgeMin==null||series.targetAgeMax==null)return 0.8;
  const left=Math.max(content.targetAgeMin,series.targetAgeMin),right=Math.min(content.targetAgeMax,series.targetAgeMax);
  return left<=right?1:0;
}

export function scoreSeriesFit(content:SeriesContentFingerprint,series:SeriesProfile):SeriesRouteDecision{
  if(!series.enabled)return{mode:'STANDALONE',routeScore:0,rationale:['Series disabled']};
  const rationale:string[]=[];
  const language=content.language===series.language.toLowerCase()?1:0;
  const theme=overlap(content.themes,series.themes);
  const style=overlap(content.styleTags,series.styleTags);
  const format=series.formats.includes(content.format)||series.formats.includes('HYBRID')?1:0;
  const audience=ageOverlap(content,series);
  const characterRequired=(content.characterMode??'none')!=='none';
  const names=(series.characterNames??[]).map(clean);
  const character=characterRequired?(content.characterName&&names.includes(clean(content.characterName))?1:0):(series.characterMode??'none')==='none'?1:0.75;
  if(language)rationale.push('Language matches series canon');
  if(theme>=0.5)rationale.push('Strong thematic overlap with the series');
  if(style>=0.5)rationale.push('Visual/narrative style matches the series');
  if(audience>=0.8)rationale.push('Audience and age band are compatible');
  if(characterRequired&&character)rationale.push('Persistent character matches series canon');
  if(characterRequired&&!character)rationale.push('Persistent character conflicts with series canon');
  const score=Math.round((language*16+theme*20+style*18+format*8+audience*13+character*25)*10)/10;
  return score>=74
    ?{mode:'EXISTING_SERIES',seriesId:series.seriesId,seriesKey:series.seriesKey,routeScore:score,rationale}
    :{mode:content.episodicPotential>=65||characterRequired||content.audienceMode==='MADE_FOR_KIDS'?'NEW_SERIES_CANDIDATE':'STANDALONE',routeScore:score,rationale};
}

export function routeContentToSeries(content:SeriesContentFingerprint,series:SeriesProfile[]):SeriesRouteDecision{
  const ranked=series.map((item)=>scoreSeriesFit(content,item)).sort((a,b)=>b.routeScore-a.routeScore);
  const best=ranked[0];
  if(best?.mode==='EXISTING_SERIES')return best;
  const shouldCreate=content.episodicPotential>=65||(content.characterMode??'none')!=='none'||content.audienceMode==='MADE_FOR_KIDS';
  return shouldCreate
    ?{mode:'NEW_SERIES_CANDIDATE',routeScore:best?.routeScore??0,rationale:[...(best?.rationale??[]),'Content has enough episodic/identity value to preserve as a reusable series rather than a one-off.']}
    :{mode:'STANDALONE',routeScore:best?.routeScore??0,rationale:[...(best?.rationale??[]),'No series fit is strong enough and episodic value is below the creation threshold.']};
}

export function seriesCandidateKey(fingerprint:SeriesContentFingerprint){
  const identity=fingerprint.characterName?slug(fingerprint.characterName):slug(fingerprint.themes.slice(0,3).join('-')||fingerprint.topic);
  return `${identity}-${fingerprint.audienceMode==='MADE_FOR_KIDS'?'kids':'series'}-${fingerprint.language}`.slice(0,96);
}

export function validateSeriesBible(bible:SeriesBible):{valid:boolean;score:number;issues:string[]}{
  const issues:string[]=[];
  if(!bible.title?.trim())issues.push('missing-title');
  if(!bible.language?.trim())issues.push('missing-language');
  if(!bible.premise?.trim())issues.push('missing-premise');
  if(!bible.episodeStructure?.length)issues.push('missing-episode-structure');
  if(!bible.continuityRules?.length)issues.push('missing-continuity-rules');
  if(!bible.styles?.length)issues.push('missing-style-spec');
  for(const character of bible.characters??[]){
    if(!character.key||!character.name||!character.continuityKey)issues.push(`invalid-character:${character.name||character.key||'unknown'}`);
    if(!character.invariantFeatures?.length)issues.push(`missing-character-invariants:${character.name||character.key}`);
  }
  for(const style of bible.styles??[]){
    if(!style.key||!style.continuityKey)issues.push(`invalid-style:${style.name||style.key||'unknown'}`);
    if(!style.invariantFeatures?.length)issues.push(`missing-style-invariants:${style.name||style.key}`);
  }
  if(bible.audience?.mode==='MADE_FOR_KIDS'){
    if(bible.audience.targetAgeMin==null||bible.audience.targetAgeMax==null)issues.push('kids-age-band-required');
    if(!bible.audience.vocabularyRules?.length)issues.push('kids-vocabulary-rules-required');
    if(!bible.audience.safetyRules?.length)issues.push('kids-safety-rules-required');
    if(!bible.audience.emotionalRules?.length)issues.push('kids-emotional-rules-required');
  }
  const score=clamp(100-issues.length*12);
  return{valid:issues.length===0,score,issues};
}

export function buildSeriesContinuityContext(input:{
  profile:SeriesProfile;
  bible:SeriesBible;
  bibleVersion:number;
  continuityKey:string;
  characters?:SeriesCharacterSpec[];
  styles?:SeriesStyleSpec[];
  memories?:EpisodeMemory[];
  seasonNumber?:number;
  episodeNumber:number;
}):SeriesContinuityContext{
  const characters=input.characters?.length?input.characters:input.bible.characters;
  const styles=input.styles?.length?input.styles:input.bible.styles;
  const memory=[...(input.memories??[])].filter((item)=>item.canonical!==false).sort((a,b)=>b.importance-a.importance).slice(0,20);
  const referenceUris=[...new Set([...characters.map((item)=>item.canonicalReferenceUri),...styles.map((item)=>item.canonicalReferenceUri)].filter(Boolean).map(String))].slice(0,8);
  const ageLabel=input.profile.audienceMode==='MADE_FOR_KIDS'
    ?`Target children aged ${input.profile.targetAgeMin??'?'}–${input.profile.targetAgeMax??'?'}.`
    :'General audience.';
  const memoryText=memory.map((item)=>`${item.type}:${item.key}=${JSON.stringify(item.payload)}`).join(' | ');
  const characterRules=characters.flatMap((item)=>[
    `${item.name} must preserve: ${item.invariantFeatures.join(', ')}.`,
    item.speechRules.length?`${item.name} speech rules: ${item.speechRules.join('; ')}.`:'',
    item.forbiddenChanges.length?`Never change ${item.name}: ${item.forbiddenChanges.join('; ')}.`:'',
  ]).filter(Boolean).join(' ');
  const styleRules=styles.map((item)=>`${item.name}: preserve ${item.invariantFeatures.join(', ')}; palette ${item.palette.join(', ')}; composition ${item.compositionRules.join('; ')}.`).join(' ');
  const kidsRules=input.bible.audience.mode==='MADE_FOR_KIDS'
    ?`Vocabulary rules: ${input.bible.audience.vocabularyRules.join('; ')}. Safety rules: ${input.bible.audience.safetyRules.join('; ')}. Emotional rules: ${input.bible.audience.emotionalRules.join('; ')}.`
    :'';
  const episodeKey=`s${String(input.seasonNumber??1).padStart(2,'0')}e${String(input.episodeNumber).padStart(3,'0')}`;
  return{
    required:true,
    seriesId:input.profile.seriesId,
    seriesKey:input.profile.seriesKey,
    seriesTitle:input.profile.title,
    bibleVersion:input.bibleVersion,
    continuityKey:input.continuityKey,
    audienceMode:input.profile.audienceMode,
    targetAgeMin:input.profile.targetAgeMin,
    targetAgeMax:input.profile.targetAgeMax,
    seasonNumber:input.seasonNumber??1,
    episodeNumber:input.episodeNumber,
    episodeKey,
    characterContinuityKeys:characters.map((item)=>item.continuityKey),
    styleContinuityKeys:styles.map((item)=>item.continuityKey),
    referenceUris,
    canonicalMemory:memory,
    scriptGuidance:[
      `This belongs to the persistent series "${input.profile.title}". Treat its bible as canon, not inspiration.`,
      ageLabel,
      `Series premise: ${input.bible.premise}`,
      `Episode structure: ${input.bible.episodeStructure.join(' → ')}.`,
      `World rules: ${input.bible.worldRules.join('; ')}.`,
      `Continuity rules: ${input.bible.continuityRules.join('; ')}.`,
      characterRules,kidsRules,
      memoryText?`Canonical memory from prior episodes: ${memoryText}. Do not contradict it.`:'',
      'Create a new episode with a fresh problem/payoff while preserving all established canon. Do not reset relationships, props, discoveries or unresolved arcs unless the story explicitly resolves them.',
    ].filter(Boolean).join('\n'),
    visualGuidance:[
      `Series continuity key ${input.continuityKey}.`,
      styleRules,
      characterRules,
      'Every recurring character, prop, location and drawing style must remain recognizably the same across episodes. Composition may vary; identity may not drift.',
    ].filter(Boolean).join(' '),
    qaGuidance:`Verify series bible v${input.bibleVersion}, character/style continuity keys, age-target rules, world canon, prior episode memory and episode-level narrative consistency before release.`,
  };
}

export function summarizeEpisodeMemory(memories:EpisodeMemory[],limit=12){
  return [...memories].filter((item)=>item.active!==false&&item.canonical!==false).sort((a,b)=>b.importance-a.importance).slice(0,Math.max(1,limit));
}
