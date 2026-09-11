export type ContentArchetypeId =
  | 'KIDS_DIALOGUE_SERIES'
  | 'CHARACTER_HOST'
  | 'ANIMAL_REALISM'
  | 'ANIMAL_TOPS'
  | 'EXPLAINER_DOCUMENTARY'
  | 'TOP_LIST'
  | 'ORIGINAL_COMEDY'
  | 'VERIFIED_REAL_STORY'
  | 'MYTH_MYSTERY'
  | 'GENERAL_STORY';

export type VoiceMode = 'NONE' | 'SINGLE_NARRATOR' | 'MULTI_CHARACTER_DIALOGUE' | 'HYBRID_DIALOGUE_NARRATION';
export type RealityMode = 'FACTUAL' | 'REALISTIC_SYNTHETIC' | 'STYLIZED_FICTION' | 'MIXED_FACT_AND_LEGEND' | 'ORIGINAL_FICTION';
export type SyntheticDisclosurePolicy = 'NORMAL' | 'REQUIRED_IF_REALISTIC_SYNTHETIC' | 'REQUIRED_WHEN_PLATFORM_POLICY_APPLIES';
export type CameraProfile = 'POLISHED_DOCUMENTARY' | 'CONSUMER_MOBILE' | 'STORYBOOK_ANIMATION' | 'SOCIAL_NATIVE' | 'CINEMATIC_STORY';

export type CaptureAesthetic = {
  enabled: boolean;
  purpose: 'none' | 'editorial-naturalism' | 'social-native-naturalism';
  targetHeight?: number;
  targetVideoBitrateKbps?: number;
  frameRate?: number;
  subtleCompression?: boolean;
  subtleSensorNoise?: boolean;
  subtleHandheldMotion?: boolean;
  exposureVariation?: boolean;
  autofocusVariation?: boolean;
  rollingShutterHint?: boolean;
  preserveSyntheticDisclosure: boolean;
};

export type ContentArchetypeProfile = {
  id: ContentArchetypeId;
  label: string;
  voiceMode: VoiceMode;
  realityMode: RealityMode;
  cameraProfile: CameraProfile;
  syntheticDisclosurePolicy: SyntheticDisclosurePolicy;
  preferredFormats: Array<'LONG_HORIZONTAL' | 'SHORT_VERTICAL'>;
  allowIntegratedNarrator: boolean;
  requiresCanonicalCast: boolean;
  researchRequired: boolean;
  factClaimMode: 'VERIFY_CLAIMS' | 'DISTINGUISH_FACT_FROM_LEGEND' | 'CREATIVE_ORIGINAL';
  hookPatterns: string[];
  scriptGuidance: string[];
  voiceGuidance: string[];
  visualGuidance: string[];
  editingGuidance: string[];
  captionGuidance: string[];
  packagingGuidance: string[];
  qaGuidance: string[];
  captureAesthetic: CaptureAesthetic;
  targetSceneDurationSec: { short: number; long: number };
  generativeSpendBias: number;
};

export type ContentArchetypeDecision = {
  archetype: ContentArchetypeId;
  confidence: number;
  reasons: string[];
  profile: ContentArchetypeProfile;
};

const mobileCapture: CaptureAesthetic = {
  enabled: true,
  purpose: 'social-native-naturalism',
  targetHeight: 1280,
  targetVideoBitrateKbps: 2200,
  frameRate: 30,
  subtleCompression: true,
  subtleSensorNoise: true,
  subtleHandheldMotion: true,
  exposureVariation: true,
  autofocusVariation: true,
  rollingShutterHint: true,
  preserveSyntheticDisclosure: true,
};

const neutralCapture: CaptureAesthetic = {
  enabled: false,
  purpose: 'none',
  preserveSyntheticDisclosure: true,
};

const universalQa = [
  'Do not mass-produce near-identical videos. The premise, narrative progression, visual plan and payoff must be materially specific to this video.',
  'Do not fabricate evidence, quotes, sources or real-world events. Keep factual claims traceable to research.',
  'Naturalistic styling must never be used to falsely claim that synthetic footage is authentic real-world footage. Preserve platform-required synthetic-media disclosure.',
  'Reject visible AI failure modes: identity drift, impossible anatomy, object morphing, unreadable fake text, temporal discontinuity, lip/voice mismatch and physically incoherent motion.',
];

const profiles: Record<ContentArchetypeId, ContentArchetypeProfile> = {
  KIDS_DIALOGUE_SERIES: {
    id: 'KIDS_DIALOGUE_SERIES', label: 'Kids character dialogue series', voiceMode: 'MULTI_CHARACTER_DIALOGUE', realityMode: 'STYLIZED_FICTION', cameraProfile: 'STORYBOOK_ANIMATION', syntheticDisclosurePolicy: 'REQUIRED_WHEN_PLATFORM_POLICY_APPLIES', preferredFormats: ['LONG_HORIZONTAL','SHORT_VERTICAL'], allowIntegratedNarrator: true, requiresCanonicalCast: true, researchRequired: false, factClaimMode: 'CREATIVE_ORIGINAL',
    hookPatterns: ['immediate character problem','visual mystery in first beat','emotionally safe unanswered question'],
    scriptGuidance: [
      'The characters themselves carry the story. Do not default to an external narrator.',
      'Write speakable character dialogue with short turns, clear intentions, reactions and interruptions appropriate to the target age. If narration is used, keep it brief, warm and integrated only when it improves comprehension or pacing.',
      'Open with an immediate character action, mystery, surprise or emotionally understandable problem. Establish the episode promise without greetings or exposition dumps.',
      'Preserve character relationships, speech patterns, recurring props, world rules and prior episode memory. Give every episode a fresh problem and satisfying payoff.',
      'For young audiences, use age-appropriate vocabulary, safe imitation patterns, reassurance after tension and no manipulative commercial pressure.',
    ],
    voiceGuidance: ['Use persistent canonical voices per recurring character. Dialogue must sound conversational rather than read aloud. Preserve individual pacing, energy and speech rules across episodes.','Allow natural pauses, reactions, breaths and sentence-length variation; avoid exaggerated robotic cadence.'],
    visualGuidance: ['Preserve canonical character models and style references in every appearance. Use readable poses, strong silhouette and one clear action per shot.','Favor expressive acting, reaction shots, object interaction and visual cause/effect over static talking heads.'],
    editingGuidance: ['Cut on action/reaction and emotional beats. Use gentle but frequent visual progression; avoid frantic edits that overwhelm the target age.','Use SFX to reinforce actions and discoveries, with music ducked under dialogue.'],
    captionGuidance: ['Captions must be large, high contrast and synchronized to the active speaker. Avoid covering faces or important action.'],
    packagingGuidance: ['Thumbnail should show the recurring character plus the episode-specific mystery/problem in one instantly readable image.','Titles should promise the new episode problem, not rely on generic episode numbering.'],
    qaGuidance: [...universalQa,'Block release if a recurring character uses the wrong voice, appearance, relationship state or age-inappropriate behavior.'],
    captureAesthetic: neutralCapture, targetSceneDurationSec: {short: 3.2, long: 6.5}, generativeSpendBias: 0.9,
  },
  CHARACTER_HOST: {
    id:'CHARACTER_HOST',label:'Persistent character host',voiceMode:'SINGLE_NARRATOR',realityMode:'ORIGINAL_FICTION',cameraProfile:'CINEMATIC_STORY',syntheticDisclosurePolicy:'REQUIRED_WHEN_PLATFORM_POLICY_APPLIES',preferredFormats:['LONG_HORIZONTAL','SHORT_VERTICAL'],allowIntegratedNarrator:false,requiresCanonicalCast:true,researchRequired:true,factClaimMode:'VERIFY_CLAIMS',
    hookPatterns:['host demonstrates consequence immediately','host asks a high-stakes question','visual contradiction'],
    scriptGuidance:['Write in the established host voice and worldview while preserving factual accuracy. The host should sound like a person with opinions, reactions and precise observations, not a generic AI narrator.','Use contractions, varied sentence lengths and specific transitions. Avoid repetitive rhetorical templates.'],
    voiceGuidance:['Use the canonical host voice and stable prosody settings. Preserve recognisable pacing while allowing emotion to react to the subject.'],
    visualGuidance:['Keep host identity exact while varying camera, pose and environment. Intercut evidence, diagrams, source-backed visuals and B-roll so the host is not visually static.'],
    editingGuidance:['Use presenter-led pacing with purposeful cutaways, punch-ins, visual evidence and callbacks.'],captionGuidance:['Readable editorial captions; emphasize only genuinely important phrases.'],packagingGuidance:['Make the host visually recognisable but let the topic-specific object/consequence dominate the thumbnail promise.'],qaGuidance:universalQa,captureAesthetic:neutralCapture,targetSceneDurationSec:{short:3.5,long:7.5},generativeSpendBias:0.75,
  },
  ANIMAL_REALISM: {
    id:'ANIMAL_REALISM',label:'Naturalistic viral animal moment',voiceMode:'NONE',realityMode:'REALISTIC_SYNTHETIC',cameraProfile:'CONSUMER_MOBILE',syntheticDisclosurePolicy:'REQUIRED_IF_REALISTIC_SYNTHETIC',preferredFormats:['SHORT_VERTICAL','LONG_HORIZONTAL'],allowIntegratedNarrator:false,requiresCanonicalCast:false,researchRequired:false,factClaimMode:'CREATIVE_ORIGINAL',
    hookPatterns:['action already happening on frame one','unexpected but plausible animal reaction','clear setup with imminent payoff'],
    scriptGuidance:['Prefer no narration. The visual event itself must carry the story. If text context is needed, keep it extremely short and do not invent a claim that the footage is a real recording.','Animal behavior must remain species-plausible unless the concept is explicitly stylized fiction. Dogs should move, look, react and interact like real dogs rather than humans in animal bodies.'],
    voiceGuidance:['No default narrator. Natural location sound, reactions and sparse SFX are preferred.'],
    visualGuidance:['Create plausible real-world animal anatomy, weight, paw contact, fur motion, eye focus, breathing and environmental interaction. Avoid extra limbs, morphing collars, sliding feet, impossible jumps, human-like mouth speech and overly cinematic lighting.','Use ordinary consumer-phone composition: imperfect framing, natural daylight or practical indoor light, plausible autofocus/exposure response, subtle hand movement and realistic motion blur. Do not add fake watermarks, timestamps or UI overlays that imply a real source.'],
    editingGuidance:['Keep the event legible and short. Do not overcut before the viewer understands what the animal is doing. Replays or punch-ins are allowed only when they add a new observation.','For a mobile-capture aesthetic, apply restrained resolution/bitrate/compression and tiny camera imperfections as an editorial look, while retaining synthetic-media provenance metadata.'],
    captionGuidance:['Usually no subtitles. If context is required, use one short social-native caption and remove it before it becomes visual clutter.'],
    packagingGuidance:['For Shorts, the first frame is the packaging: start on the animal and the unusual action. For long compilations, use one unmistakable expressive animal moment, not a collage of tiny subjects.'],
    qaGuidance:[...universalQa,'Block unnatural animal anatomy, physically impossible contact, implausible species behavior or edits that make a synthetic event appear sourced from a named real person/account.'],
    captureAesthetic: mobileCapture,targetSceneDurationSec:{short:2.6,long:5.5},generativeSpendBias:1,
  },
  ANIMAL_TOPS: {
    id:'ANIMAL_TOPS',label:'Animal ranking / top moments',voiceMode:'HYBRID_DIALOGUE_NARRATION',realityMode:'FACTUAL',cameraProfile:'SOCIAL_NATIVE',syntheticDisclosurePolicy:'REQUIRED_WHEN_PLATFORM_POLICY_APPLIES',preferredFormats:['LONG_HORIZONTAL','SHORT_VERTICAL'],allowIntegratedNarrator:true,requiresCanonicalCast:false,researchRequired:true,factClaimMode:'VERIFY_CLAIMS',
    hookPatterns:['show strongest moment before ranking begins','promise a specific escalation','tease number-one payoff without withholding basic context'],
    scriptGuidance:['The ranking needs a defensible criterion, escalating entries and fresh commentary. Do not simply describe what is visible. Add context, surprising details, comparisons or a narrative through-line.','If third-party footage is used, transform it substantially with original commentary and respect rights/provenance. If moments are generated, do not describe them as verified real clips.'],
    voiceGuidance:['Conversational host delivery with reactions and varied pacing; avoid monotonous list-reading.'],visualGuidance:['Mix source-backed licensed/cleared material, original graphics and generated illustrative material only when appropriate. Keep each entry visually distinct.'],editingGuidance:['Fast reset between entries, visible ranking progression and deliberate escalation. Avoid identical entry templates.'],captionGuidance:['Use compact captions for the ranking number, animal/context and genuinely useful facts.'],packagingGuidance:['Thumbnail should feature the single strongest animal moment with a clear ranking/emotional premise rather than ten tiny images.'],qaGuidance:universalQa,captureAesthetic:neutralCapture,targetSceneDurationSec:{short:3,long:6},generativeSpendBias:0.45,
  },
  EXPLAINER_DOCUMENTARY: {
    id:'EXPLAINER_DOCUMENTARY',label:'Explainer / documentary',voiceMode:'SINGLE_NARRATOR',realityMode:'FACTUAL',cameraProfile:'POLISHED_DOCUMENTARY',syntheticDisclosurePolicy:'REQUIRED_WHEN_PLATFORM_POLICY_APPLIES',preferredFormats:['LONG_HORIZONTAL','SHORT_VERTICAL'],allowIntegratedNarrator:true,requiresCanonicalCast:false,researchRequired:true,factClaimMode:'VERIFY_CLAIMS',
    hookPatterns:['contradiction with consequence','specific unanswered question','show outcome before explaining cause'],
    scriptGuidance:['Narration must sound researched and authored: specific observations, natural transitions, contractions where appropriate, sentence-length variation and clear opinions about what matters without inventing facts.','Build a causal story rather than a Wikipedia summary: hook → context only when needed → evidence → escalation → reveal/insight → payoff.'],
    voiceGuidance:['Natural documentary delivery with dynamic emphasis, restrained breaths/pauses and emotional response to stakes. Avoid uniform sentence-final cadence.'],visualGuidance:['Prefer evidence-led visuals: charts, diagrams, maps, source cards, screenshots, licensed/public-domain assets and generated scenes only when they clarify something that cannot be shown directly.'],editingGuidance:['Every visual change should explain, prove, escalate or refresh attention. Use motivated transitions, not decorative transition packs.'],captionGuidance:['Accurate synchronized captions; highlight key nouns/numbers sparingly.'],packagingGuidance:['Title and thumbnail should express one concrete tension or consequence and be fully paid off by the video.'],qaGuidance:universalQa,captureAesthetic:neutralCapture,targetSceneDurationSec:{short:3.2,long:8},generativeSpendBias:0.55,
  },
  TOP_LIST: {
    id:'TOP_LIST',label:'Top / ranking',voiceMode:'SINGLE_NARRATOR',realityMode:'FACTUAL',cameraProfile:'SOCIAL_NATIVE',syntheticDisclosurePolicy:'REQUIRED_WHEN_PLATFORM_POLICY_APPLIES',preferredFormats:['LONG_HORIZONTAL','SHORT_VERTICAL'],allowIntegratedNarrator:true,requiresCanonicalCast:false,researchRequired:true,factClaimMode:'VERIFY_CLAIMS',
    hookPatterns:['show a surprising entry immediately','clear ranking criterion and stakes','tease an unexpected number one'],scriptGuidance:['Use a real ranking criterion and escalation. Each entry must add a new kind of value: context, surprise, comparison, consequence or visual novelty. Never repeat the same sentence template for every item.'],voiceGuidance:['Energetic conversational narration with pacing changes between entries.'],visualGuidance:['Give each item its own visual grammar and evidence. Avoid slideshow repetition.'],editingGuidance:['Use fast chapter resets and escalation but allow important entries enough screen time to land.'],captionGuidance:['Show ranking number and one useful descriptor; avoid caption walls.'],packagingGuidance:['Sell the strongest surprising entry or ranking premise, not a generic numbered list.'],qaGuidance:universalQa,captureAesthetic:neutralCapture,targetSceneDurationSec:{short:3,long:6.5},generativeSpendBias:0.5,
  },
  ORIGINAL_COMEDY: {
    id:'ORIGINAL_COMEDY',label:'Original comedy / funny scenario',voiceMode:'HYBRID_DIALOGUE_NARRATION',realityMode:'ORIGINAL_FICTION',cameraProfile:'SOCIAL_NATIVE',syntheticDisclosurePolicy:'REQUIRED_WHEN_PLATFORM_POLICY_APPLIES',preferredFormats:['SHORT_VERTICAL','LONG_HORIZONTAL'],allowIntegratedNarrator:true,requiresCanonicalCast:false,researchRequired:false,factClaimMode:'CREATIVE_ORIGINAL',
    hookPatterns:['cold-open on awkward consequence','recognisable setup then immediate reversal','visual absurdity that is understood without explanation'],scriptGuidance:['Write setups, reactions, reversals and callbacks rather than explaining the joke. Dialogue should be interruptible, specific and character-driven. Avoid generic meme language unless it fits the character.'],voiceGuidance:['Use expressive timing, pauses, overlaps and reaction sounds. Do not read punchlines with uniform announcer cadence.'],visualGuidance:['Prioritize readable physical comedy, reaction shots and continuity of props/space.'],editingGuidance:['Comedy timing controls the cut. Hold reaction shots long enough to land; use smash cuts or zooms only when they improve the joke.'],captionGuidance:['Captions may support timing but should not explain the punchline.'],packagingGuidance:['Show the awkward/funny situation before the resolution.'],qaGuidance:universalQa,captureAesthetic:{...mobileCapture,purpose:'editorial-naturalism'},targetSceneDurationSec:{short:2.5,long:5},generativeSpendBias:0.8,
  },
  VERIFIED_REAL_STORY: {
    id:'VERIFIED_REAL_STORY',label:'Verified real story',voiceMode:'SINGLE_NARRATOR',realityMode:'FACTUAL',cameraProfile:'CINEMATIC_STORY',syntheticDisclosurePolicy:'REQUIRED_WHEN_PLATFORM_POLICY_APPLIES',preferredFormats:['LONG_HORIZONTAL','SHORT_VERTICAL'],allowIntegratedNarrator:true,requiresCanonicalCast:false,researchRequired:true,factClaimMode:'VERIFY_CLAIMS',
    hookPatterns:['verified extraordinary fact','consequence-first opening','documented turning point'],scriptGuidance:['Treat “real” as a factual claim, not a vibe. Every material event, date, quote and identity needs source support or explicit uncertainty language.','Tell it with human detail, causal progression and emotional specificity while separating documented fact from reconstruction.'],voiceGuidance:['Human storytelling cadence with restraint around tragedy or sensitive events.'],visualGuidance:['Clearly distinguish archival/source-backed evidence from illustrative reconstruction. Do not fabricate realistic “archive” aesthetics that imply nonexistent footage.'],editingGuidance:['Use timeline clarity, evidence reveals and restrained reenactment.'],captionGuidance:['Use dates, locations and names only when verified.'],packagingGuidance:['Promise the documented extraordinary element without exaggerating beyond evidence.'],qaGuidance:[...universalQa,'Block release when a material real-world claim lacks adequate evidence or a reconstruction is presented as authentic archival footage.'],captureAesthetic:neutralCapture,targetSceneDurationSec:{short:4,long:8},generativeSpendBias:0.5,
  },
  MYTH_MYSTERY: {
    id:'MYTH_MYSTERY',label:'Myth / mystery / legend',voiceMode:'SINGLE_NARRATOR',realityMode:'MIXED_FACT_AND_LEGEND',cameraProfile:'CINEMATIC_STORY',syntheticDisclosurePolicy:'REQUIRED_WHEN_PLATFORM_POLICY_APPLIES',preferredFormats:['LONG_HORIZONTAL','SHORT_VERTICAL'],allowIntegratedNarrator:true,requiresCanonicalCast:false,researchRequired:true,factClaimMode:'DISTINGUISH_FACT_FROM_LEGEND',
    hookPatterns:['uncanny claim plus evidence question','historical mystery','legend contrasted with documented fact'],scriptGuidance:['Maintain suspense without presenting folklore as established fact. Explicitly distinguish documented evidence, disputed claims, later retellings and creative reconstruction.','Use open loops that are resolved with what is actually known, not fake certainty.'],voiceGuidance:['Atmospheric but natural narration; vary intensity instead of whispering every line.'],visualGuidance:['Mix maps, documents, locations, diagrams and clearly illustrative reconstruction. Avoid fake evidence.'],editingGuidance:['Slow down for evidence, accelerate for narrative reconstruction, and use sound design to build mood without implying proof.'],captionGuidance:['Label dates, places, “legend”, “reported”, “documented” or “disputed” when relevant.'],packagingGuidance:['Create curiosity around the unresolved question without claiming the myth is proven.'],qaGuidance:[...universalQa,'Block packaging or narration that converts a myth, rumor or disputed account into an asserted fact.'],captureAesthetic:neutralCapture,targetSceneDurationSec:{short:3.8,long:7.5},generativeSpendBias:0.65,
  },
  GENERAL_STORY: {
    id:'GENERAL_STORY',label:'General narrative story',voiceMode:'SINGLE_NARRATOR',realityMode:'ORIGINAL_FICTION',cameraProfile:'CINEMATIC_STORY',syntheticDisclosurePolicy:'REQUIRED_WHEN_PLATFORM_POLICY_APPLIES',preferredFormats:['LONG_HORIZONTAL','SHORT_VERTICAL'],allowIntegratedNarrator:true,requiresCanonicalCast:false,researchRequired:false,factClaimMode:'CREATIVE_ORIGINAL',
    hookPatterns:['immediate dilemma','consequence-first story','specific strange detail'],scriptGuidance:['Write a concrete story with character intention, obstacle, escalation, decision and payoff. Use specific sensory/behavioral detail and natural spoken phrasing rather than generic motivational narration.'],voiceGuidance:['Natural expressive storytelling with varied pace and emotion.'],visualGuidance:['Maintain character/location continuity and use specific visual actions rather than generic atmospheric B-roll.'],editingGuidance:['Cut on narrative progress, reactions and reveals.'],captionGuidance:['Use synchronized captions that support comprehension without overwhelming the frame.'],packagingGuidance:['Promise the central dilemma or surprising consequence.'],qaGuidance:universalQa,captureAesthetic:neutralCapture,targetSceneDurationSec:{short:3.5,long:7},generativeSpendBias:0.7,
  },
};

const has=(text:string,pattern:RegExp)=>pattern.test(text.toLowerCase());

export function getContentArchetypeProfile(id: ContentArchetypeId): ContentArchetypeProfile {
  return profiles[id];
}

export function inferContentArchetype(input:{topic:string;contentFormat?:string|null;channelNiche?:string|null;signals?:Record<string,unknown>|null;seriesContext?:Record<string,unknown>|null;}):ContentArchetypeDecision{
  const topic=String(input.topic??'').trim();
  const niche=String(input.channelNiche??'').trim();
  const combined=`${topic} ${niche}`.toLowerCase();
  const signals=input.signals??{};
  const series=input.seriesContext??{};
  const reasons:string[]=[];
  let archetype:ContentArchetypeId='GENERAL_STORY';
  let confidence=58;

  const madeForKids=series.audienceMode==='MADE_FOR_KIDS'||signals.audienceMode==='MADE_FOR_KIDS'||signals.madeForKids===true||Number(signals.kidAudienceFit??0)>=65;
  const hasSeriesCast=Array.isArray(series.voiceCast)&&series.voiceCast.length>0||Array.isArray(series.characterContinuityKeys)&&series.characterContinuityKeys.length>0;
  const animal=has(combined,/\b(dog|dogs|puppy|puppies|cat|cats|kitten|animal|animals|pet|pets|perro|perros|gato|gatos|mascota|mascotas)\b/);
  const ranking=has(combined,/\b(top\s*\d*|ranking|ranked|best|worst|most\s+(?:funny|amazing|dangerous|intelligent|cute)|lista|mejores|peores)\b/);
  const myth=has(combined,/\b(myth|myths|legend|legends|mystery|mysteries|folklore|mythology|mito|mitos|leyenda|leyendas|misterio|misterios)\b/);
  const realStory=has(combined,/\b(true story|real story|actually happened|documented case|historia real|caso real|real events?)\b/);
  const comedy=has(combined,/\b(comedy|funny|sketch|prank|awkward|laugh|humor|gracioso|risa|comedia)\b/);
  const explain=has(combined,/\b(why|how|explained|explanation|inside|what happened|breakdown|explicado|explicacion|por que|como funciona|que paso)\b/);

  if(madeForKids&&hasSeriesCast){archetype='KIDS_DIALOGUE_SERIES';confidence=98;reasons.push('Made-for-kids series context with persistent cast requires character-led dialogue grammar.');}
  else if(hasSeriesCast){archetype='CHARACTER_HOST';confidence=92;reasons.push('Persistent series cast/identity detected.');}
  else if(animal&&ranking){archetype='ANIMAL_TOPS';confidence=94;reasons.push('Animal subject plus explicit ranking/list intent.');}
  else if(animal){archetype='ANIMAL_REALISM';confidence=88;reasons.push('Animal-led concept detected; default to behavior-first naturalistic visual storytelling.');}
  else if(realStory){archetype='VERIFIED_REAL_STORY';confidence=94;reasons.push('The premise explicitly claims real events, so factual verification is mandatory.');}
  else if(myth){archetype='MYTH_MYSTERY';confidence=91;reasons.push('Myth/legend/mystery framing requires fact-versus-legend separation.');}
  else if(comedy){archetype='ORIGINAL_COMEDY';confidence=86;reasons.push('Comedy/funny scenario intent detected.');}
  else if(ranking){archetype='TOP_LIST';confidence=88;reasons.push('Ranking/list structure detected.');}
  else if(explain||/tech|business|science|finance|history|internet|ai|cyber|company/.test(niche.toLowerCase())){archetype='EXPLAINER_DOCUMENTARY';confidence=82;reasons.push('Explanatory/documentary subject structure detected.');}
  else reasons.push('No stronger specialized grammar detected; use general narrative storytelling.');

  if(String(input.contentFormat).toUpperCase()==='SHORT_VERTICAL')reasons.push('Short-form execution will compress the archetype without changing its core grammar.');
  return{archetype,confidence,reasons,profile:getContentArchetypeProfile(archetype)};
}

export function archetypeGuidance(profile:ContentArchetypeProfile){
  return{
    script:[`CONTENT ARCHETYPE: ${profile.id} — ${profile.label}.`,...profile.scriptGuidance,...profile.voiceGuidance].join('\n'),
    packaging:[`Package specifically for ${profile.label}.`,...profile.packagingGuidance].join('\n'),
    visual:[`Visual grammar: ${profile.cameraProfile}.`,...profile.visualGuidance,...profile.editingGuidance].join(' '),
    qa:[`QA archetype ${profile.id}.`,...profile.qaGuidance].join(' '),
  };
}
