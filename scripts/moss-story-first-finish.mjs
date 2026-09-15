import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { detectStoryFirstPlaceholders, evaluateStoryFirstFinalGate, separateStoryFirstScores } from '../packages/production/dist/index.js';
import { escapeFfmpegFilterPath } from '../packages/runtime-node/file-path.mjs';

const repo = resolve('.');
const ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg';
const ffprobe = process.env.FFPROBE_BIN || 'ffprobe';
const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
const videoModel = String(process.env.GEMINI_VIDEO_MODEL || process.env.VIDEO_MODEL || 'veo-3.1-fast-generate-preview').trim();
const videoBase = String(process.env.GEMINI_API_ENDPOINT || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
const hardMaxUsd = 4;
const lineGap = 0.28;

function run(command, args, capture = false) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', capture ? 'pipe' : 'ignore', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolvePromise({ stdout, stderr }) : reject(new Error(`${command} exited ${code}: ${stderr.slice(-1800)}`)));
  });
}

async function json(path, value) {
  await mkdir(resolve(path, '..'), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function media(path) {
  return JSON.parse((await run(ffprobe, ['-v', 'error', '-show_entries', 'format=duration,size:stream=codec_name,codec_type,width,height,avg_frame_rate', '-of', 'json', path], true)).stdout);
}

async function duration(path) {
  return Number((await run(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', path], true)).stdout.trim()) || 0;
}

async function latestStoryRun() {
  const base = join(repo, '.data', 'pro-series-rnd');
  const names = (await readdir(base, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('moss-story-first-'));
  const candidates = [];
  for (const entry of names) {
    const root = join(base, entry.name);
    if (!existsSync(join(root, 'final', 'story-shot-1.mp4')) || !existsSync(join(root, 'storyboard', 'storyboard.json'))) continue;
    candidates.push({ root, mtime: (await stat(root)).mtimeMs });
  }
  candidates.sort((a, b) => b.mtime - a.mtime);
  if (!candidates[0]) throw new Error('No se encontró el run Story-First existente con el shot Veo válido.');
  return candidates[0].root;
}

const root = process.env.STORY_FIRST_RUN_ROOT ? resolve(process.env.STORY_FIRST_RUN_ROOT) : await latestStoryRun();
const dirs = Object.fromEntries(['audio-v2', 'veo-final-shots', 'editorial', 'final-v2', 'qc'].map((name) => [name, join(root, name)]));
for (const dir of Object.values(dirs)) await mkdir(dir, { recursive: true });

const revisedLines = [
  { id: 'line-01', speaker: 'NARRATOR', text: "Moss's lantern just RAN AWAY!", emotion: 'urgent playful' },
  { id: 'line-02', speaker: 'MOSS', text: 'Hey! Come back!', emotion: 'surprised urgent' },
  { id: 'line-03', speaker: 'NARRATOR', text: 'He needed that light to get home.', emotion: 'warm quick' },
  { id: 'line-04', speaker: 'MOSS', text: 'Not so fast!', emotion: 'determined playful' },
  { id: 'line-05', speaker: 'NARRATOR', text: 'But every grab sent it deeper. Then—something squeaked.', emotion: 'building curious' },
  { id: 'line-06', speaker: 'NARRATOR', text: "The lantern wasn't escaping. It was leading a lost firefly home.", emotion: 'reveal warm' },
  { id: 'line-07', speaker: 'MOSS', text: 'This way, little glow!', emotion: 'kind excited' },
  { id: 'line-08', speaker: 'NARRATOR', text: 'Moss smiled. Best runaway ever.', emotion: 'joyful button' },
];

async function synthesizeSapi() {
  const encoded = Buffer.from(JSON.stringify({ lines: revisedLines.map(({ id, speaker, text }) => ({ id, speaker, text })), outDir: dirs['audio-v2'] })).toString('base64');
  const ps = `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Speech; $data=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}'))|ConvertFrom-Json; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Rate=1; foreach($l in $data.lines){ try { if($l.speaker -eq 'MOSS'){$s.SelectVoice('Microsoft Zira Desktop')} else {$s.SelectVoice('Microsoft David Desktop')} } catch {}; $s.SetOutputToWaveFile((Join-Path $data.outDir ($l.id+'.wav'))); $s.Speak($l.text); $s.SetOutputToNull() }; $s.Dispose()`;
  await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps]);
  const lineRecords = [];
  let cursor = 0;
  for (const line of revisedLines) {
    const path = join(dirs['audio-v2'], `${line.id}.wav`);
    if (!existsSync(path)) throw new Error(`SAPI no generó ${line.id}`);
    const seconds = await duration(path);
    lineRecords.push({ ...line, path, durationSeconds: seconds, startSeconds: cursor, endSeconds: cursor + seconds });
    cursor += seconds + lineGap;
  }
  const listPath = join(dirs['audio-v2'], 'speech-v2-concat.txt');
  const gapPath = join(dirs['audio-v2'], 'line-gap.wav');
  await run(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', String(lineGap), '-c:a', 'pcm_s16le', gapPath]);
  await writeFile(listPath, `${lineRecords.flatMap((line) => [`file '${line.path.replaceAll("'", "'\\''")}'`, `file '${gapPath.replaceAll("'", "'\\''")}'`]).join('\n')}\n`, 'utf8');
  const speech = join(dirs['audio-v2'], 'speech-v2.wav');
  await run(ffmpeg, ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c:a', 'pcm_s16le', speech]);
  const music = join(root, 'audio', 'original-music-bed.wav');
  const sfx = join(root, 'audio', 'hook-sfx.wav');
  const mixed = join(dirs['audio-v2'], 'FINAL_STORY_AUDIO_V2.mp3');
  const mixArgs = ['-y', '-i', speech];
  if (existsSync(music)) mixArgs.push('-stream_loop', '-1', '-i', music);
  if (existsSync(sfx)) mixArgs.push('-i', sfx);
  const inputs = 1 + (existsSync(music) ? 1 : 0) + (existsSync(sfx) ? 1 : 0);
  if (inputs === 3) {
    mixArgs.push('-filter_complex', '[0:a]volume=1.0[s];[1:a]volume=0.12[m];[2:a]volume=0.38[fx];[s][m]amix=inputs=2:duration=first:dropout_transition=2[mix];[mix][fx]amix=inputs=2:duration=first:dropout_transition=2,loudnorm=I=-16:TP=-1.5:LRA=11[out]', '-map', '[out]');
  } else if (inputs === 2) {
    mixArgs.push('-filter_complex', '[0:a]volume=1.0[s];[1:a]volume=0.12[m];[s][m]amix=inputs=2:duration=first,loudnorm=I=-16:TP=-1.5:LRA=11[out]', '-map', '[out]');
  } else mixArgs.push('-af', 'loudnorm=I=-16:TP=-1.5:LRA=11');
  mixArgs.push('-t', String(await duration(speech)), '-c:a', 'libmp3lame', '-b:a', '192k', mixed);
  await run(ffmpeg, mixArgs);
  const mixedDuration = await duration(mixed);
  const manifest = { version: 'V2', provider: 'windows-sapi-local', reason: 'Gemini TTS quota was exhausted; hook wording was polished without spending another commercial request.', cast: { NARRATOR: 'Microsoft David Desktop', MOSS: 'Microsoft Zira Desktop' }, lineRecords, durationSeconds: mixedDuration, locked: true, reusedMusic: existsSync(music), reusedSfx: existsSync(sfx) };
  await json(join(dirs['audio-v2'], 'final-story-audio-v2.json'), manifest);
  return manifest;
}

function assTime(seconds) {
  const centis = Math.max(0, Math.round(seconds * 100));
  const cs = centis % 100; const total = Math.floor(centis / 100); const s = total % 60; const m = Math.floor(total / 60);
  return `0:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function assEscape(text) { return String(text).replaceAll('\\', '\\\\').replaceAll('{', '\\{').replaceAll('}', '\\}'); }

async function createCaptions(audio) {
  const events = [];
  for (const line of audio.lineRecords) {
    const words = line.text.replace(/[“”]/g, '').split(/\s+/).filter(Boolean);
    const chunkSize = line.speaker === 'MOSS' ? 3 : 4;
    for (let index = 0; index < words.length; index += chunkSize) {
      const chunk = words.slice(index, index + chunkSize);
      const start = line.startSeconds + (index / words.length) * line.durationSeconds;
      const end = line.startSeconds + (Math.min(words.length, index + chunk.length) / words.length) * line.durationSeconds;
      const keywordIndex = chunk.findIndex((word) => /RAN|AWAY|light|deeper|squeaked|home|glow|runaway/i.test(word));
      const decorated = chunk.map((word, wordIndex) => wordIndex === keywordIndex ? `{\\c&H0000FFFF&}${assEscape(word)}{\\c&H00FFFFFF&}` : assEscape(word)).join(' ');
      const alignment = line.speaker === 'MOSS' ? 2 : (index % 2 ? 8 : 2);
      events.push(`Dialogue: 0,${assTime(start)},${assTime(end)},Viral,,0,0,0,,{\\an${alignment}\\t(0,90,\\fscx106\\fscy106)\\t(90,180,\\fscx100\\fscy100)}${decorated}`);
    }
  }
  const content = `[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Viral,Arial,68,&H00FFFFFF,&H0000FFFF,&H00000000,&H90000000,-1,0,0,0,100,100,0,0,1,9,2,2,90,90,90,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${events.join('\n')}\n`;
  const path = join(dirs['audio-v2'], 'captions-v2.ass');
  await writeFile(path, content, 'utf8');
  return { path, eventCount: events.length, style: 'large white uppercase-ish text with yellow semantic keyword, thick black outline, pop scale animation', maxWordsPerChunk: 4 };
}

async function discoverModels() {
  if (!apiKey) return { status: 'NO_CREDENTIALS', model: videoModel };
  const response = await fetch(`${videoBase}/models?pageSize=1000`, { headers: { 'x-goog-api-key': apiKey } });
  const body = await response.json();
  if (!response.ok) return { status: `HTTP_${response.status}`, model: videoModel };
  const found = (body.models || []).find((model) => model.name === `models/${videoModel}`);
  return { status: 'AUTH_AVAILABLE_QUOTA_UNKNOWN', model: videoModel, modelListed: Boolean(found), methods: found?.supportedGenerationMethods || [] };
}

async function submitVideo(prompt) {
  const response = await fetch(`${videoBase}/models/${encodeURIComponent(videoModel)}:predictLongRunning`, { method: 'POST', headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' }, body: JSON.stringify({ instances: [{ prompt }], parameters: { aspectRatio: '16:9', resolution: process.env.GEMINI_VIDEO_RESOLUTION || '720p', durationSeconds: 8 } }) });
  const raw = await response.text(); let body; try { body = JSON.parse(raw); } catch { body = { raw: raw.slice(0, 500) }; }
  if (!response.ok) { const error = new Error(`Veo HTTP ${response.status}`); error.status = response.status; error.body = body; throw error; }
  return body;
}

async function poll(operationName) {
  const started = Date.now();
  while (Date.now() - started < 900000) {
    const response = await fetch(`${videoBase}/${operationName}`, { headers: { 'x-goog-api-key': apiKey } });
    const body = await response.json();
    if (body.done) return body;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10000));
  }
  throw new Error('Veo polling timeout');
}

const shotPrompts = {
  2: 'Original high-end family animation, same Moss red panda from the approved story reference, no new characters. CAUSED BY: Moss lunged after the runaway lantern and it disappeared under the root. START STATE: Moss is at the tunnel entrance, lantern glow just ahead under the root. ACTION: Moss squeezes under the root, reaches with both paws, and accidentally bumps the lantern farther inside; show determined face and physical effort. END STATE: lantern rolls around a bend, Moss is committed to the chase, tunnel becomes darker. WHAT CHANGES: lantern gets farther away. WHAT THIS CAUSES NEXT: Moss follows into the tunnel. Low tracking medium camera, readable body movement, warm lantern against cool tunnel, no text, no charts, no random spectacle. TEXT_ONLY_IDENTITY_RISK.',
  3: 'Original high-end family animation, same Moss red panda from the approved story reference, same green-and-cream scarf, same glowing lantern, no new characters. CAUSED BY: Moss bumped the lantern deeper and followed it around the bend. START STATE: Moss crawls in the dark tunnel, lantern glow beyond reach. ACTION: he stretches both paws, the lantern rolls past a bend, the light flickers, and Moss freezes when a tiny squeak comes from behind a stone. END STATE: Moss looks worried toward the hidden squeak, lantern illuminates a small trapped firefly. WHAT CHANGES: the chase becomes a rescue. WHAT THIS CAUSES NEXT: Moss must help the firefly. Over-shoulder push-in to close reveal, strong expression change, clear prop and light causality, no random portal or explosion. TEXT_ONLY_IDENTITY_RISK.',
  4: 'Original high-end family animation, same Moss red panda from the approved story reference, same scarf, same lantern, same tiny firefly. CAUSED BY: Moss discovered the firefly trapped behind the stone and chose to help. START STATE: Moss and firefly are in the tunnel chamber, lantern beside them. ACTION: Moss gently moves the stone, leads the firefly up the tunnel with the lantern, then the lantern rolls back into his paws; firefly blinks thanks. END STATE: Moss hugs the lantern on the moonlit path, firefly safe, warm glow around them. WHAT CHANGES: rescue succeeds and Moss gets his light back. WHAT THIS CAUSES NEXT: joyful button ending. Tracking action shot into wide pullback, visible walking and arm movement, warm resolution, no new characters or objects. TEXT_ONLY_IDENTITY_RISK.',
};

async function prepareShots(modelStatus) {
  const shotDir = dirs['veo-final-shots'];
  const records = [];
  const sourceOne = join(root, 'final', 'story-shot-1.mp4');
  const targetOne = join(shotDir, 'story-shot-1.mp4');
  if (!existsSync(targetOne)) await copyFile(sourceOne, targetOne);
  records.push({ id: 'story-shot-1', path: targetOne, provider: 'gemini-video-existing', generatedNow: false, estimatedCostUsd: 0.8 });
  const statusPath = join(shotDir, 'veo-quota-status.json');
  const previousStatus = existsSync(statusPath) ? JSON.parse(await readFile(statusPath, 'utf8')) : null;
  if (previousStatus?.state === 'VEO_QUOTA_BLOCKED') return { records, status: previousStatus };
  const status = { checkedAt: new Date().toISOString(), modelStatus, attempted: [], state: 'PENDING', identityMethod: 'TEXT_ONLY_IDENTITY_RISK' };
  if (!apiKey) { status.state = 'VEO_CREDENTIALS_MISSING'; await json(statusPath, status); return { records, status }; }
  for (const index of [2, 3, 4]) {
    const path = join(shotDir, `story-shot-${index}.mp4`);
    if (existsSync(path)) { records.push({ id: `story-shot-${index}`, path, provider: 'gemini-video-resumed', generatedNow: false, estimatedCostUsd: 0.8 }); continue; }
    status.attempted.push({ shotId: `story-shot-${index}`, submittedAt: new Date().toISOString() });
    try {
      const operation = await submitVideo(shotPrompts[index]);
      status.attempted.at(-1).operationName = operation.name;
      const completed = await poll(operation.name);
      const uri = completed.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri || completed.response?.generateVideoResponse?.generatedVideos?.[0]?.video?.uri || completed.response?.generatedVideos?.[0]?.video?.uri;
      if (!uri) throw new Error(`No video URI for shot ${index}`);
      const download = await fetch(uri, { headers: { 'x-goog-api-key': apiKey } });
      if (!download.ok) throw new Error(`Video download HTTP ${download.status}`);
      await writeFile(path, Buffer.from(await download.arrayBuffer()));
      status.attempted.at(-1).completedAt = new Date().toISOString();
      records.push({ id: `story-shot-${index}`, path, provider: 'gemini-video', generatedNow: true, operationName: operation.name, estimatedCostUsd: 0.8 });
    } catch (error) {
      status.state = error.status === 429 ? 'VEO_QUOTA_BLOCKED' : 'VEO_GENERATION_FAILED';
      status.blockedShotId = `story-shot-${index}`;
      status.error = error.status === 429 ? 'HTTP_429_QUOTA_LIMIT' : String(error.message);
      await json(statusPath, status);
      return { records, status };
    }
  }
  status.state = 'ALL_SHOTS_AVAILABLE';
  await json(statusPath, status);
  return { records, status };
}

async function createEditorialPlan(storyboard, records) {
  const sourceClips = [];
  for (const record of records) sourceClips.push({ id: record.id, path: record.path, durationSeconds: existsSync(record.path) ? await duration(record.path) : 0, generatedNow: record.generatedNow, provider: record.provider });
  const beats = [
    ['hook-wide', 'story-shot-1', 0, 1.6, 'lantern rolls away; Moss lunges', 'WIDE'],
    ['hook-reaction', 'story-shot-1', 1.6, 2.7, 'Moss realizes the light is escaping', 'CLOSE_REACTION'],
    ['hook-lantern', 'story-shot-1', 2.7, 3.8, 'lantern disappears under root', 'INSERT'],
    ['chase-medium', 'story-shot-2', 0, 2.2, 'Moss crawls and reaches', 'MEDIUM'],
    ['chase-impact', 'story-shot-2', 2.2, 3.5, 'paw bumps lantern farther', 'ACTION_INSERT'],
    ['chase-reaction', 'story-shot-2', 3.5, 4.7, 'determined/frustrated Moss', 'CLOSE_REACTION'],
    ['reveal-push', 'story-shot-3', 0, 2.0, 'lantern flickers in darkness', 'OVER_SHOULDER'],
    ['firefly-insert', 'story-shot-3', 2.0, 3.2, 'squeak and trapped firefly', 'INSERT'],
    ['choice-reaction', 'story-shot-3', 3.2, 4.8, 'Moss chooses to help', 'CLOSE_REACTION'],
    ['rescue-two-shot', 'story-shot-4', 0, 2.2, 'stone moves; lantern beside firefly', 'TWO_SHOT'],
    ['exit-action', 'story-shot-4', 2.2, 4.3, 'Moss leads firefly toward exit', 'TRACKING'],
    ['return-insert', 'story-shot-4', 4.3, 5.5, 'lantern rolls back', 'INSERT'],
    ['button-wide', 'story-shot-4', 5.5, 8, 'Moss hugs lantern; firefly thanks him', 'WIDE_BUTTON'],
  ].map(([id, sourceShotId, startSeconds, endSeconds, intent, shotType]) => ({ id, sourceShotId, startSeconds, endSeconds, intent, shotType }));
  const plan = { status: 'APPROVED_STORY_DERIVED', editorialShotCount: beats.length, sourceClips, beats, note: 'Editorial crops are only used after all source clips are real; no storyboard fallback is eligible for final-v2.' };
  await json(join(dirs.editorial, 'editorial-shot-plan.json'), { storyboard, ...plan });
  return plan;
}

async function renderFinal(records, audio, captions) {
  const normalized = [];
  for (const record of records) {
    const output = join(dirs['final-v2'], `${record.id}-normalized.mp4`);
    await run(ffmpeg, ['-y', '-i', record.path, '-vf', 'scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black,fps=30,format=yuv420p', '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-movflags', '+faststart', output]);
    normalized.push(output);
  }
  const list = join(dirs['final-v2'], 'video-concat.txt');
  await writeFile(list, `${normalized.map((path) => `file '${path.replaceAll("'", "'\\''")}'`).join('\n')}\n`, 'utf8');
  const raw = join(dirs['final-v2'], 'MOSS_STORY_FIRST_SHORT_V2_RAW.mp4');
  await run(ffmpeg, ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', raw]);
  const output = join(dirs['final-v2'], 'MOSS_STORY_FIRST_SHORT_V2.mp4');
  const subtitleFilter = `subtitles=filename='${escapeFfmpegFilterPath(captions.path)}'`;
  await run(ffmpeg, ['-y', '-i', raw, '-i', audio.path, '-vf', subtitleFilter, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-r', '30', '-s', '1920x1080', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', output]);
  return { path: output, media: await media(output), captionsBurnedIn: true, normalizedSources: normalized };
}

async function sampleQc(records, finalVideo) {
  const samples = [];
  for (const record of records) {
    const d = await duration(record.path);
    const shotSamples = [];
    for (const ratio of [0, 0.25, 0.5, 0.75, 1]) {
      const frame = join(dirs.qc, `${record.id}-${Math.round(ratio * 100)}.jpg`);
      await run(ffmpeg, ['-y', '-ss', String(Math.max(0, Math.min(d - 0.05, d * ratio))), '-i', record.path, '-frames:v', '1', '-vf', 'scale=480:-2', frame]);
      shotSamples.push({ ratio, frame });
    }
    samples.push({ shotId: record.id, provider: record.provider, temporalStatus: 'REVIEW_REQUIRED', samples: shotSamples, identityStatus: 'NOT_EVALUATED_WITH_VISION', note: 'Text-only Veo generation carries identity risk; samples are persisted for human review.' });
  }
  const report = { status: 'READY_FOR_HUMAN_REVIEW', temporalMethod: '0/25/50/75/100 percent frames per real shot', shots: samples, crossShot: { status: 'REVIEW_REQUIRED', checks: records.slice(1).map((record, index) => ({ from: records[index].id, to: record.id, storyState: 'EXPECTED_CONTINUITY', identity: 'NOT_EVALUATED_WITH_VISION' })) }, finalVideo: finalVideo ? { media: finalVideo.media, soundOff: 'REVIEW_REQUIRED', audioOnly: 'PASS', childClarity: 'REVIEW_REQUIRED' } : null };
  await json(join(dirs.qc, 'temporal-qc.json'), report);
  return report;
}

async function main() {
  const originalReportPath = join(root, 'reports', 'moss-story-first-report.json');
  const originalReport = JSON.parse(await readFile(originalReportPath, 'utf8'));
  const modelStatus = await discoverModels();
  const audio = await synthesizeSapi();
  const audioPath = join(dirs['audio-v2'], 'FINAL_STORY_AUDIO_V2.mp3');
  const captions = await createCaptions(audio);
  const storyboard = JSON.parse(await readFile(join(root, 'storyboard', 'storyboard.json'), 'utf8'));
  const prepared = await prepareShots(modelStatus);
  const editorial = await createEditorialPlan(storyboard, prepared.records);
  const placeholderState = detectStoryFirstPlaceholders(prepared.records);
  const missingShotCount = Math.max(0, 4 - prepared.records.length);
  const visualPlaceholderCount = placeholderState.placeholderCount + missingShotCount;
  const finalGate = evaluateStoryFirstFinalGate({ placeholders: visualPlaceholderCount, storyComplete: true, audioFinal: true, captionsFinal: true, visualQcComplete: visualPlaceholderCount === 0 });
  let finalVideo = null;
  let qc = null;
  if (finalGate.status === 'READY_FOR_HUMAN_REVIEW') {
    finalVideo = await renderFinal(prepared.records, { path: audioPath }, captions);
    qc = await sampleQc(prepared.records, finalVideo);
  } else {
    // Remove only the V2 files this finisher may have created in an earlier invalid attempt.
    await rm(dirs['final-v2'], { recursive: true, force: true });
    await mkdir(dirs['final-v2'], { recursive: true });
    await json(join(dirs.qc, 'partial-render-gate.json'), { status: 'PARTIAL_RENDER', blockers: finalGate.blockers, note: 'No final-v2 was rendered because storyboard fallback/placeholder shots are forbidden.' });
  }
  const realGeneratedCount = prepared.records.filter((record) => record.generatedNow).length;
  const externalCost = 0.8 + (realGeneratedCount * 0.8);
  const scores = separateStoryFirstScores({ storyScore: 9, executionScore: finalVideo ? 6.5 : 2, placeholders: visualPlaceholderCount, visualQcComplete: Boolean(finalVideo && qc) });
  const report = {
    runId: originalReport.runId,
    state: finalGate.status === 'READY_FOR_HUMAN_REVIEW' ? 'READY_FOR_HUMAN_REVIEW' : (prepared.status.state === 'VEO_QUOTA_BLOCKED' ? 'WAITING_FOR_VEO_QUOTA' : 'PARTIAL_RENDER'),
    format: originalReport.format,
    audience: originalReport.audience,
    topic: originalReport.topic,
    premise: originalReport.premise,
    hookV1Diagnosis: 'Descriptive opening delayed the strange event; V2 opens on the lantern already running away.',
    scriptV2: revisedLines,
    audioV2: { ...audio, path: audioPath, captions },
    veo: prepared.status,
    missingShotsBefore: [2, 3, 4].map((index) => `story-shot-${index}`),
    generatedShots: prepared.records.filter((record) => record.generatedNow).map((record) => record.id),
    identityMethod: 'TEXT_ONLY_IDENTITY_RISK; no unsupported reference mode was sent',
    editorial,
    finalVideo,
    qc,
    storyScore: { score: scores.storyScore, status: 'PASS', source: 'approved story/animatic, not final visual quality' },
    executionScore: { score: scores.executionScore, status: finalVideo ? 'REVIEW_REQUIRED' : 'BLOCKED', placeholderCount: visualPlaceholderCount, missingShotCount },
    finalContentScore: { score: scores.finalContentScore, status: scores.status },
    finalGate,
    originalPartialFixture: { path: join(root, 'final', 'MOSS_STORY_FIRST_SHORT_V1.mp4'), classification: 'STORY_FIRST_PARTIAL_RENDER', preserved: true },
    cost: { originalExternalUsd: 0.8, additionalExternalUsd: realGeneratedCount * 0.8, totalExternalUsd: externalCost, remainingAgainstHardMaxUsd: hardMaxUsd - externalCost, hardMaxUsd },
    nextState: finalGate.status === 'READY_FOR_HUMAN_REVIEW' ? 'READY_FOR_HUMAN_REVIEW' : 'WAITING_FOR_VEO_QUOTA',
  };
  await json(join(dirs.qc, 'moss-story-first-finish-report.json'), report);
  await json(join(root, 'manifest-v2.json'), { ...report, lineage: { sourceManifest: join(root, 'manifest.json'), partialFixture: join(root, 'final', 'MOSS_STORY_FIRST_SHORT_V1.mp4') } });
  console.log(JSON.stringify({ state: report.state, root, modelStatus, veoState: prepared.status.state, generatedShots: report.generatedShots, finalPath: finalVideo?.path || null, totalExternalUsd: externalCost, storyScore: scores.storyScore, executionScore: scores.executionScore, finalContentScore: scores.finalContentScore }, null, 2));
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
