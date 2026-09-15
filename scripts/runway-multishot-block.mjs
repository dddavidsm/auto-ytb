import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [firstFramePath, outputPath, shotsJsonPath] = process.argv.slice(2);
if (!firstFramePath || !outputPath || !shotsJsonPath) throw new Error('Usage: node scripts/runway-multishot-block.mjs <first-frame> <output> <shots-json>');
const apiKey = process.env.RUNWAY_API_KEY;
if (!apiKey) throw new Error('RUNWAY_API_KEY is not available in the process environment');
const shots = JSON.parse(await readFile(shotsJsonPath, 'utf8'));
if (!Array.isArray(shots) || shots.length < 3 || shots.length > 5) throw new Error('Multi-shot custom mode requires 3-5 shots');
const total = shots.reduce((sum, shot) => sum + Number(shot.duration ?? 0), 0);
if (total !== 15) throw new Error(`This proof uses exactly 15 seconds; received ${total}`);

const bytes = await readFile(firstFramePath);
const ext = path.extname(firstFramePath).toLowerCase();
const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
const firstFrame = { uri: `data:${mime};base64,${bytes.toString('base64')}` };
const headers = { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', 'x-runway-version': '2024-11-06' };
const body = { version: '2026-06', mode: 'custom', duration: 15, ratio: '1280:720', firstFrame, audio: true, shots };
const base = 'https://api.dev.runwayml.com';
const created = await fetch(`${base}/v1/recipes/multi_shot_video`, { method: 'POST', headers, body: JSON.stringify(body) });
const createdText = await created.text();
let task;
try { task = JSON.parse(createdText); } catch { throw new Error(`Multi-shot create failed ${created.status}: ${createdText.slice(0, 1000)}`); }
if (!created.ok) throw new Error(`Multi-shot create failed ${created.status}: ${JSON.stringify(task).slice(0, 1000)}`);
if (!task.id) throw new Error('Multi-shot task returned no task id');

const startedAt = Date.now();
let latest;
while (Date.now() - startedAt < 12 * 60 * 1000) {
  const response = await fetch(`${base}/v1/tasks/${encodeURIComponent(task.id)}`, { headers });
  const text = await response.text();
  try { latest = JSON.parse(text); } catch { throw new Error(`Multi-shot poll returned invalid JSON ${response.status}`); }
  if (!response.ok) throw new Error(`Multi-shot poll failed ${response.status}: ${JSON.stringify(latest).slice(0, 1000)}`);
  if (latest.status === 'SUCCEEDED') break;
  if (latest.status === 'FAILED' || latest.status === 'CANCELED') throw new Error(`Multi-shot task ${latest.status}: ${latest.failureCode ?? ''} ${latest.failure ?? ''}`.trim());
  await new Promise((resolve) => setTimeout(resolve, 5000));
}
if (!latest || latest.status !== 'SUCCEEDED') throw new Error(`Multi-shot task ${task.id} timed out`);
const outputUrl = latest.output?.[0];
if (!outputUrl) throw new Error('Multi-shot task succeeded without output URL');
const media = await fetch(outputUrl);
if (!media.ok) throw new Error(`Multi-shot output download failed ${media.status}`);
const outputBytes = new Uint8Array(await media.arrayBuffer());
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, outputBytes);
const manifest = { provider: 'runway-dev', recipe: 'multi_shot_video', version: '2026-06', mode: 'custom', taskId: task.id, firstFramePath, outputPath, durationSeconds: 15, ratio: '1280:720', audio: true, shots, outputBytes: outputBytes.byteLength, createdAt: new Date().toISOString(), rawTaskMetadata: { cost: latest.cost ?? null, model: latest.model ?? null } };
await writeFile(`${outputPath}.json`, JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ ...manifest, status: 'SUCCEEDED' }));
