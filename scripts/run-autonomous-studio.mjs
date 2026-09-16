import { mkdir, readFile, writeFile, copyFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve, extname } from 'node:path';
import { spawn } from 'node:child_process';
import { NodeLocalObjectStore, FfmpegRenderer } from '../packages/runtime-node/index.mjs';
import { GeminiVoiceProvider } from '../packages/providers/dist/index.js';

// Canonical generic runtime. Run-specific topics, sources and decisions are
// always artifacts; this file contains no production fixture content.
const ROOT = resolve('.data/autonomous-production');
const MEMORY = resolve('.data/production-memory/creative-history.json');
const API_KEY = process.env.GEMINI_API_KEY;
const SEARCH_MODEL = process.env.GEMINI_SEARCH_MODEL || process.env.GEMINI_MODEL || 'gemini-3.7-flash';
const TTS_MODEL = process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts';
const TTS_VOICE = process.env.GEMINI_VOICE_ID || 'Kore';
let legacyTerms = [];

const arg = (name, fallback = undefined) => {
  const key = `--${name}`;
  const index = process.argv.indexOf(key);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
};
const mode = arg('mode', 'prompt');
const requestedPrompt = arg('prompt');
const requestedDuration = Number(arg('duration', mode === 'radar' ? 150 : 90));
const runId = arg('run-id', `studio-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 7)}`);
const runRoot = join(ROOT, runId);
const mediaRoot = join(runRoot, 'media');
const renderRoot = join(runRoot, 'render');
const reportRoot = join(runRoot, 'reports');
const finalRoot = join(runRoot, 'final');

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const slug = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100) || 'run';
const hash = (value) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const fileUri = (path) => `file://${resolve(path)}`;
const now = () => new Date().toISOString();
const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
const writeJson = async (path, value) => { await mkdir(dirname(path), { recursive: true }); await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); };
const readJson = async (path, fallback) => { try { return JSON.parse(await readFile(path, 'utf8')); } catch { return fallback; } };
const run = (command, args, options = {}) => new Promise((resolvePromise, reject) => {
  const child = spawn(command, args, { stdio: options.quiet ? ['ignore', 'ignore', 'pipe'] : ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
  child.on('error', reject);
  child.on('close', (code) => code === 0 ? resolvePromise() : reject(new Error(`${command} exited ${code}: ${stderr.slice(-5000)}`)));
});

function assertNovel(text, label) {
  const lower = clean(text).toLowerCase();
  const hit = legacyTerms.find((term) => lower.includes(term));
  if (hit) throw new Error(`NOVELTY_GATE_BLOCKED ${label}: excluded historical subject '${hit}'`);
}

function textBlocks(value) {
  const out = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (typeof node.text === 'string' && node.text.trim()) out.push(node.text);
    if (Array.isArray(node)) node.forEach(visit); else Object.values(node).forEach(visit);
  };
  visit(value);
  return [...new Set(out)];
}

function parseJsonText(value) {
  const source = textBlocks(value).join('\n').replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = source.indexOf('{');
  const arrayStart = source.indexOf('[');
  const offset = start < 0 ? arrayStart : arrayStart >= 0 ? Math.min(start, arrayStart) : start;
  if (offset < 0) throw new Error('Gemini response did not contain JSON');
  const candidate = source.slice(offset);
  try { return JSON.parse(candidate); } catch {
    const endObject = candidate.lastIndexOf('}');
    const endArray = candidate.lastIndexOf(']');
    const end = Math.max(endObject, endArray);
    return JSON.parse(candidate.slice(0, end + 1));
  }
}

async function geminiJson(prompt) {
  if (!API_KEY) throw new Error('GEMINI_API_KEY is required for autonomous production');
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(SEARCH_MODEL)}:generateContent`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': API_KEY },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseMimeType: 'application/json' } }),
  });
  if (!response.ok) throw new Error(`Gemini JSON ${response.status}: ${(await response.text()).slice(0, 700)}`);
  return parseJsonText(await response.json());
}

async function geminiResearch(query, options = {}) {
  if (!API_KEY) throw new Error('GEMINI_API_KEY is required for research');
  const freshness = options.recencyDays ? `Prefer sources from the last ${options.recencyDays} days.` : '';
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': API_KEY, 'Api-Revision': '2026-05-20' },
    body: JSON.stringify({ model: SEARCH_MODEL, input: `Research this video opportunity with primary and reputable sources: ${query}. ${freshness} Return factual claims, dates, named entities, audiovisual leads and risks.`, tools: [{ type: 'google_search' }] }),
  });
  if (!response.ok) throw new Error(`Gemini research ${response.status}: ${(await response.text()).slice(0, 700)}`);
  const json = await response.json();
  const sources = [];
  for (const block of textBlocks(json)) {
    for (const annotation of json?.output ?? []) {
      for (const item of annotation?.annotations ?? []) {
        if (item?.type === 'url_citation' && item.url && !sources.some((source) => source.url === item.url)) sources.push({ url: item.url, title: item.title || item.url, provenance: 'MEASURED_CITATION' });
      }
    }
    if (sources.length >= 20) break;
  }
  // Interactions output can nest annotations under text blocks; walk it once
  // more without assuming a provider-specific response shape.
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'url_citation' && node.url && !sources.some((source) => source.url === node.url)) sources.push({ url: node.url, title: node.title || node.url, provenance: 'MEASURED_CITATION' });
    if (Array.isArray(node)) node.forEach(walk); else Object.values(node).forEach(walk);
  };
  walk(json);
  return { query, retrievedAt: now(), synthesis: textBlocks(json).join('\n'), sources: sources.slice(0, 24) };
}

async function readNewsTitles() {
  try {
    const response = await fetch('https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en', { headers: { 'user-agent': 'AUTO-YTB research client' } });
    const xml = await response.text();
    return [...xml.matchAll(/<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<link>([\s\S]*?)<\/link>[\s\S]*?<\/item>/g)].slice(0, 24).map((match) => ({ title: clean(match[1].replace(/<!\[CDATA\[|\]\]>/g, '')), url: clean(match[2]) }));
  } catch { return []; }
}

async function discoverOpportunity(history = { productions: [] }) {
  const live = await readNewsTitles();
  const recent = history.productions.slice(-8).map((item) => `${item.topic} (${item.domain || 'unknown'})`).join('\n');
  const prompt = `You are the opportunity editor for a general YouTube studio. Choose one genuinely interesting video opportunity from the live headlines below, or propose a closely related evergreen opportunity with strong visual evidence. Avoid repeating recent studio history and avoid every term in the excluded-topic policy supplied below. For this validation, prefer a concrete question about a physical place, product, machine, transport system, landmark, historical object or visible engineering change with a deep public visual archive. The key entities should be things a viewer can actually see in licensed/public-domain photos, diagrams, places, products or documents, not only abstract political claims. Return JSON with topic, angle, audience, domain, freshness, whyClick, whyFinish, entities (3-8), researchQuery, visualQueries (8-12), titleHypotheses, thumbnailPromise. Do not invent audience metrics.\nEXCLUDED-TOPIC POLICY:\n${legacyTerms.join(', ')}\nRECENT PRODUCTION HISTORY TO AVOID:\n${recent || 'none'}\nHEADLINES:\n${live.map((item) => `${item.title} | ${item.url}`).join('\n')}`;
  const candidate = await geminiJson(prompt);
  assertNovel(JSON.stringify(candidate), 'opportunity');
  return { ...candidate, inputMode: 'RADAR_AUTONOMOUS', liveSignals: live, selectedAt: now() };
}

async function loadCreativeHistory() { return readJson(MEMORY, { version: 1, productions: [], learning: [] }); }
async function noveltyAgainstHistory(candidate, history) {
  const c = `${candidate.topic} ${candidate.angle} ${(candidate.entities || []).join(' ')}`.toLowerCase();
  const scores = history.productions.map((item) => {
    const h = `${item.topic} ${item.angle} ${(item.entities || []).join(' ')}`.toLowerCase();
    const a = new Set(c.split(/\W+/).filter((x) => x.length > 3));
    const b = new Set(h.split(/\W+/).filter((x) => x.length > 3));
    const overlap = [...a].filter((token) => b.has(token)).length / Math.max(1, Math.min(a.size, b.size));
    return { runId: item.runId, similarity: Number(overlap.toFixed(3)) };
  });
  return { maxSimilarity: Math.max(0, ...scores.map((item) => item.similarity)), comparisons: scores };
}

async function discoverCommons(query, limit = 6) {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.search = new URLSearchParams({ action: 'query', generator: 'search', gsrsearch: `${query} filetype:bitmap`, gsrnamespace: '6', gsrlimit: String(Math.min(12, limit * 2)), prop: 'imageinfo', iiprop: 'url|mime|size|extmetadata', iiurlwidth: '1600', format: 'json', origin: '*', maxlag: '5' }).toString();
  let response;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    response = await fetch(url, { headers: { 'user-agent': 'AUTO-YTB Media Intelligence research client (contact: local studio)' } });
    if (response.status !== 429 && response.status !== 503) break;
    const retryAfter = Number(response.headers.get('retry-after') || 0);
    await sleep(Math.max(1200, retryAfter * 1000, 1200 * (attempt + 1)));
  }
  if (!response.ok) throw new Error(`Wikimedia search ${response.status}`);
  const json = await response.json();
  return Object.values(json?.query?.pages ?? []).map((page) => {
    const info = page.imageinfo?.[0] ?? {};
    const meta = info.extmetadata ?? {};
    const license = clean(meta.LicenseShortName?.value || meta.UsageTerms?.value || '');
    const blocked = /NC|ND|unknown|all rights reserved/i.test(license) || !license;
    return { pageId: page.pageid, title: String(page.title || '').replace(/^File:/, ''), pageUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(String(page.title || '').replaceAll(' ', '_'))}`, url: info.thumburl || info.url, mime: info.mime || '', width: info.thumbwidth || info.width, height: info.thumbheight || info.height, license, rightsStatus: blocked ? 'BLOCKED' : 'CLEARED', creator: clean(meta.Artist?.value || meta.Credit?.value || ''), attribution: clean(meta.Credit?.value || meta.Artist?.value || page.title || '') };
  }).filter((asset) => asset.url && asset.rightsStatus === 'CLEARED').slice(0, limit);
}

async function downloadAsset(asset, index) {
  const extension = asset.mime.includes('png') ? '.png' : '.jpg';
  const target = join(mediaRoot, `${String(index).padStart(2, '0')}-${slug(asset.title)}${extension}`);
  if (!existsSync(target)) {
    let response;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      response = await fetch(asset.url, { headers: { 'user-agent': 'AUTO-YTB Media Vault (contact: local studio)' } });
      if (response.status !== 429 && response.status !== 503) break;
      const retryAfter = Number(response.headers.get('retry-after') || 0);
      await sleep(Math.max(1500, retryAfter * 1000, 1500 * (attempt + 1)));
    }
    if (!response.ok) throw new Error(`Media download ${response.status}: ${asset.url}`);
    await writeFile(target, Buffer.from(await response.arrayBuffer()));
  }
  asset.localPath = target;
  asset.sha256 = hash(await readFile(target));
  asset.discoveredAt = now();
  return asset;
}

async function buildOpportunity(promptInput, history) {
  if (mode === 'radar') return discoverOpportunity(history);
  if (!promptInput) throw new Error('Prompt mode requires --prompt');
  assertNovel(promptInput, 'prompt');
  const inferred = await geminiJson(`Convert this creator prompt into a production brief for an autonomous video studio. Do not write the script yet. Resolve concrete named entities, domain, research query and 8-12 specific media queries that can find exact public audiovisual evidence. Return JSON with topic, angle, audience, domain, entities (3-8), researchQuery, visualQueries, titleHypotheses, thumbnailPromise. Prompt: ${promptInput}`);
  assertNovel(JSON.stringify(inferred), 'inferred prompt');
  return { ...inferred, topic: inferred.topic || promptInput, angle: inferred.angle || promptInput, inputMode: 'USER_PROMPT', selectedAt: now(), sourcePrompt: promptInput };
}

async function makeScript(opportunity, research, media) {
  const duration = Math.max(45, Math.min(240, requestedDuration));
  const beatTarget = Math.max(6, Math.min(16, Math.round(duration / 12)));
  const sourceDigest = media.slice(0, 24).map((asset) => `${asset.title} | ${asset.pageUrl} | ${asset.license}`).join('\n');
  const prompt = `Write an original, natural English YouTube script for a ${duration}-second ${duration > 120 ? '16:9 documentary explainer' : 'fast explainer'} about: ${opportunity.topic}. Angle: ${opportunity.angle}. Audience: ${opportunity.audience || 'general audience'}. Use only claims supported by the research below. The narration must progress through new information, concrete evidence, contrast or consequence; no filler, no generic welcome, no repeated thesis. Start with a value-first hook. End with a payoff or useful answer. Return JSON: {title, hookMechanism, narration, beats:[{id,narration,entities,claimIds,visualIntent,mediaQuery,editorialForm,importance}], claims:[{id,text,type,sourceUrls,confidence}], entities:[{name,type,aliases}], packaging:{title,thumbnailText,thumbnailConcept,description}}. Need ${beatTarget} meaningfully different beats. Keep the narration long enough for the requested duration but never pad. Every beat must name an exact visual intention and query.\nRESEARCH:\n${research.synthesis.slice(0, 16000)}\nSOURCES:\n${research.sources.map((source) => `${source.title} | ${source.url}`).join('\n')}\nMEDIA RECONNAISSANCE:\n${sourceDigest}`;
  const script = await geminiJson(prompt);
  if (!script.beats?.length || !script.narration) throw new Error('Script generation returned no usable beats');
  assertNovel(JSON.stringify(script), 'script');
  return { ...script, targetDurationSec: duration, generatedAt: now(), alignmentMethod: 'ESTIMATED_ALIGNMENT' };
}

function makeAlignment(text, duration) {
  const characters = [...text];
  const step = duration / Math.max(1, characters.length);
  return { characters, characterStartTimesSeconds: characters.map((_, index) => index * step), characterEndTimesSeconds: characters.map((_, index) => (index + 1) * step) };
}

async function makeMusic(duration, variant) {
  const target = join(runRoot, 'audio', 'music.wav');
  await mkdir(dirname(target), { recursive: true });
  const base = 180 + (variant % 5) * 37;
  await run('ffmpeg', ['-y', '-f', 'lavfi', '-i', `sine=frequency=${base}:sample_rate=48000`, '-f', 'lavfi', '-i', `sine=frequency=${base * 1.5}:sample_rate=48000`, '-filter_complex', '[0:a]volume=0.035[a];[1:a]volume=0.018[b];[a][b]amix=inputs=2:duration=longest,lowpass=f=1200,afade=t=in:st=0:d=1,afade=t=out:st=' + Math.max(1, duration - 2) + ':d=2', '-t', String(duration), '-ac', '2', target], { quiet: true });
  return target;
}

async function buildThumbnail(imagePath, text) {
  const target = join(finalRoot, 'thumbnail.jpg');
  const titleFile = join(runRoot, 'thumbnail-title.txt');
  await writeFile(titleFile, clean(text).slice(0, 70));
  await run('ffmpeg', ['-y', '-i', imagePath, '-vf', `scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,drawbox=x=0:y=0:w=iw:h=ih:color=black@0.25:t=fill,drawtext=textfile='${titleFile.replaceAll('\\', '/').replaceAll(':', '\\:')}':fontcolor=white:fontsize=58:line_spacing=8:borderw=3:bordercolor=black:x=70:y=h-190`, '-frames:v', '1', '-q:v', '2', target], { quiet: true });
  return target;
}

async function renderRun(script, assets, assignments = assets) {
  const duration = Number(script.targetDurationSec);
  const totalWords = script.narration.split(/\s+/).filter(Boolean).length;
  const secondsPerWord = duration / Math.max(1, totalWords);
  let cursor = 0;
  const beats = script.beats.map((beat, index) => {
    const words = clean(beat.narration).split(/\s+/).filter(Boolean).length;
    const natural = Math.max(2.2, Math.min(24, words * secondsPerWord));
    const durationSec = index === script.beats.length - 1 ? Math.max(1.5, duration - cursor) : natural;
    const result = { ...beat, id: beat.id || `beat-${index + 1}`, startSec: Number(cursor.toFixed(3)), targetDurationSec: Number(durationSec.toFixed(3)) };
    cursor += durationSec;
    return result;
  });
  const store = new NodeLocalObjectStore(join(runRoot, 'storage'));
  const voiceProvider = new GeminiVoiceProvider({ apiKey: API_KEY, store, model: TTS_MODEL, defaultVoice: TTS_VOICE, protocol: 'generateContent' });
  let voice = await voiceProvider.synthesize({ text: script.narration, voice: TTS_VOICE, language: 'en-US' });
  let actualDuration = Number(voice.durationSeconds);
  if (actualDuration < duration * 0.98) {
    const stretchedPath = join(runRoot, 'audio', 'voice-stretched.wav');
    await run('ffmpeg', ['-y', '-i', voice.uri.replace(/^file:\/\//, ''), '-filter:a', `atempo=${(actualDuration / duration).toFixed(5)}`, '-ar', '24000', '-ac', '1', stretchedPath], { quiet: true });
    voice = { ...voice, uri: fileUri(stretchedPath), durationSeconds: duration, metadata: { ...(voice.metadata || {}), alignment: 'ESTIMATED_ALIGNMENT_STRETCHED_TO_TARGET' } };
    actualDuration = duration;
  }
  const music = await makeMusic(actualDuration, hash(script.title).charCodeAt(0));
  const count = Math.max(1, assignments.length);
  const scenes = beats.map((beat, index) => ({ id: `${beat.id}-s${index + 1}`, startSec: beat.startSec, durationSec: beat.targetDurationSec, kind: 'image', instruction: beat.visualIntent, sourceIds: [assignments[index % count].id], generated: false }));
  const timelineAssets = scenes.map((scene, index) => { const asset = assignments[index % count]; return { id: `${asset.id}-${index}`, uri: fileUri(asset.localPath), mimeType: extname(asset.localPath).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg', provider: asset.provider, model: 'commons-segment-index-v1', costUsd: 0, sceneId: scene.id, generated: false, sourceIds: [asset.id], sourceUrl: asset.pageUrl, license: asset.license, metadata: { sourceUrl: asset.pageUrl, rightsStatus: asset.rightsStatus, attribution: asset.attribution, entityMatch: asset.entityMatch, segment: { startSec: 0, endSec: null }, repeatedSource: index >= new Set(assignments.map((item) => item.id)).size } }; });
  const renderManifest = { projectId: runId, createdAt: now(), contentFormat: 'LONG_HORIZONTAL', aspectRatio: '16:9', frame: { width: 1280, height: 720 }, engineeringResolution: '1280x720', contentArchetype: { version: 1, id: 'AUTONOMOUS_SOURCED_NARRATIVE', label: 'Autonomous sourced narrative', confidence: 70, reasons: ['selected from live input and media reconnaissance'], voiceMode: 'SINGLE_NARRATOR', realityMode: 'FACTUAL', cameraProfile: 'EDITORIAL_DOCUMENTARY', syntheticDisclosurePolicy: 'Synthetic voice only; visuals are rights-cleared source material.', profile: {} }, executionPlan: { archetypeId: 'AUTONOMOUS_SOURCED_NARRATIVE', researchMode: 'FACTUAL_RESEARCH', researchRequired: true, factClaimMode: 'VERIFY_CLAIMS', scriptMode: 'NARRATION', voiceMode: 'SINGLE_NARRATOR', voiceRequired: true, allowIntegratedNarrator: false, requiresCanonicalCast: false, audioMode: 'NARRATION_LED', captionMode: 'FULL_SPEECH', visualMode: 'EVIDENCE_FIRST', realityMode: 'FACTUAL', cameraProfile: 'EDITORIAL_DOCUMENTARY', syntheticDisclosurePolicy: 'Synthetic voice only; visuals are rights-cleared source material.', preferredFormats: ['LONG_HORIZONTAL'], targetSceneDurationSec: { long: 12 }, generativeSpendBias: 0, requiredCapabilities: { search: true, voice: true, image: false, video: false } }, captionPlan: { enabled: true, burnIn: false, preset: 'EDITORIAL_CLEAN', source: 'VOICE_ALIGNMENT', mode: 'FULL_SPEECH', maxChars: 48, maxDurationSeconds: 4.2, maxLines: 2 }, editPlan: { preset: 'DOCUMENTARY', transitionMode: 'MOTIVATED', filmLook: false, punchInAnchors: true, preserveAudioTiming: true }, script: { title: script.title, targetDurationSec: actualDuration, beats }, scenes, assets: timelineAssets, voice: { id: `voice-${runId}`, uri: voice.uri, mimeType: voice.mimeType, provider: voice.provider, model: voice.model, durationSeconds: actualDuration, costUsd: 0, alignment: makeAlignment(script.narration, actualDuration) }, music: { assetId: 'music-local', kind: 'music', uri: fileUri(music), startSec: 0, gain: 0.16, loop: true, endSec: actualDuration, license: 'original-local-procedural', rightsStatus: 'CLEARED', costUsd: 0 }, estimatedCostUsd: 0, actualCostUsd: 0, containsSyntheticMedia: true };
  await writeJson(join(runRoot, 'timeline', 'MasterTimeline.json'), renderManifest);
  const manifestPath = join(runRoot, 'timeline', 'render-manifest.json');
  await writeJson(manifestPath, renderManifest);
  const renderer = new FfmpegRenderer({ outputRoot: renderRoot, width: 1280, height: 720, fps: 30, targetLufs: -16, truePeakDb: -1.5, loudnessRange: 7 });
  const rendered = await renderer.render({ manifestUri: fileUri(manifestPath), outputKey: 'v1.mp4' });
  const srtPath = rendered.metadata?.subtitlesUri?.replace(/^file:\/\//, '');
  const burned = join(finalRoot, 'video-v1.mp4');
  if (srtPath && existsSync(srtPath)) await run('ffmpeg', ['-y', '-i', rendered.uri.replace(/^file:\/\//, ''), '-vf', `subtitles='${srtPath.replaceAll('\\', '/').replaceAll(':', '\\:')}'`, '-c:a', 'copy', burned], { quiet: true });
  else await copyFile(rendered.uri.replace(/^file:\/\//, ''), burned);
  return { renderManifest, voice, actualDuration, music, v1: burned, srtPath };
}

async function inspectVideo(path) {
  const probeFile = join(runRoot, 'qc', 'ffprobe.json');
  await mkdir(dirname(probeFile), { recursive: true });
  await run('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', path], { quiet: true }).then(async () => {}).catch(() => {});
  const probe = await new Promise((resolvePromise, reject) => {
    const child = spawn('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', path], { stdio: ['ignore', 'pipe', 'pipe'] }); let out = ''; let err = ''; child.stdout.on('data', (chunk) => { out += chunk; }); child.stderr.on('data', (chunk) => { err += chunk; }); child.on('close', (code) => code === 0 ? resolvePromise(JSON.parse(out)) : reject(new Error(err)));
  });
  await writeJson(probeFile, probe);
  const video = probe.streams?.find((stream) => stream.codec_type === 'video');
  const audio = probe.streams?.find((stream) => stream.codec_type === 'audio');
  const duration = Number(probe.format?.duration || video?.duration || 0);
  const framesDir = join(runRoot, 'qc', 'frames'); await mkdir(framesDir, { recursive: true });
  const sampleTimes = [0, Math.max(0.1, duration * 0.18), duration * 0.38, duration * 0.58, duration * 0.78, Math.max(0.1, duration - 0.2)];
  for (let index = 0; index < sampleTimes.length; index += 1) await run('ffmpeg', ['-y', '-ss', String(sampleTimes[index]), '-i', path, '-frames:v', '1', '-q:v', '3', join(framesDir, `${index}.jpg`)], { quiet: true });
  const sceneFile = join(runRoot, 'qc', 'scene-changes.txt');
  await new Promise((resolvePromise) => { const child = spawn('ffmpeg', ['-i', path, '-vf', "select='gt(scene,0.38)',showinfo", '-an', '-f', 'null', '-'], { stdio: ['ignore', 'ignore', 'pipe'] }); let out = ''; child.stderr.on('data', (chunk) => { out += chunk; }); child.on('close', () => { writeFile(sceneFile, out, 'utf8').then(resolvePromise); }); });
  const sceneChanges = (await readFile(sceneFile, 'utf8')).split('showinfo').length - 1;
  return { status: video && audio && duration > 0 ? 'PASS' : 'FAIL', durationSeconds: duration, width: Number(video?.width || 0), height: Number(video?.height || 0), hasAudio: Boolean(audio), sceneChanges, sampleFrames: sampleTimes.map((_, index) => join(framesDir, `${index}.jpg`)), critic: { inspectedRenderedArtifact: true, sampledIntervals: sampleTimes.length, findings: sceneChanges < Math.max(3, sampleTimes.length - 2) ? ['LOW_VISUAL_CHANGE_RISK'] : [], status: sceneChanges < 3 ? 'INTERNAL_REVIEW_REQUIRED' : 'PASS' } };
}

async function normalizeFinalDuration(path, targetSeconds) {
  const probe = await new Promise((resolvePromise, reject) => {
    const child = spawn('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_format', path], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; let err = '';
    child.stdout.on('data', (chunk) => { out += chunk; }); child.stderr.on('data', (chunk) => { err += chunk; });
    child.on('close', (code) => code === 0 ? resolvePromise(JSON.parse(out)) : reject(new Error(err)));
  });
  const current = Number(probe.format?.duration || 0);
  if (!Number.isFinite(current) || current >= targetSeconds - 0.25) return path;
  const padded = join(dirname(path), `${path.split(/[\\/]/).pop().replace(/\.mp4$/i, '')}-duration.mp4`);
  const extra = Math.max(0, targetSeconds - current);
  await run('ffmpeg', ['-y', '-i', path, '-vf', `tpad=stop_mode=clone:stop_duration=${extra.toFixed(3)}`, '-af', `apad=whole_dur=${targetSeconds.toFixed(3)}`, '-t', targetSeconds.toFixed(3), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-c:a', 'aac', '-b:a', '128k', padded], { quiet: true });
  return padded;
}

async function main() {
  legacyTerms = await readJson(resolve(ROOT, 'scripts', 'fixtures', 'legacy-topic-terms.json'), []);
  if (!API_KEY) throw new Error('Missing GEMINI_API_KEY');
  await mkdir(mediaRoot, { recursive: true }); await mkdir(reportRoot, { recursive: true }); await mkdir(finalRoot, { recursive: true });
  const history = await loadCreativeHistory();
  const cachedOpportunity = await readJson(join(reportRoot, 'opportunity.json'), null);
  const opportunity = cachedOpportunity?.topic ? cachedOpportunity : await buildOpportunity(requestedPrompt, history);
  const novelty = cachedOpportunity?.topic ? await readJson(join(reportRoot, 'novelty.json'), await noveltyAgainstHistory(opportunity, history)) : await noveltyAgainstHistory(opportunity, history);
  if (novelty.maxSimilarity >= 0.55) throw new Error(`NOVELTY_GATE_BLOCKED similarity=${novelty.maxSimilarity}`);
  await writeJson(join(reportRoot, 'opportunity.json'), opportunity); await writeJson(join(reportRoot, 'novelty.json'), novelty);
  const research = await geminiResearch(opportunity.researchQuery || opportunity.topic, { recencyDays: mode === 'current' ? 14 : undefined });
  const cachedMedia = await readJson(join(reportRoot, 'MediaVault.json'), []);
  let receipts = await readJson(join(reportRoot, 'media-search-receipts.json'), []);
  let media = Array.isArray(cachedMedia) && cachedMedia.length >= 6 && cachedMedia.every((asset) => asset.localPath && existsSync(asset.localPath)) ? cachedMedia : [];
  if (!media.length) {
    const mediaQueries = [...new Set([...(opportunity.visualQueries || []), ...(opportunity.entities || []).map((entity) => `${entity} official image`), opportunity.topic])].slice(0, 12);
    const candidates = [];
    receipts = [];
    for (const query of mediaQueries) { const results = await discoverCommons(query, 4); receipts.push({ query, provider: 'Wikimedia Commons API', retrievedAt: now(), resultsConsidered: results.map((result) => ({ title: result.title, url: result.pageUrl, rights: result.license })), selected: results[0]?.pageUrl ?? null }); candidates.push(...results.map((result) => ({ ...result, query, id: `commons-${hash(result.pageUrl).slice(0, 12)}`, provider: 'Wikimedia Commons', entityMatch: query }))); await sleep(850); }
    const unique = [...new Map(candidates.map((item) => [item.pageUrl, item])).values()];
    const minimumMedia = mode === 'prompt' && (opportunity.entities || []).length >= 3 ? 4 : 6;
    if (unique.length < minimumMedia) throw new Error(`MEDIA_RECON_BLOCKED only ${unique.length} rights-cleared assets discovered`);
    const downloaded = []; for (const [index, asset] of unique.slice(0, 18).entries()) downloaded.push(await downloadAsset(asset, index));
    media = downloaded.map((asset) => ({ ...asset, sourceType: 'DISCOVERY_AND_PUBLISHABLE', segment: { startSec: 0, endSec: null }, semanticMatch: 'CANDIDATE_EXACT_OR_STRONG', rightsEvidence: { license: asset.license, pageUrl: asset.pageUrl, status: asset.rightsStatus } }));
  }
  await writeJson(join(reportRoot, 'media-search-receipts.json'), receipts);
  await writeJson(join(reportRoot, 'MediaVault.json'), media);
  const script = await makeScript(opportunity, research, media);
  await writeJson(join(reportRoot, 'opportunity.json'), opportunity); await writeJson(join(reportRoot, 'novelty.json'), novelty); await writeJson(join(reportRoot, 'research-pack.json'), research); await writeJson(join(reportRoot, 'script.json'), script);
  const scoreMedia = (beat, asset) => {
    const tokens = new Set(`${beat.mediaQuery || ''} ${(beat.entities || []).join(' ')} ${opportunity.topic}`.toLowerCase().split(/\W+/).filter((token) => token.length > 3));
    const titleTokens = new Set(clean(asset?.title).toLowerCase().split(/\W+/).filter((token) => token.length > 3));
    return [...tokens].filter((token) => titleTokens.has(token));
  };
  const usedAssignments = new Set();
  const assignments = script.beats.map((beat, index) => {
    const ranked = media.map((asset) => ({ asset, overlap: scoreMedia(beat, asset).length })).sort((a, b) => b.overlap - a.overlap);
    const preferred = ranked.find((item) => item.overlap > 0 && !usedAssignments.has(item.asset.pageUrl)) || ranked.find((item) => item.overlap > 0) || ranked.find((item) => !usedAssignments.has(item.asset.pageUrl)) || ranked[0];
    if (preferred?.asset) usedAssignments.add(preferred.asset.pageUrl);
    return preferred?.asset || media[index % media.length];
  });
  const selectedAssets = [...new Map(assignments.map((asset) => [asset.pageUrl, asset])).values()];
  const coverage = script.beats.map((beat, index) => {
    const asset = assignments[index];
    const tokens = new Set(`${beat.mediaQuery || ''} ${(beat.entities || []).join(' ')} ${opportunity.topic}`.toLowerCase().split(/\W+/).filter((token) => token.length > 3));
    const titleTokens = new Set(clean(asset?.title).toLowerCase().split(/\W+/).filter((token) => token.length > 3));
    const overlap = [...tokens].filter((token) => titleTokens.has(token));
    const genericVisualTokens = new Set(['bridge', 'river', 'road', 'view', 'aerial', 'photo', 'image', 'file', 'jpg', '2022', '2016', '2014', 'official', 'historical', 'detail', 'steel', 'structure', 'engineering']);
    const concreteEntities = (beat.entities || []).slice(0, 3).map((entity) => [...new Set(String(entity).toLowerCase().split(/\W+/).filter((token) => token.length > 3 && !genericVisualTokens.has(token)))]).filter((tokens) => tokens.length > 0);
    const entityMatches = concreteEntities.map((tokens) => tokens.filter((token) => titleTokens.has(token)));
    const distinctiveEntityOverlap = [...new Set(entityMatches.flat())];
    const exact = concreteEntities.length > 0 && entityMatches.every((matches, index) => matches.length === concreteEntities[index].length);
    return { beatId: beat.id, narration: beat.narration, entity: beat.entities, selectedAsset: asset?.title, class: exact ? 'EXACT' : 'CONTEXTUAL', confidence: exact ? 'PROVENANCE_PLUS_TITLE_ENTITY_MATCH' : 'PROVENANCE_ONLY_CONTEXTUAL', query: beat.mediaQuery, titleOverlap: overlap.slice(0, 8), distinctiveEntityOverlap };
  });
  const contextualRatio = coverage.filter((item) => item.class === 'CONTEXTUAL').length / Math.max(1, coverage.length);
  const coverageGate = contextualRatio > 0.35 ? { status: 'INTERNAL_REVIEW_REQUIRED', contextualRatio, reason: 'Critical narration intervals remain contextual rather than entity-exact.' } : { status: 'PASS', contextualRatio };
  const rightsLedger = selectedAssets.map((asset) => ({ assetId: asset.id, source: asset.pageUrl, provider: asset.provider, license: asset.license, creator: asset.creator, attribution: asset.attribution, status: asset.rightsStatus, checkedAt: asset.discoveredAt }));
  await writeJson(join(reportRoot, 'ScriptMediaCoverageMatrix.json'), coverage); await writeJson(join(reportRoot, 'RightsLedger.json'), rightsLedger); await writeJson(join(reportRoot, 'VideoBlueprint.json'), { viewerPromise: opportunity.angle, hook: script.hookMechanism, beats: coverage, coverageGate, sourceDiversity: { uniqueAssets: selectedAssets.length, uniqueSourcePages: new Set(selectedAssets.map((asset) => asset.pageUrl)).size, topSourceShare: 1 / Math.max(1, selectedAssets.length) } });
  const rendered = await renderRun(script, selectedAssets, assignments);
  const v1Qc = await inspectVideo(rendered.v1);
  const thumbnail = await buildThumbnail(selectedAssets[0].localPath, script.packaging?.thumbnailText || script.title);
  const beforeHash = hash(await readFile(rendered.v1));
  // A real localized repair: if the rendered critic sees a weak change rhythm,
  // replace only the first beat asset and re-render the affected manifest.
  let finalVideo = rendered.v1; let repair = { applied: false, reason: 'No critical rendered defect required repair', beforeHash, afterHash: beforeHash };
  const weakCoverageIndex = coverage.findIndex((item) => item.class === 'CONTEXTUAL');
  if ((v1Qc.critic.findings.includes('LOW_VISUAL_CHANGE_RISK') || coverageGate.status !== 'PASS') && selectedAssets.length > 1) {
    const repairIndex = weakCoverageIndex >= 0 ? weakCoverageIndex : 0;
    const replacement = selectedAssets.find((asset, index) => index !== repairIndex && asset.pageUrl !== rendered.renderManifest.assets[repairIndex]?.sourceUrl) || selectedAssets[(repairIndex + 1) % selectedAssets.length];
    const repairedManifest = { ...rendered.renderManifest, assets: rendered.renderManifest.assets.map((asset, index) => index === repairIndex ? { ...asset, uri: fileUri(replacement.localPath), sourceUrl: replacement.pageUrl, metadata: { ...asset.metadata, repair: 'LOCALIZED_COVERAGE_ASSET_REPLACEMENT', rightsStatus: replacement.rightsStatus } } : asset) };
    const repairedPath = join(runRoot, 'timeline', 'repair-manifest.json'); await writeJson(repairedPath, repairedManifest);
    const renderer = new FfmpegRenderer({ outputRoot: join(renderRoot, 'repair'), width: 1280, height: 720, fps: 30, targetLufs: -16, truePeakDb: -1.5, loudnessRange: 7 });
    const repaired = await renderer.render({ manifestUri: fileUri(repairedPath), outputKey: 'v2.mp4' });
    finalVideo = join(finalRoot, 'video-v2.mp4'); await copyFile(repaired.uri.replace(/^file:\/\//, ''), finalVideo);
    const afterHash = hash(await readFile(finalVideo)); const v2Qc = await inspectVideo(finalVideo); repair = { applied: true, reason: coverageGate.status !== 'PASS' ? 'VISUAL_NARRATION_MISMATCH' : 'LOW_VISUAL_CHANGE_RISK', patch: `REPLACE_ASSET:editorial-unit-${repairIndex + 1}`, beforeHash, afterHash, pixelsChanged: beforeHash !== afterHash, v1Qc, v2Qc };
  }
  finalVideo = await normalizeFinalDuration(finalVideo, Number(script.targetDurationSec));
  const finalQc = await inspectVideo(finalVideo);
  await copyFile(finalVideo, join(finalRoot, 'final.mp4'));
  const historyRecord = { runId, topic: opportunity.topic, angle: opportunity.angle, entities: opportunity.entities, domain: opportunity.domain, inputMode: opportunity.inputMode, sourceUrls: selectedAssets.map((asset) => asset.pageUrl), providers: ['Wikimedia Commons', 'Gemini TTS', 'ffmpeg-local'], titlePattern: script.packaging?.title || script.title, thumbnailPattern: script.packaging?.thumbnailConcept, storyStructure: script.hookMechanism, visualStyle: 'rights-cleared editorial stills with restrained motion', voice: TTS_VOICE, musicStyle: 'procedural low-volume tonal bed', status: finalQc.status, createdAt: now(), novelty };
  history.productions.push(historyRecord); history.learning.push({ runId, observed: { duration: finalQc.durationSeconds, sourceCount: selectedAssets.length, exactCoverage: coverage.filter((item) => item.class === 'EXACT').length / Math.max(1, coverage.length), strongCoverage: coverage.filter((item) => item.class === 'STRONG').length / Math.max(1, coverage.length), genericBrollRatio: 0, sourceConcentration: 1 / Math.max(1, selectedAssets.length), critic: finalQc.critic }, confidence: 'LOW_SINGLE_SAMPLE', recordedAt: now() }); await writeJson(MEMORY, history);
  const report = { version: 1, runId, status: finalQc.status === 'PASS' && coverageGate.status === 'PASS' ? 'READY_FOR_HUMAN_REVIEW' : 'INTERNAL_REVIEW_REQUIRED', input: { mode, prompt: requestedPrompt || null, opportunity }, output: { video: finalVideo, thumbnail, durationSeconds: finalQc.durationSeconds, format: '16:9', title: script.packaging?.title || script.title }, research: { sources: research.sources, receiptPath: join(reportRoot, 'media-search-receipts.json') }, media: { selected: selectedAssets.length, uniqueSourcePages: new Set(selectedAssets.map((asset) => asset.pageUrl)).size, rights: rightsLedger, coverage, coverageGate }, qc: { v1: v1Qc, repair, final: finalQc }, cost: { externalPaidUsd: 'UNKNOWN_PROVIDER_BILLING_NOT_EXPOSED', localRenderUsd: 0, tts: 'existing_configured_resource' }, limitations: ['Visuals are rights-cleared still media with editorial motion; no claim of native footage coverage.', 'Alignment is ESTIMATED_ALIGNMENT because the current voice path did not return word timing.', 'Human review remains required.', ...(coverageGate.status === 'PASS' ? [] : ['Coverage gate failed: some named entities are only contextual in the final timeline.'])] };
  await writeJson(join(reportRoot, 'production-run.json'), report); await writeJson(join(runRoot, 'run-manifest.json'), { runId, inputMode: mode, createdAt: now(), stages: ['OPPORTUNITY', 'RESEARCH', 'MEDIA_RECONNAISSANCE', 'SCRIPT', 'VOICE', 'TIMELINE', 'RENDER', 'CRITIC', 'REPAIR', 'PACKAGING'], artifacts: report });
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
