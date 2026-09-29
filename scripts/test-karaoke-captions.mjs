import assert from 'node:assert/strict';
import { alignmentToSubtitleCues, alignmentToWordTimings } from '../packages/runtime-node/index.mjs';

const text = 'This is a real moving story.';
const characters = [...text];
const starts = [];
const ends = [];
let cursor = 0;
for (const char of characters) {
  const duration = /\s/.test(char) ? 0.04 : 0.11;
  starts.push(cursor);
  cursor += duration;
  ends.push(cursor);
}
const alignment = { characters, characterStartTimesSeconds: starts, characterEndTimesSeconds: ends };
const words = alignmentToWordTimings(alignment);
const cues = alignmentToSubtitleCues(alignment, { maxChars: 48, maxDurationSeconds: 4 });
assert.equal(words.map((word) => word.text).join(' '), text);
assert.equal(words.length, 6);
assert.ok(words.every((word) => word.end > word.start));
assert.equal(cues.length, 1);
assert.match(cues[0].text, /moving story/);
console.log(JSON.stringify({ ok: true, words: words.length, cues: cues.length }));
