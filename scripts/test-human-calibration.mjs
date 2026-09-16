import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const memory = JSON.parse(await readFile('.data/production-memory/creative-history.json', 'utf8'));
for (const runId of ['gauntlet-a4', 'gauntlet-b3', 'gauntlet-c']) {
  const records = memory.productions.filter((item) => item.runId === runId);
  assert.ok(records.length, `${runId} is missing from creative history`);
  for (const record of records) {
    assert.equal(record.humanScore, 0);
    assert.equal(record.humanStatus, 'REJECTED');
    assert.equal(record.trainingRole, 'NEGATIVE_FIXTURE_ONLY');
    assert.equal(record.humanFeedback.positiveTrainingExample, false);
  }
}
console.log('✓ human 0/10 calibration is persisted as negative-only training evidence');
