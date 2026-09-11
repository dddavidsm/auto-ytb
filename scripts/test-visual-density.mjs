import assert from 'node:assert/strict';
import { planScenes } from '@auto-ytb/production';

const beats=[
  ['hook','3M LINES IN 7 DAYS: DOES IT RUN?'],
  ['setup','1,000 COMMITS / HR: MERGE CONFLICTS'],
  ['escalation','PLANNERS VS WORKERS'],
  ['reveal','STRESS TEST: NOT CHROMIUM'],
  ['payoff','THE FUTURE: HARNESS DESIGN'],
].map(([purpose,onScreenText],index)=>({
  id:`beat_${index+1}`,startSec:index*12,targetDurationSec:12,purpose,narration:`A complete narrated beat for ${onScreenText}.`,onScreenText,visualIntent:`Specific visual explanation for ${onScreenText}.`,sourceIds:[],retentionDevice:purpose==='hook'?'question':'contrast',
}));
const scenes=planScenes({title:'density',language:'en',targetDurationSec:60,thesis:'test',outro:'',beats},{targetSceneDurationSec:3.2,visualMode:'EVIDENCE_FIRST',generativeSpendBias:0.65});
const generated=scenes.filter((scene)=>scene.kind==='ai_image'||scene.kind==='ai_video');
const procedural=scenes.filter((scene)=>['motion_graphic','chart','source_card','text'].includes(scene.kind));
assert.ok(scenes.length>=18,`Shorts need a dense shot plan, got ${scenes.length}`);
assert.ok(generated.length>=10,`Anchor beats should receive multiple specific visuals, got ${generated.length}`);
assert.ok(procedural.length>=4,'The plan should retain low-cost explanatory motion graphics');
assert.ok(scenes.every((scene)=>scene.instruction.length>40),'Every shot needs an actionable visual instruction');
console.log(`✓ Shorts visual density creates ${scenes.length} shots (${generated.length} generated, ${procedural.length} procedural)`);
