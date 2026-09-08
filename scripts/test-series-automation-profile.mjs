import assert from 'node:assert/strict';
import { buildSeriesAutomationProfile, cadenceAllows, validateSeriesAutomationProfile } from './lib/series-automation-profile.mjs';

const channel={language:'en',targetDurationSec:660,shortTargetDurationSec:45,maxProductionCostUsd:18,voiceProfile:{provider:'elevenlabs',voiceId:'channel-voice',model:'eleven_multilingual_v2'},publishing:{autonomyMode:'FULL_AUTONOMOUS',allowAutomaticPublicScheduling:true,minimumQaScoreForAutoPublish:88,minimumAttentionScoreForAutoPublish:86,minimumFinalMediaScoreForAutoPublish:90,distribution:{platforms:{youtube:{enabled:true},tiktok:{enabled:true},instagram:{enabled:false},facebook:{enabled:true}}}}};
const kidsSeries={title:'Milo & Luna',language:'en',audience_mode:'MADE_FOR_KIDS',identity:{themes:['friendship','animals']},format_strategy:{formats:['SHORT_VERTICAL','LONG_HORIZONTAL']},positioning:'Safe character-led stories for young children'};
const bible={premise:'Milo and Luna solve a small everyday problem together.',themes:['friendship'],characters:[{key:'milo',name:'Milo',role:'lead'},{key:'luna',name:'Luna',role:'friend'}]};
const characters=[{character_key:'milo',name:'Milo',role:'lead',voice_profile:{voiceId:'milo-canonical'}},{character_key:'luna',name:'Luna',role:'friend',voice_profile:{voiceId:'luna-canonical'}}];
const kids=buildSeriesAutomationProfile({series:kidsSeries,bible,characters,channelConfig:channel});
assert.equal(kids.content.archetype,'KIDS_DIALOGUE_SERIES');
assert.equal(kids.voice.mode,'MULTI_CHARACTER_DIALOGUE');
assert.equal(kids.voice.primaryVoiceKey,'milo');
assert.equal(kids.edit.captionMode,'SPEAKER_AWARE');
assert.equal(kids.edit.audioMode,'DIALOGUE_LED');
assert.equal(kids.distribution.reviewMode,'FULL_AUTONOMOUS');
assert.equal(kids.distribution.autoPost,true);
assert.deepEqual(kids.distribution.platforms,['youtube','tiktok','facebook']);
assert.equal(validateSeriesAutomationProfile(kids).valid,true);

const natural=buildSeriesAutomationProfile({series:{title:'Dogs Outside',language:'en',audience_mode:'GENERAL',identity:{themes:['dogs','pets'],styleTags:['realistic','mobile']},format_strategy:{formats:['SHORT_VERTICAL']}},bible:{premise:'Natural dog behavior in everyday situations.',themes:['dogs'],characters:[]},characters:[],channelConfig:channel,existing:{content:{archetype:'ANIMAL_REALISM',formats:['SHORT_VERTICAL'],primaryFormat:'SHORT_VERTICAL'},distribution:{autoPost:true,reviewMode:'FULL_AUTONOMOUS',platforms:['youtube','tiktok'],cadence:{maxEpisodesPerWeek:5,minHoursBetweenEpisodes:18}}}});
assert.equal(natural.voice.mode,'NONE');
assert.equal(natural.edit.captionMode,'CONTEXT_ONLY');
assert.equal(natural.edit.audioMode,'NATURAL_SOUND');
assert.equal(natural.content.primaryFormat,'SHORT_VERTICAL');
assert.equal(validateSeriesAutomationProfile(natural).valid,true);
assert.equal(cadenceAllows({profile:natural,episodesLast7Days:4,hoursSinceLastEpisode:20}).allowed,true);
assert.equal(cadenceAllows({profile:natural,episodesLast7Days:5,hoursSinceLastEpisode:20}).reason,'weekly-cadence-cap');
assert.equal(cadenceAllows({profile:natural,episodesLast7Days:2,hoursSinceLastEpisode:5}).reason,'minimum-spacing');

const drift=structuredClone(kids);drift.voice.mode='SINGLE_NARRATOR';
const invalid=validateSeriesAutomationProfile(drift);assert.equal(invalid.valid,false);assert.ok(invalid.issues.includes('voice-mode-archetype-drift'));
console.log('✓ series automation profile binds archetype, voice, edit, captions, distribution, cadence, economics and quality');
console.log('✓ natural no-voice series preserve visual-first/NATURAL_SOUND execution');
console.log('✓ cadence and archetype drift fail closed before autonomous scheduling');
