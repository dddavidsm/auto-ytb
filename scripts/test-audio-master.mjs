import assert from 'node:assert/strict';
import { alignmentToSubtitleCues, subtitlesToSrt } from '../packages/runtime-node/index.mjs';

const text='The browser changed faster than anyone expected. Then the real problem appeared.';
const characters=[...text];
const duration=6.8;
const step=duration/characters.length;
const alignment={characters,characterStartTimesSeconds:characters.map((_,i)=>i*step),characterEndTimesSeconds:characters.map((_,i)=>(i+1)*step)};
const cues=alignmentToSubtitleCues(alignment,{maxChars:30,maxDurationSeconds:2.2});
assert.ok(cues.length>=3,'long narration should be divided into readable cues');
assert.equal(cues.map((cue)=>cue.text).join(' '),text,'subtitle segmentation must preserve narration text');
for(const cue of cues){
  assert.ok(cue.end>cue.start,'every cue must have a positive duration');
  assert.ok(cue.text.length<=45,'cues should remain readable');
}
const srt=subtitlesToSrt(cues);
assert.match(srt,/1\n00:00:00,000 -->/);
assert.ok(srt.includes('The browser'));
assert.ok(srt.includes('real problem'));
assert.deepEqual(alignmentToSubtitleCues(null),[]);
assert.deepEqual(alignmentToSubtitleCues({characters:['x'],characterStartTimesSeconds:[],characterEndTimesSeconds:[]}),[]);
console.log('✓ character-level TTS alignment becomes readable subtitle cues');
console.log('✓ SRT timestamps preserve synchronized narration order');
