import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [firstPath, lastPath, outputPath, ...promptParts] = process.argv.slice(2);
if (!firstPath || !lastPath || !outputPath || !promptParts.length) {
  throw new Error('Usage: node scripts/runway-wan-first-last-probe.mjs <first> <last> <output> <prompt>');
}
const apiKey = process.env.RUNWAY_API_KEY;
if (!apiKey) throw new Error('RUNWAY_API_KEY is not available in the process environment');

const version = process.env.RUNWAY_API_VERSION ?? '2024-11-06';
const base = process.env.RUNWAY_API_ENDPOINT ?? 'https://api.dev.runwayml.com';
const duration = Number(process.env.RUNWAY_PROBE_DURATION ?? 4);
const resolution = process.env.RUNWAY_PROBE_RESOLUTION ?? '480p';
const ratio = resolution === '480p' ? 'auto_480p' : resolution === '720p' ? 'auto_720p' : 'auto_1080p';
const rate = resolution === '480p' ? 5 : resolution === '720p' ? 10 : 20;
const audio = process.env.RUNWAY_PROBE_AUDIO === 'true';

function dataUri(bytes, mime) { return `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`; }
async function imageUri(file) {
  const ext = path.extname(file).toLowerCase();
  const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
  return dataUri(await readFile(file), mime);
}
async function jsonResponse(response, label) {
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 1000) }; }
  if (!response.ok) throw new Error(`${label} failed ${response.status}: ${JSON.stringify(body).slice(0, 1000)}`);
  return body;
}

const headers = { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', 'x-runway-version': version };
const body = {
  model: 'wan3',
  promptText: promptParts.join(' '),
  promptImage: [{ uri: await imageUri(firstPath), position: 'first' }, { uri: await imageUri(lastPath), position: 'last' }],
  ratio,
  duration,
  audio,
};

const create = await fetch(`${base}/v1/image_to_video`, { method: 'POST', headers, body: JSON.stringify(body) });
const task = await jsonResponse(create, 'Runway task creation');
if (!task.id) throw new Error('Runway task creation returned no task id');

const startedAt = Date.now();
let latest;
while (Date.now() - startedAt < 12 * 60 * 1000) {
  const response = await fetch(`${base}/v1/tasks/${encodeURIComponent(task.id)}`, { headers });
  latest = await jsonResponse(response, 'Runway task polling');
  if (latest.status === 'SUCCEEDED') break;
  if (latest.status === 'FAILED' || latest.status === 'CANCELED') throw new Error(`Runway task ${latest.status}: ${latest.failureCode ?? ''} ${latest.failure ?? ''}`.trim());
  await new Promise((resolve) => setTimeout(resolve, 5000));
}
if (!latest || latest.status !== 'SUCCEEDED') throw new Error(`Runway task ${task.id} timed out`);
const outputUrl = latest.output?.[0];
if (!outputUrl) throw new Error('Runway task completed without output URL');
const media = await fetch(outputUrl);
if (!media.ok) throw new Error(`Runway output download failed ${media.status}`);
const bytes = new Uint8Array(await media.arrayBuffer());
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, bytes);
const manifest = {
  provider: 'runway-dev', model: 'wan3', mode: 'WAN3_FIRST_LAST', taskId: task.id,
  firstPath, lastPath, outputPath, durationSeconds: duration, resolution, ratio,
  estimatedCredits: duration * rate, estimatedUsd: Number((duration * rate * 0.01).toFixed(2)),
  audio, createdAt: new Date().toISOString(), outputBytes: bytes.byteLength,
};
await writeFile(`${outputPath}.json`, JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ ...manifest, status: 'SUCCEEDED' }));
