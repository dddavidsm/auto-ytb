import assert from 'node:assert/strict';
import { buildChannelBrandBlueprint, deriveContentStyleFingerprint, routeContentToChannel, decideAutonomousPublication } from '../packages/os/dist/index.js';
import { synchronizeTimelineToVoice } from '../packages/production/dist/index.js';
import { projectChannelCredentials, scopedName } from './lib/channel-env.mjs';

const channels=[{channelId:'tech',channelKey:'future-tech-business-en',language:'en',positioning:'tech documentaries',characterMode:'none',themes:['ai','technology','business'],styleTags:['cinematic','documentary','analytical'],formats:['LONG_HORIZONTAL','SHORT_VERTICAL'],enabled:true},{channelId:'story',channelKey:'old-owl-stories-en',language:'en',positioning:'stories narrated by Old Owl',characterMode:'persistent-character',characterName:'Old Owl',themes:['stories','folklore'],styleTags:['cozy','illustrated','bedtime'],formats:['LONG_HORIZONTAL','SHORT_VERTICAL'],enabled:true}];
const fingerprint=deriveContentStyleFingerprint({language:'en',topic:'How AI agents are changing software businesses',niche:'future-tech-business',format:'LONG_HORIZONTAL',signals:{themes:['ai','technology','business'],styleTags:['cinematic','documentary','analytical']}});
const tech=routeContentToChannel(fingerprint,channels);assert.equal(tech.mode,'EXISTING_CHANNEL');assert.equal(tech.channelId,'tech');
const owl=routeContentToChannel({language:'en',topic:'A village folktale',themes:['stories','folklore'],styleTags:['cozy','illustrated','bedtime'],format:'LONG_HORIZONTAL',characterMode:'persistent-character',characterName:'Old Owl'},channels);assert.equal(owl.mode,'EXISTING_CHANNEL');assert.equal(owl.channelId,'story');
const novaFingerprint={language:'en',topic:'Space stories',themes:['stories','space'],styleTags:['comic','energetic'],format:'SHORT_VERTICAL',characterMode:'persistent-character',characterName:'Captain Nova'};
const newCharacter=routeContentToChannel(novaFingerprint,channels);assert.equal(newCharacter.mode,'NEW_CHANNEL_CANDIDATE');
const brand=buildChannelBrandBlueprint({candidateKey:'captain-nova-en',proposedName:'Captain Nova',positioning:'Animated space stories told by Captain Nova.',fingerprint:novaFingerprint});
assert.equal(brand.character.name,'Captain Nova');assert.ok(brand.character.referencePrompt?.includes('canonical character reference'));assert.ok(brand.prompts.avatar.includes('canonical character reference'));assert.ok(brand.visualRules.some((rule)=>rule.includes('face proportions')));assert.ok(brand.character.continuityKey.length>10);

const autonomous=decideAutonomousPublication({autonomyMode:'FULL_AUTONOMOUS',allowAutomaticPublicScheduling:true,minimumQaScoreForAutoPublish:88,minimumResearchConfidenceForAutoPublish:78,blockOnUnresolvedRights:true,blockOnPolicyWarning:true,autoPublishDelayMinutes:30},{qaScore:94,researchConfidence:91,qaBlockers:[],unresolvedRights:0,policyWarnings:0,youtubeVideoId:'yt-1'},new Date('2026-09-08T08:00:00Z'));assert.equal(autonomous.action,'SCHEDULE');assert.equal(autonomous.publishAt,'2026-09-08T08:30:00.000Z');
const rightsBlocked=decideAutonomousPublication({autonomyMode:'FULL_AUTONOMOUS',allowAutomaticPublicScheduling:true,minimumQaScoreForAutoPublish:88,minimumResearchConfidenceForAutoPublish:78,blockOnUnresolvedRights:true,blockOnPolicyWarning:true},{qaScore:94,researchConfidence:91,qaBlockers:[],unresolvedRights:1,policyWarnings:0,youtubeVideoId:'yt-1'});assert.equal(rightsBlocked.action,'KEEP_PRIVATE');assert.ok(rightsBlocked.reasons.some((reason)=>reason.includes('rights')));

const env={YOUTUBE_CLIENT_ID:'primary-id',YOUTUBE_CLIENT_SECRET:'primary-secret',YOUTUBE_REFRESH_TOKEN:'primary-refresh',YOUTUBE_CHANNEL_ID:'primary-channel',YOUTUBE_CLIENT_ID__OWL:'owl-id',YOUTUBE_CLIENT_SECRET__OWL:'owl-secret',YOUTUBE_REFRESH_TOKEN__OWL:'owl-refresh',YOUTUBE_CHANNEL_ID__OWL:'owl-channel'};
assert.equal(scopedName('YOUTUBE_REFRESH_TOKEN','OWL'),'YOUTUBE_REFRESH_TOKEN__OWL');
const owlCreds=projectChannelCredentials(env,'OWL');assert.equal(owlCreds.YOUTUBE_CLIENT_ID,'owl-id');assert.equal(owlCreds.YOUTUBE_CHANNEL_ID,'owl-channel');assert.notEqual(owlCreds.YOUTUBE_REFRESH_TOKEN,env.YOUTUBE_REFRESH_TOKEN);
const primaryCreds=projectChannelCredentials(env,'PRIMARY');assert.equal(primaryCreds.YOUTUBE_CLIENT_ID,'primary-id');assert.equal(primaryCreds.YOUTUBE_CHANNEL_ID,'primary-channel');

const script={title:'T',language:'en',targetDurationSec:20,thesis:'t',beats:[{id:'b1',startSec:0,targetDurationSec:10,purpose:'hook',narration:'Hello world',visualIntent:'x',sourceIds:[]},{id:'b2',startSec:10,targetDurationSec:10,purpose:'payoff',narration:'The end',visualIntent:'y',sourceIds:[]}],outro:'x'};
const scenes=[{id:'b1-s1',startSec:0,durationSec:10,kind:'motion_graphic',instruction:'x',sourceIds:[],generated:false},{id:'b2-s1',startSec:10,durationSec:10,kind:'motion_graphic',instruction:'y',sourceIds:[],generated:false}];
const text='Hello world\n\nThe end',chars=[...text],alignment={characters:chars,characterStartTimesSeconds:chars.map((_,index)=>index*0.5),characterEndTimesSeconds:chars.map((_,index)=>(index+1)*0.5)};
const synced=synchronizeTimelineToVoice(script,scenes,alignment,chars.length*0.5);assert.ok(synced.alignmentCoverage>0.8);assert.equal(synced.script.targetDurationSec,chars.length*0.5);assert.ok(synced.script.beats[1].startSec>synced.script.beats[0].startSec);assert.ok(synced.scenes[1].startSec>synced.scenes[0].startSec);
console.log('✓ content identity routes compatible styles to the right channel');
console.log('✓ distinct persistent characters create isolated channel candidates');
console.log('✓ brand blueprint preserves a stable character continuity key');
console.log('✓ full autonomy schedules only when QA/research/rights gates pass');
console.log('✓ channel OAuth credentials stay isolated by credentialsRef');
console.log('✓ narration timestamps retime script and visual timeline');
