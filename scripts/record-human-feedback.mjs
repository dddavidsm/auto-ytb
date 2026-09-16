import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const memoryPath = resolve('.data/production-memory/creative-history.json');
const runIds = process.argv.slice(2);
if (!runIds.length) throw new Error('Usage: node scripts/record-human-feedback.mjs <run-id>...');
const memory = JSON.parse(await readFile(memoryPath, 'utf8').catch(() => '{"version":1,"productions":[],"learning":[]}'));
const tags = ['HUMAN_REJECTED_0_10', 'SLIDESHOW', 'IMAGE_HEAVY', 'FAKE_MOTION', 'KEN_BURNS_OVERUSE', 'VIBRATION_EFFECT', 'LOW_FOOTAGE_DENSITY', 'BORING_TOPIC', 'WEAK_HOOK', 'WEAK_SCRIPT', 'NO_STORY_PROGRESSION', 'GENERIC_VISUALS', 'LOW_VISUAL_INFORMATION', 'NO_EDITORIAL_PERSONALITY', 'WEAK_CAPTIONS', 'NON_KARAOKE_CAPTIONS', 'WEAK_AUDIO_VISUAL_SYNC', 'LOW_SOURCE_AUDIO_USE', 'NO_VISUAL_SURPRISE', 'LOW_REWATCH_VALUE', 'NOT_VIDRUSH_GRADE'];
for (const runId of runIds) {
  const productions = memory.productions.filter((item) => item.runId === runId);
  if (!productions.length) throw new Error(`Unknown production run: ${runId}`);
  for (const production of productions) {
    production.humanScore = 0;
    production.humanStatus = 'REJECTED';
    production.humanFeedback = { score: 0, tags, recordedAt: new Date().toISOString(), positiveTrainingExample: false };
    production.trainingRole = 'NEGATIVE_FIXTURE_ONLY';
  }
  memory.learning.push({ runId, type: 'HUMAN_CALIBRATION', score: 0, status: 'REJECTED', tags, confidence: 'HUMAN_GROUND_TRUTH', recordedAt: new Date().toISOString(), trainingRole: 'NEGATIVE_FIXTURE_ONLY' });
}
await mkdir(dirname(memoryPath), { recursive: true });
await writeFile(memoryPath, `${JSON.stringify(memory, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ recorded: runIds, score: 0, trainingRole: 'NEGATIVE_FIXTURE_ONLY' }));
