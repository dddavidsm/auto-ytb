import assert from 'node:assert/strict';
import { reviewAttentionBlueprint } from '../packages/qa/dist/index.js';
import { extractCreativeFingerprint, alignRetentionToCreativeSegments, featureSignalsFromObservations } from '../packages/analytics/dist/index.js';

const packaging=[{id:'p1',title:'Why This System Suddenly Broke',thumbnailConcept:'broken system',thumbnailText:'IT BROKE',promise:'Why the system broke and what caused it',curiosity:92,clarity:91,credibility:90,differentiation:88,score:90}];
const strongScript={language:'en',targetDurationSec:60,thesis:'A hidden constraint caused the system to fail.',title:'Why This System Suddenly Broke',beats:[
{id:'b1',startSec:0,targetDurationSec:8,purpose:'hook',narration:'The system looked safe until one hidden constraint broke it. The obvious explanation is wrong.',visualIntent:'Immediate before and after failure',sourceIds:['s1'],retentionDevice:'open_loop'},
{id:'b2',startSec:8,targetDurationSec:12,purpose:'setup',narration:'The old design depended on an assumption that quietly stopped being true.',visualIntent:'Assumption timeline',sourceIds:['s1'],retentionDevice:'contrast'},
{id:'b3',startSec:20,targetDurationSec:12,purpose:'evidence',narration:'The data shows pressure rising before the visible failure.',visualIntent:'Evidence chart',sourceIds:['s1'],retentionDevice:'question'},
{id:'b4',startSec:32,targetDurationSec:10,purpose:'escalation',narration:'Then the weakness reached the result users cared about.',visualIntent:'Consequence escalation',sourceIds:['s1'],retentionDevice:'open_loop'},
{id:'b5',startSec:42,targetDurationSec:10,purpose:'reveal',narration:'The hidden constraint, not the new feature, caused the break.',visualIntent:'Reveal causal diagram',sourceIds:['s1'],retentionDevice:'reveal'},
{id:'b6',startSec:52,targetDurationSec:8,purpose:'payoff',narration:'Once that constraint moved, keeping the old system became the risky option.',visualIntent:'Resolve opening image',sourceIds:['s1'],retentionDevice:'reveal'}],outro:'Resolved.'};
const scenes=strongScript.beats.flatMap((beat,index)=>[{id:`${beat.id}-s1`,startSec:beat.startSec,durationSec:beat.targetDurationSec/2,kind:index%2?'motion_graphic':'ai_image',instruction:'Concrete visual explanation for the narration',sourceIds:['s1'],generated:index%2===0,visualValue:80,costTier:index%2?'free':'low',selectionReason:'test'},{id:`${beat.id}-s2`,startSec:beat.startSec+beat.targetDurationSec/2,durationSec:beat.targetDurationSec/2,kind:index%3===0?'chart':'motion_graphic',instruction:'Second visual progression beat with new information',sourceIds:['s1'],generated:false,visualValue:65,costTier:'free',selectionReason:'test'}]);
const strong=reviewAttentionBlueprint({script:strongScript,packaging,scenes,contentFormat:'LONG_HORIZONTAL',selectedPackagingId:'p1'});
assert.equal(strong.ready,true);assert.ok(strong.score>=86);assert.equal(strong.issues.some((issue)=>issue.code==='housekeeping-intro'),false);

const weakScript={...strongScript,beats:[{...strongScript.beats[0],targetDurationSec:40,narration:'Welcome back. In this video we are going to explain the system, so make sure to subscribe before we begin.',retentionDevice:'none'},...strongScript.beats.slice(1)]};
const weakScenes=[{id:'w1',startSec:0,durationSec:40,kind:'ai_image',instruction:'Generic decorative image',sourceIds:[],generated:true,visualValue:50,costTier:'low',selectionReason:'test'}];
const weak=reviewAttentionBlueprint({script:weakScript,packaging,scenes:weakScenes,contentFormat:'LONG_HORIZONTAL',selectedPackagingId:'p1'});
assert.equal(weak.ready,false);assert.ok(weak.issues.some((issue)=>issue.code==='housekeeping-intro'));assert.ok(weak.issues.some((issue)=>issue.code==='weak-hook'));

const visualPackaging=[{id:'v1',title:'Dog Saves Puppy From the Pool',thumbnailConcept:'dog rescue',thumbnailText:'JUST IN TIME',promise:'A dog saves a puppy from the pool just in time',curiosity:94,clarity:96,credibility:86,differentiation:91,score:92}];
const visualScript={language:'en',targetDurationSec:45,thesis:'A dog notices a puppy in danger and saves it from the pool.',title:'Dog Saves Puppy From the Pool',beats:[
{id:'v1',startSec:0,targetDurationSec:3,purpose:'hook',narration:'production-control only',onScreenText:'JUST IN TIME',visualIntent:'Dog suddenly notices a puppy slipping into the pool and races toward it',sourceIds:[],retentionDevice:'open_loop'},
{id:'v2',startSec:3,targetDurationSec:7,purpose:'setup',narration:'control',onScreenText:'He saw it',visualIntent:'Dog reaches the pool edge while the puppy struggles near the step',sourceIds:[],retentionDevice:'question'},
{id:'v3',startSec:10,targetDurationSec:10,purpose:'escalation',narration:'control',visualIntent:'Dog tries one angle, slips, recovers and circles to the shallow side',sourceIds:[],retentionDevice:'contrast'},
{id:'v4',startSec:20,targetDurationSec:10,purpose:'reveal',narration:'control',onScreenText:'One chance',visualIntent:'Dog finds the reachable edge and pulls the puppy toward the step',sourceIds:[],retentionDevice:'reveal'},
{id:'v5',startSec:30,targetDurationSec:15,purpose:'payoff',narration:'control',onScreenText:'Safe',visualIntent:'Puppy climbs out safely and both dogs react beside the pool',sourceIds:[],retentionDevice:'reveal'}],outro:''};
const visualScenes=[
{id:'v1-s1',startSec:0,durationSec:3,kind:'ai_video',instruction:'Immediate dog rescue hook with readable action',sourceIds:[],generated:true},
{id:'v2-s1',startSec:3,durationSec:4,kind:'ai_video',instruction:'Dog runs to pool edge with natural mobile framing',sourceIds:[],generated:true},
{id:'v2-s2',startSec:7,durationSec:3,kind:'ai_image',instruction:'Puppy position makes danger instantly understandable',sourceIds:[],generated:true},
{id:'v3-s1',startSec:10,durationSec:5,kind:'ai_video',instruction:'Failed first rescue attempt escalates visibly',sourceIds:[],generated:true},
{id:'v3-s2',startSec:15,durationSec:5,kind:'ai_image',instruction:'Dog changes position around pool',sourceIds:[],generated:true},
{id:'v4-s1',startSec:20,durationSec:5,kind:'ai_video',instruction:'Successful reach and rescue reveal',sourceIds:[],generated:true},
{id:'v4-s2',startSec:25,durationSec:5,kind:'ai_image',instruction:'Puppy reaches shallow step',sourceIds:[],generated:true},
{id:'v5-s1',startSec:30,durationSec:7,kind:'ai_video',instruction:'Puppy exits safely with clear payoff reaction',sourceIds:[],generated:true},
{id:'v5-s2',startSec:37,durationSec:4,kind:'ai_image',instruction:'Both dogs recover beside pool',sourceIds:[],generated:true},
{id:'v5-s3',startSec:41,durationSec:4,kind:'ai_video',instruction:'Natural final reaction closes the story',sourceIds:[],generated:true},
];
const visualExecution={archetypeId:'ANIMAL_REALISM',researchMode:'CREATIVE_ORIGINAL',researchRequired:false,factClaimMode:'CREATIVE_ORIGINAL',scriptMode:'VISUAL_ACTION',voiceMode:'NONE',voiceRequired:false,allowIntegratedNarrator:false,requiresCanonicalCast:false,audioMode:'NATURAL_SOUND',captionMode:'CONTEXT_ONLY',visualMode:'GENERATIVE_FIRST',realityMode:'REALISTIC_SYNTHETIC',cameraProfile:'CONSUMER_MOBILE',syntheticDisclosurePolicy:'REQUIRED_WHEN_PLATFORM_POLICY_APPLIES',preferredFormats:['SHORT_VERTICAL'],generativeSpendBias:.9,requiredCapabilities:{search:false,voice:false,image:true,video:true}};
const visual=reviewAttentionBlueprint({script:visualScript,packaging:visualPackaging,scenes:visualScenes,contentFormat:'SHORT_VERTICAL',executionPlan:visualExecution,selectedPackagingId:'v1',minScore:80});
assert.equal(visual.ready,true);assert.equal(visual.issues.some((issue)=>issue.code==='dense-language'),false);assert.equal(visual.issues.some((issue)=>issue.code==='weak-hook'),false);

const fingerprint=extractCreativeFingerprint({contentFormat:'LONG_HORIZONTAL',script:strongScript,scenes,packaging,selectedPackagingId:'p1',attentionScore:strong.score});
assert.equal(fingerprint.hookRetentionDevice,'open_loop');assert.equal(fingerprint.narrativeArchetype,'evidence-escalation-reveal');assert.ok(fingerprint.visualChangesPerMinute>5);
const retention=[{elapsedRatio:0,audienceWatchRatio:1},{elapsedRatio:.1,audienceWatchRatio:.92},{elapsedRatio:.2,audienceWatchRatio:.88},{elapsedRatio:.3,audienceWatchRatio:.74},{elapsedRatio:.4,audienceWatchRatio:.77},{elapsedRatio:.5,audienceWatchRatio:.70},{elapsedRatio:.7,audienceWatchRatio:.66},{elapsedRatio:1,audienceWatchRatio:.58}];
const observations=alignRetentionToCreativeSegments(fingerprint,retention);assert.equal(observations.length,strongScript.beats.length+scenes.length);assert.ok(observations.some((item)=>item.retentionDelta!=null&&item.retentionDelta<-.05));
const signals=featureSignalsFromObservations(observations);assert.ok(signals.some((item)=>item.featureName==='retentionDevice'&&item.featureValue==='open_loop'));assert.ok(signals.some((item)=>item.featureName==='kind'));
console.log('✓ weak housekeeping intros are rejected');
console.log('✓ strong hook + narrative payoff clears attention threshold');
console.log('✓ VISUAL_ACTION attention uses observable action/context rather than fake narrator prose');
console.log('✓ creative fingerprint captures hook, narrative and visual cadence');
console.log('✓ retention curve is attributed to beats/scenes and feature signals');
