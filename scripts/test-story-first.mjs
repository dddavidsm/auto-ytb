import assert from 'node:assert/strict';
import { buildCausalityChainReport, buildStoryQualityReport, evaluateNegativeStoryFixture, scoreNarrativeRandomness, scoreStoryPitch, trackNarrativeObjects } from '../packages/production/dist/index.js';

const pitch = scoreStoryPitch({ id: 'test', title: 'The Little Light', oneSentence: 'Moss follows a runaway lantern into a tunnel and discovers it is leading a lost firefly home.', hook: 'A lantern rolls into darkness.', goal: 'Moss wants his lantern back.', obstacle: 'Every grab sends it farther into the tunnel.', payoff: 'Moss guides the firefly out and the lantern returns.', ageFit: 'KIDS_4_7', visualPotential: 9, seriesFit: 8, originality: 8, feasibility: 9 });
assert.equal(pitch.status, 'PASS');
const beats = [
  { id: 'b1', purpose: 'HOOK', spokenText: 'My light!', action: 'Moss lunges after the rolling lantern.', consequence: 'The lantern disappears into a tunnel.', mossGoal: 'Get the lantern back.', object: 'lantern', location: 'forest path' },
  { id: 'b2', purpose: 'PROBLEM', spokenText: 'Come back!', action: 'Moss reaches under a root.', consequence: 'The lantern rolls deeper and lights a narrow path.', mossGoal: 'Catch the lantern.', object: 'lantern', location: 'forest path' },
  { id: 'b3', purpose: 'ESCALATION', spokenText: 'Wait... who is there?', action: 'Moss follows the light into the tunnel.', consequence: 'He finds a frightened firefly behind a stone.', mossGoal: 'Find the lantern and understand the noise.', object: 'lantern', location: 'tunnel' },
  { id: 'b4', purpose: 'PAYOFF', spokenText: 'I can help you.', action: 'Moss rolls the lantern toward the firefly and guides it out.', consequence: 'The firefly flies home and the lantern rolls back.', mossGoal: 'Get the firefly safely home.', object: 'lantern', location: 'tunnel' },
  { id: 'b5', purpose: 'BUTTON', spokenText: 'Best lantern trip ever.', action: 'Moss hugs the lantern as the firefly blinks.', consequence: 'The forest path glows warmly.', mossGoal: 'Celebrate the safe return.', object: 'lantern', location: 'forest path' },
];
assert.equal(buildCausalityChainReport(beats).status, 'PASS');
assert.equal(trackNarrativeObjects(beats).lantern.appearances, 5);
assert.equal(scoreNarrativeRandomness(beats).status, 'PASS');
assert.equal(buildStoryQualityReport({ pitch, beats, audioDurationSeconds: 31, animaticDurationSeconds: 31 }).status, 'PASS');
assert.equal(evaluateNegativeStoryFixture().status, 'FAIL');
console.log('✓ story-first scoring, causality, object tracking, randomness and negative fixture');
