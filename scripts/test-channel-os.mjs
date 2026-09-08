import assert from 'node:assert/strict';
import { routeContentToChannel, decideAutonomousPublication } from '../packages/os/dist/index.js';
import { synchronizeTimelineToVoice } from '../packages/production/dist/index.js';

const channels=[{channelId:'tech',channelKey:'future-tech-business-en',language:'en',positioning:'tech documentaries',characterMode:'none',themes:['ai','technology','business'],styleTags:['cinematic','documentary','analytical'],formats:['LONG_HORIZONTAL','SHORT_VERTICAL'],enabled:true},{channelId:'story',channelKey:'old-owl-stories-en',language:'en',positioning:'stories narrated by Old Owl',characterMode:'persistent-character',characterName:'Old Owl',themes:['stories','folklore'],styleTags:['cozy','illustrated','bedtime'],formats:['LONG_HORIZONTAL','SHORT_VERTICAL'],enabled:true}];
const tech=routeContentToChannel({language:'en',topic:'AI agents',themes:['ai','technology'],styleTags:['cinematic','documentary'],format:'LONG_HORIZONTAL',characterMode:'none'},channels);
assert.equal(tech.mode,'EXISTING_CHANNEL'); assert.equal(tech.channelId,'tech');
const owl=routeContentToChannel({language:'en',topic:'A village folktale',themes:['stories','folklore'],styleTags:['cozy','illustrated','bedtime'],format:'LONG_HORIZONTAL',characterMode:'persistent-character',characterName:'Old Owl'},channels);
assert.equal(owl.mode,'EXISTING_CHANNEL'); assert.equal(owl.channelId,'story');
const newCharacter=routeContentToChannel({language:'en',topic:'Space stories',themes:['stories','space'],styleTags:['comic','energetic'],format:'SHORT_VERTICAL',characterMode:'persistent-character',characterName:'Captain Nova'},channels);
assert.equal(newCharacter.mode,'NEW_CHANNEL_CANDIDATE');

const autonomous=decideAutonomousPublication({autonomyMode:'FULL_AUTONOMOUS',allowAutomaticPublicScheduling:true,minimumQaScoreForAutoPublish:88,minimumResearchConfidenceForAutoPublish:78,blockOnUnresolvedRights:true,blockOnPolicyWarning:true,autoPublishDelayMinutes:30},{qaScore:94,researchConfidence:91,qaBlockers:[],unresolvedRights:0,policyWarnings:0,youtubeVideoId:'yt-1'},new Date('2026-09-08T08:00:00Z'));
assert.equal(autonomous.action,'SCHEDULE'); assert.equal(autonomous.publishAt,'2026-09-08T08:30:00.000Z');
const rightsBlocked=decideAutonomousPublication({autonomyMode:'FULL_AUTONOMOUS',allowAutomaticPublicScheduling:true,minimumQaScoreForAutoPublish:88,minimumResearchConfidenceForAutoPublish:78,blockOnUnresolvedRights:true,blockOnPolicyWarning:true},{qaScore:94,researchConfidence:91,qaBlockers:[],unresolvedRights:1,policyWarnings:0,youtubeVideoId:'yt-1'});
assert.equal(rightsBlocked.action,'KEEP_PRIVATE'); assert.ok(rightsBlocked.reasons.some((reason)=>reason.includes('rights')));

const script={title:'T',language:'en',targetDurationSec:20,thesis:'t',beats:[{id:'b1',startSec:0,targetDurationSec:10,purpose:'hook',narration:'Hello world',visualIntent:'x',sourceIds:[]},{id:'b2',startSec:10,targetDurationSec:10,purpose:'payoff',narration:'The end',visualIntent:'y',sourceIds:[]}],outro:'x'};
const scenes=[{id:'b1-s1',startSec:0,durationSec:10,kind:'motion_graphic',instruction:'x',sourceIds:[],generated:false},{id:'b2-s1',startSec:10,durationSec:10,kind:'motion_graphic',instruction:'y',sourceIds:[],generated:false}];
const text='Hello world\n\nThe end';
const chars=[...text];
const alignment={characters:chars,characterStartTimesSeconds:chars.map((_,index)=>index*0.5),characterEndTimesSeconds:chars.map((_,index)=>(index+1)*0.5)};
const synced=synchronizeTimelineToVoice(script,scenes,alignment,chars.length*0.5);
assert.ok(synced.alignmentCoverage>0.8); assert.equal(synced.script.targetDurationSec,chars.length*0.5); assert.ok(synced.script.beats[1].startSec>synced.script.beats[0].startSec); assert.ok(synced.scenes[1].startSec>synced.scenes[0].startSec);
console.log('✓ content identity routes compatible styles to the right channel');
console.log('✓ distinct persistent character creates a new-channel candidate');
console.log('✓ full autonomy schedules only when QA/research/rights gates pass');
console.log('✓ narration timestamps retime script and visual timeline');
