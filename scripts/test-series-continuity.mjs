import assert from 'node:assert/strict';
import { buildSeriesContinuityContext, continuityKey, deriveSeriesFingerprint, routeContentToSeries, validateSeriesBible } from '../packages/os/dist/index.js';

const owlCharacter={
  key:'old-owl',name:'Old Owl',role:'narrator',continuityKey:'old-owl-v1',
  invariantFeatures:['round amber eyes','small blue waistcoat','silver crescent pin'],
  personalityTraits:['patient','curious','warm'],speechRules:['short calm sentences','gentle questions'],
  wardrobeRules:['always blue waistcoat','always crescent pin'],forbiddenChanges:['eye color','waistcoat color','crescent pin'],
  canonicalReferenceUri:'file:///series/old-owl-master.png'
};
const storyStyle={
  key:'moonlit-storybook',name:'Moonlit Storybook',continuityKey:'moonlit-style-v1',
  invariantFeatures:['soft hand-painted shapes','rounded silhouettes','paper-like texture'],
  palette:['midnight blue','warm amber','dusty violet'],compositionRules:['one clear focal action','simple readable backgrounds'],
  motionRules:['gentle parallax','slow expressive movement'],forbiddenChanges:['photorealism','neon cyberpunk lighting'],
  canonicalReferenceUri:'file:///series/moonlit-style-master.png'
};
const bible={
  title:'Old Owl Bedtime Stories',language:'en',premise:'Old Owl helps young forest friends solve small emotional mysteries before bedtime.',
  audience:{mode:'MADE_FOR_KIDS',targetAgeMin:3,targetAgeMax:6,developmentalStage:'preschool',vocabularyRules:['short concrete sentences','explain unfamiliar words in context'],safetyRules:['no graphic danger','no imitation-risk challenges','conflict resolves safely'],emotionalRules:['never shame a child character','end with reassurance and agency']},
  tone:['warm','curious','calm'],themes:['friendship','curiosity','small mysteries','emotional learning'],worldRules:['the forest is magical but emotionally safe','problems have understandable causes'],
  episodeStructure:['immediate gentle mystery','Old Owl notices a clue','two escalating discoveries','child-friendly emotional insight','warm payoff'],continuityRules:['relationships persist','recurring props keep appearance and meaning','resolved lessons are remembered'],recurringDevices:['three-clue pattern','moon chime payoff'],
  characters:[owlCharacter],styles:[storyStyle],
  promptPack:{script:['native preschool English','fresh mystery, same canon'],storyboard:['simple readable action'],image:['use canonical references'],video:['gentle motion'],voice:['calm warm delivery'],qa:['verify age fit and canon']}
};

const validation=validateSeriesBible(bible);
assert.equal(validation.valid,true);
assert.equal(validation.score,100);
const invalid=structuredClone(bible);invalid.audience.safetyRules=[];
assert.equal(validateSeriesBible(invalid).valid,false);
assert.ok(validateSeriesBible(invalid).issues.includes('kids-safety-rules-required'));

const fingerprint=deriveSeriesFingerprint({language:'en',topic:'Old Owl and the Lantern That Would Not Glow',format:'LONG_HORIZONTAL',signals:{audienceMode:'MADE_FOR_KIDS',targetAgeMin:3,targetAgeMax:6,episodicPotential:94,characterMode:'persistent-character',characterName:'Old Owl',themes:['friendship','small mysteries'],styleTags:['storybook','calm']}});
assert.equal(fingerprint.audienceMode,'MADE_FOR_KIDS');
assert.equal(fingerprint.characterName,'Old Owl');
const profiles=[{
  seriesId:'series-owl',seriesKey:'old-owl-bedtime',channelId:'kids-channel',title:'Old Owl Bedtime Stories',language:'en',audienceMode:'MADE_FOR_KIDS',targetAgeMin:3,targetAgeMax:6,
  themes:['friendship','small mysteries','emotional learning'],styleTags:['storybook','calm','hand-painted'],formats:['LONG_HORIZONTAL','SHORT_VERTICAL'],characterMode:'persistent-character',characterNames:['Old Owl'],enabled:true
},{
  seriesId:'series-fox',seriesKey:'fox-lab',channelId:'kids-channel',title:'Fox Lab',language:'en',audienceMode:'MADE_FOR_KIDS',targetAgeMin:4,targetAgeMax:7,
  themes:['science','experiments'],styleTags:['bright','3d'],formats:['SHORT_VERTICAL'],characterMode:'persistent-character',characterNames:['Professor Fox'],enabled:true
}];
const route=routeContentToSeries(fingerprint,profiles);
assert.equal(route.mode,'EXISTING_SERIES');
assert.equal(route.seriesId,'series-owl');
const newCharacter=deriveSeriesFingerprint({language:'en',topic:'Captain Nova Finds a Tiny Planet',format:'SHORT_VERTICAL',signals:{audienceMode:'MADE_FOR_KIDS',targetAgeMin:4,targetAgeMax:7,episodicPotential:96,characterMode:'persistent-character',characterName:'Captain Nova',themes:['space','stories'],styleTags:['comic','energetic']}});
assert.equal(routeContentToSeries(newCharacter,profiles).mode,'NEW_SERIES_CANDIDATE');

const context=buildSeriesContinuityContext({profile:profiles[0],bible,bibleVersion:3,continuityKey:continuityKey('old-owl-bedtime','bible-v3'),characters:[owlCharacter],styles:[storyStyle],episodeNumber:12,memories:[
  {type:'relationship',key:'milo-trusts-owl',importance:95,canonical:true,payload:{fact:'Milo now asks Old Owl for help when worried'}},
  {type:'prop',key:'moon-chime',importance:90,canonical:true,payload:{fact:'The moon chime rings only when a mystery is understood'}}
]});
assert.equal(context.episodeKey,'s01e012');
assert.equal(context.referenceUris.length,2);
assert.match(context.scriptGuidance,/Target children aged 3–6/);
assert.match(context.scriptGuidance,/Milo now asks Old Owl/);
assert.match(context.visualGuidance,/old-owl-v1|Old Owl/);
assert.equal(context.audienceMode,'MADE_FOR_KIDS');
console.log('✓ valid series bible preserves explicit child-audience safeguards');
console.log('✓ incompatible persistent characters cannot contaminate an existing series');
console.log('✓ recurring episodes inherit canon, memory, references and age-target guidance');
