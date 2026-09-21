import assert from 'node:assert/strict';
import { selectPackagingWithExploration } from '@auto-ytb/production';

const variants = [
  { id:'p1', title:'One', thumbnailConcept:'one', promise:'one', curiosity:90, clarity:90, credibility:90, differentiation:90, score:90 },
  { id:'p2', title:'Two', thumbnailConcept:'two', promise:'two', curiosity:89, clarity:89, credibility:89, differentiation:89, score:89 },
  // Deliberately make the unmaterialized third arm extremely attractive to
  // learning/bandit logic. It must still never be selected by the default
  // canonical two-thumbnail production pool.
  { id:'p3', title:'Three', thumbnailConcept:'three', promise:'three', curiosity:100, clarity:100, credibility:100, differentiation:100, score:100 },
];

const profile = {
  sampleSize: 100,
  attributes: [
    { attribute:'curiosity', sampleSize:100, slope:0.8, confidence:1 },
    { attribute:'clarity', sampleSize:100, slope:0.8, confidence:1 },
    { attribute:'credibility', sampleSize:100, slope:0.8, confidence:1 },
    { attribute:'differentiation', sampleSize:100, slope:0.8, confidence:1 },
  ],
};

for (let index = 0; index < 1000; index += 1) {
  const result = selectPackagingWithExploration({ variants, profile, experimentSeed:`seed-${index}` });
  assert.ok(['p1','p2'].includes(result.selected.id), `default selection escaped materialized pool with ${result.selected.id}`);
  assert.equal(result.scores.length, 3, 'all generated variants remain scored for diagnostics/learning');
}
console.log('✓ default packaging selection never escapes the two materialized thumbnail arms');

let thirdSelected = false;
for (let index = 0; index < 1000; index += 1) {
  const result = selectPackagingWithExploration({ variants, profile, experimentSeed:`full-pool-${index}`, selectionPoolSize:3 });
  if (result.selected.id === 'p3') { thirdSelected = true; break; }
}
assert.equal(thirdSelected, true, 'callers that materialize all variants can explicitly make all variants selectable');
console.log('✓ callers can opt into larger fully-materialized packaging pools');

const single = selectPackagingWithExploration({ variants:[variants[0]], experimentSeed:'single' });
assert.equal(single.selected.id, 'p1');
assert.equal(single.mode, 'EXPLOIT');
console.log('✓ single-arm packaging remains deterministic');

console.log('Packaging selection stability regression suite passed.');
