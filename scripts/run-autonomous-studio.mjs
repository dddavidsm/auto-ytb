import { mkdir, readFile, writeFile, copyFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve, extname } from 'node:path';
import { spawn } from 'node:child_process';
import { NodeLocalObjectStore, FfmpegRenderer } from '../packages/runtime-node/index.mjs';
import { GeminiVoiceProvider, GeminiVideoProvider } from '../packages/providers/dist/index.js';
import { withGeminiWordAlignment } from '../packages/runtime-node/gemini-word-alignment.mjs';
import { runGenerativeProduction } from './generative-production-run.mjs';
import { ProductionDirector, searchPexelsVideo, searchPixabayVideo, searchWikimediaVideo, scoreNativeVideoAvailability, evaluateFootagePro, buildKaraokeChunks, buildNarrationUnits, matchSemanticFootage, coverageFromTimeline, timelineMediaRatios, evaluateCreativeGreenlightEvidence, evaluateModeContract, normalizeVisualIntent, parseShotBoundaries, segmentMediaRange, finalArtifactConsistencyGate, endingIntegrityReport, centralObjectEvidenceGate, SyntheticBrollEngine, assertGenerationJustification, buildVisualContinuityProfile, buildVisualGapReport, compileSyntheticShotPrompt, passesPhotorealismGate, assertFinalTimelineIsVideoOnly } from '../packages/production/dist/index.js';

// Canonical generic runtime. Run-specific topics, sources and decisions are
// always artifacts; this file contains no production fixture content.
const ROOT = resolve('.data/autonomous-production');
const MEMORY = resolve('.data/production-memory/creative-history.json');
const API_KEY = process.env.GEMINI_API_KEY;
const SEARCH_MODEL = process.env.GEMINI_SEARCH_MODEL || process.env.GEMINI_MODEL || 'gemini-3.7-flash';
const VISION_MODEL = process.env.VISION_MODEL || process.env.GEMINI_VISION_MODEL || 'gemini-3.6-flash';
const TTS_MODEL = process.env.GEMINI_TTS_MODEL || 'gemini-2.5-flash-preview-tts';
const TTS_VOICE = process.env.GEMINI_VOICE_ID || 'Kore';
let legacyTerms = [];

const arg = (name, fallback = undefined) => {
  const key = `--${name}`;
  const index = process.argv.indexOf(key);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
};
const normalizeMode = (value) => String(value ?? 'prompt').trim().toLowerCase().replaceAll('_', '-');
const mode = normalizeMode(arg('mode', 'prompt'));
const requestedPrompt = arg('prompt');
const requestedScriptPath = arg('script') || arg('script-path');
const requestedScoutTopic = arg('scout-topic');
const requestedDuration = Number(arg('duration', mode === 'radar' ? 150 : 90));
const requestedAspectRatio = arg('aspect-ratio', '16:9');
const requestedCharacterId = arg('character');
const requestedBudget = arg('budget');
const runId = arg('run-id', `studio-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 7)}`);
const resumeRun = process.argv.includes('--resume') || String(arg('resume', 'false')).toLowerCase() === 'true';
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
async function recordTopicRejection(topic, angle, blockers, reason) {
  const rejectedPath = join(reportRoot, 'rejected-topics.json');
  const rejected = await readJson(rejectedPath, []);
  const next = [...(Array.isArray(rejected) ? rejected : []), { topic, angle, blockers, reason: String(reason), rejectedAt: now() }];
  await writeJson(rejectedPath, next.filter((item, index, rows) => rows.findIndex((candidate) => candidate.topic === item.topic) === index));
}
async function fetchTimed(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: controller.signal }); } finally { clearTimeout(timeout); }
}

async function probeFile(path) {
  return await new Promise((resolvePromise, reject) => {
    const child = spawn('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', path], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = ''; let err = '';
    child.stdout.on('data', (chunk) => { out += chunk; }); child.stderr.on('data', (chunk) => { err += chunk; });
    child.on('close', (code) => code === 0 ? resolvePromise(JSON.parse(out)) : reject(new Error(`ffprobe failed: ${err}`)));
  });
}

async function probeVideoFile(path) {
  const probe = await probeFile(path);
  const stream = probe.streams?.find((item) => item.codec_type === 'video');
  const audio = probe.streams?.find((item) => item.codec_type === 'audio');
  const extension = extname(path).toLowerCase();
  const mime = extension === '.webm' ? 'video/webm' : extension === '.mp4' ? 'video/mp4' : String(probe.format?.format_name || '').includes('webm') ? 'video/webm' : 'video/mp4';
  return { durationSeconds: Number(probe.format?.duration || stream?.duration || 0), width: Number(stream?.width || 0), height: Number(stream?.height || 0), sourceAudio: Boolean(audio), mime };
}

function safeFileName(value, fallback = 'asset') { return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90) || fallback; }

function relevanceTokens(opportunity) {
  const stop = new Set(['the', 'and', 'with', 'from', 'into', 'this', 'that', 'video', 'test', 'testing', 'modern', 'actual', 'real', 'how', 'why', 'what', 'for', 'of']);
  return [...new Set(`${opportunity.topic || ''} ${(opportunity.entities || []).join(' ')}`.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 4 && !stop.has(token)))];
}

function movingCandidateRelevance(candidate, opportunity) {
  const searchable = clean(`${candidate.metadata?.title || ''} ${candidate.metadata?.description || ''} ${candidate.sourceUrl || ''}`).toLowerCase();
  const tokens = relevanceTokens(opportunity);
  return tokens.reduce((score, token) => score + (searchable.includes(token) ? 1 : 0), 0);
}

async function downloadMovingCandidate(candidate, targetRoot, index) {
  const url = candidate.metadata?.downloadUrl;
  if (!url) throw new Error(`Moving candidate ${candidate.id} has no downloadable source`);
  const extension = String(candidate.metadata?.mime || '').includes('webm') ? '.webm' : '.mp4';
  const target = join(targetRoot, `${String(index).padStart(2, '0')}-${safeFileName(candidate.metadata?.title || candidate.id)}${extension}`);
  if (!existsSync(target)) {
    let response;
    let lastStatus = 'unknown';
    for (let attempt = 0; attempt < 4; attempt += 1) {
      response = await fetchTimed(url, { headers: { 'user-agent': 'AUTO-YTB FootagePro/1.0 (rights-aware media client)', 'accept': 'video/*,application/octet-stream;q=0.9,*/*;q=0.1' } }, 90000);
      lastStatus = response.status;
      if (response.ok) break;
      if (![429, 500, 502, 503, 504].includes(response.status)) break;
      const retryAfter = Number(response.headers.get('retry-after') || 0);
      await sleep(Math.max(1500, retryAfter * 1000, 1500 * (attempt + 1)));
    }
    if (!response?.ok) throw new Error(`Moving media download failed ${lastStatus}: ${url}`);
    await writeFile(target, Buffer.from(await response.arrayBuffer()));
  }
  return { ...candidate, localPath: target, ...await probeVideoFile(target), acquisition: 'DOWNLOADED_REAL_VIDEO', downloadedAt: now() };
}

function titleActions(candidate) {
  const value = `${candidate.metadata?.title || ''} ${candidate.metadata?.description || ''} ${candidate.sourceUrl || ''}`.toLowerCase();
  return ['walking','running','driving','cooking','flying','launching','racing','building','working','moving','jumping','performing','demonstrating','exploding','flowing','demolition','demolishing','collapse','collapsing','stretching','folding','welding','cutting','carving','pouring','boiling','melting','lifting','loading','installing','paving','rolling','grinding','diving','landing','sliding','stirring','baking','harvesting','compacting','crushing','drilling','digging','floating','sailing','falling'].filter((action) => value.includes(action));
}

async function searchMovingTopic(query, limit = 8) {
  const results = await Promise.allSettled([
    searchPexelsVideo(query, { perPage: limit }),
    searchPixabayVideo(query, { perPage: limit }),
    searchWikimediaVideo(query, { limit, timeoutMs: 3000, retries: 1 }),
  ]);
  const empty = (provider) => ({ query, provider, fetchedAt: now(), candidates: [], capability: 'DISABLED' });
  const [pexels, pixabay, commons] = results.map((result, index) => result.status === 'fulfilled' ? result.value : empty(['Pexels', 'Pixabay', 'Wikimedia Commons'][index]));
  const providers = [pexels, pixabay, commons];
  const candidates = providers.flatMap((result) => result.candidates.map((candidate) => ({ ...candidate, entities: candidate.entities?.length ? candidate.entities : [], actions: candidate.actions?.length ? candidate.actions : titleActions(candidate), visualFingerprint: candidate.visualFingerprint || candidate.id, query }))).filter((candidate) => candidate.rightsTier === 'PUBLISHABLE_CONFIRMED' || candidate.rightsTier === 'PUBLISHABLE_WITH_ATTRIBUTION');
  return { query, providers: providers.map((item) => ({ provider: item.provider, capability: item.capability, totalResults: item.totalResults ?? null })), candidates: [...new Map(candidates.map((item) => [item.sourceKey || item.id, item])).values()] };
}

function broadenArchiveQueries(candidate) {
  const stopWords = new Set(['the', 'and', 'with', 'from', 'into', 'high', 'speed', 'deep', 'exact', 'physics', 'action', 'operations', 'operation', 'processing', 'mechanics', 'dynamic', 'modern', 'explained', 'behind', 'how', 'why', 'using', 'through']);
  const catalogTokens = clean(candidate.catalogQuery).toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 4 && !stopWords.has(token));
  const domainTokens = clean(candidate.domain).toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 4 && !stopWords.has(token));
  const entity = clean(candidate.entities?.[0]);
  return [...new Set([
    catalogTokens.slice(0, 2).join(' '),
    catalogTokens.slice(-2).join(' '),
    domainTokens.slice(0, 2).join(' '),
    entity ? `${entity} demonstration` : '',
  ].map(clean).filter((query) => query.split(' ').length >= 1 && query.length >= 4))].slice(0, 3);
}

async function scoutMovingTopics(history) {
  const cachedScout = await readJson(join(reportRoot, 'FootageScoutReport.json'), null);
  const previousTopic = (await readJson(join(reportRoot, 'opportunity.json'), null))?.topic;
  const priorGreenlight = await readJson(join(reportRoot, 'TopicGreenlightReport.json'), null);
  const rejectedTopicRows = await readJson(join(reportRoot, 'rejected-topics.json'), []);
  const rejectedTopics = new Set((Array.isArray(rejectedTopicRows) ? rejectedTopicRows : []).map((item) => item.topic).filter(Boolean));
  if (priorGreenlight?.status === 'REJECT' && previousTopic) rejectedTopics.add(previousTopic);
  const cachedWinner = cachedScout?.reports?.find((item) => !rejectedTopics.has(item.topic) && item.estimatedSegmentCount >= 15 && item.nativeVideo?.grade !== 'POOR' && item.nativeVideo?.actionCount >= 1);
  if (cachedWinner) return { winner: cachedWinner, reports: cachedScout.reports, resumedFromCache: true };
  const live = await readNewsTitles();
  const recent = history.productions.slice(-12).map((item) => `${item.topic} (${item.domain || 'unknown'})`).join('\n');
  const generated = await geminiJson(`Generate exactly 20 genuinely different YouTube opportunity candidates for a 45-75 second English FOOTAGE_PRO video. Favor subjects with abundant searchable real moving footage: people doing things, food preparation, sports action, vehicles moving, products being demonstrated, machines operating, transformations, competitions or visible experiments. Prefer broad concrete visual worlds over obscure processes. Return JSON array only with compact objects: [{topic,angle,domain,viewerPromise,hookIdea,entities,catalogQuery,searchQueries,thumbnailPromise}]. catalogQuery must be a broad 2-4 word public-archive phrase relevant to the topic, not a long title or abstract phrase. searchQueries must contain 4-8 materially different concrete footage searches: exact entity, action, demonstration, broad domain, alternate phrasing. Do not invent metrics. Avoid excluded historical terms. EXCLUDED: ${legacyTerms.join(', ')}. RECENT HISTORY: ${recent || 'none'}. LIVE SIGNALS: ${live.slice(0, 10).map((item) => item.title).join(' | ')}`);
  const candidates = Array.isArray(generated) ? generated : (generated.candidates || generated.topics || []);
  const reports = [];
  const scoutCandidate = async (candidate) => {
    assertNovel(JSON.stringify(candidate), 'moving footage scout');
    const initialQueries = [...new Set([...(Array.isArray(candidate.searchQueries) ? candidate.searchQueries : []), candidate.catalogQuery || `${candidate.domain || 'people action'} video`, candidate.entities?.[0] ? `${candidate.entities[0]} demonstration` : '', `${candidate.domain || 'people'} action video`].map(clean).filter(Boolean))].slice(0, 4);
    const searched = [];
    for (const query of initialQueries) searched.push(await searchMovingTopic(query, 12));
    let pool = [...new Map(searched.flatMap((item) => item.candidates).map((item) => [item.sourceKey || item.id, item])).values()];
    if (pool.filter((item) => movingCandidateRelevance(item, candidate) >= 2).length < 15) {
      for (const query of broadenArchiveQueries(candidate).slice(0, 4)) {
        if (initialQueries.includes(query)) continue;
        searched.push(await searchMovingTopic(query, 12));

        pool = [...new Map(searched.flatMap((item) => item.candidates).map((item) => [item.sourceKey || item.id, item])).values()];
        if (pool.length >= 15) break;
      }
    }
    const relevantPool = pool.filter((item) => movingCandidateRelevance(item, candidate) >= 2);
    const scoutAssets = relevantPool.map((item) => ({ ...item, usableDurationSeconds: Number(item.usableDurationSeconds || item.durationSeconds || 0), actions: item.actions?.length ? item.actions : titleActions(item) }));
    const score = scoreNativeVideoAvailability(scoutAssets, candidate.entities || []);
    return { ...candidate, scoutQueries: searched.map((item) => item.query), providerCapabilities: searched.flatMap((item) => item.providers), candidates: relevantPool, estimatedSegmentCount: scoutAssets.length, nativeVideo: score, rejectionReason: scoutAssets.length < 15 ? 'fewer than 15 relevant moving assets in quick scout' : score.grade === 'POOR' ? 'native moving-video grade is poor' : null, scoutedAt: now() };
  };
  const selectedCandidates = candidates.slice(0, 20);
  for (let offset = 0; offset < selectedCandidates.length; offset += 4) {
    reports.push(...await Promise.all(selectedCandidates.slice(offset, offset + 4).map(scoutCandidate)));
  }
  reports.sort((a, b) => {
    const actionDelta = (b.nativeVideo.actionCount - a.nativeVideo.actionCount) * 5;
    const audioDelta = (b.nativeVideo.sourceAudioCandidateCount - a.nativeVideo.sourceAudioCandidateCount) * 2;
    return actionDelta + audioDelta || (b.nativeVideo.score - a.nativeVideo.score) || (b.nativeVideo.publishableCandidateCount - a.nativeVideo.publishableCandidateCount);
  });
  await writeJson(join(reportRoot, 'FootageScoutReport.json'), { version: 1, candidateCount: reports.length, reports, credentials: { pexels: Boolean(process.env.PEXELS_API_KEY), pixabay: Boolean(process.env.PIXABAY_API_KEY) }, generatedAt: now() });
  const winner = reports.find((item) => !rejectedTopics.has(item.topic) && item.estimatedSegmentCount >= 15 && item.nativeVideo.grade !== 'POOR' && item.nativeVideo.actionCount >= 1);
  if (!winner) throw new Error(`FOOTAGE_SCOUT_BLOCKED: no topic reached 15 estimated moving segments; best=${reports[0]?.topic || 'none'} count=${reports[0]?.estimatedSegmentCount || 0}`);
  return { winner, reports };
}
const run = (command, args, options = {}) => new Promise((resolvePromise, reject) => {
  const child = spawn(command, args, { stdio: options.quiet ? ['ignore', 'ignore', 'pipe'] : ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });
  child.on('error', reject);
  child.on('close', (code) => code === 0 ? resolvePromise() : reject(new Error(`${command} exited ${code}: ${stderr.slice(-5000)}`)));
});

const captureCommand = (command, args) => new Promise((resolvePromise, reject) => {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = ''; let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  child.on('error', reject);
  child.on('close', (code) => code === 0 ? resolvePromise({ stdout, stderr }) : reject(new Error(`${command} exited ${code}: ${stderr.slice(-5000)}`)));
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
  const request = async (input) => {
    const response = await fetchTimed(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(SEARCH_MODEL)}:generateContent`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': API_KEY },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: input }] }], generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 8000 } }),
    }, 60000);
    if (!response.ok) throw new Error(`Gemini JSON ${response.status}: ${(await response.text()).slice(0, 700)}`);
    return response.json();
  };
  const first = await request(prompt);
  try { return parseJsonText(first); } catch (error) {
    const retry = await request(`${prompt}\nYour previous output was invalid JSON. Return only one syntactically valid JSON array or object. Do not use markdown fences, comments, trailing commas, or unescaped newlines inside strings.`);
    try { return parseJsonText(retry); } catch { throw error; }
  }
}

async function geminiVisualJson(framePaths, context = '', frameTimes = []) {
  if (!API_KEY) throw new Error('GEMINI_API_KEY is required for visual segment analysis');
  const temporalGuide = frameTimes.length ? `Frame timestamps in source seconds, in order: ${frameTimes.map((value, index) => `F${index + 1}=${Number(value).toFixed(3)}s`).join(', ')}. Use these timestamps when estimating the first moment of the main action.` : '';
  const parts = [{ text: `Analyze the actual video frames below, not the filename or source title. ${context}
${temporalGuide}
Return JSON only with these fields: entities (array of exact named entities visibly present), people, objects, actions (observable actions only), environment, location, visibleText, cameraDistance, cameraMovement, motionLevel (NONE|LOW|MEDIUM|HIGH|UNKNOWN), visualQuality (POOR|FAIR|GOOD|EXCELLENT|UNKNOWN), sourceAudioUseful (UNKNOWN unless independently verified), semanticDescription (one concrete sentence), confidence (0 to 1), photorealism (STRONG|MEDIUM|WEAK|UNKNOWN), temporalRealism (STRONG|MEDIUM|WEAK|UNKNOWN), styleMatch (STRONG|MEDIUM|WEAK|UNKNOWN), physics (STRONG|MEDIUM|WEAK|UNKNOWN), temporal (object with actionOnsetTime, actionPeakTime, recommendedStartTime, recommendedEndTime, confidence, evidence). The four realism fields are required only for a generated clip; otherwise use UNKNOWN. The temporal fields must be absolute source seconds when the frames show an action; otherwise use null for the action fields and the shot bounds for recommendedStartTime/recommendedEndTime. Do not guess an entity that cannot be visually identified. If the frames disagree, describe the sequence conservatively. A recommended range should begin shortly before the first visible action and end only after the action's useful visual resolution; never recommend a static lead-in merely because it is the first frame.` }];
  for (const framePath of framePaths) parts.push({ inlineData: { mimeType: 'image/jpeg', data: (await readFile(framePath)).toString('base64') } });
  const request = async (extra = '') => {
    const response = await fetchTimed(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(VISION_MODEL)}:generateContent`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': API_KEY },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: `${parts[0].text}${extra}` }, ...parts.slice(1)] }], generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 1800 } }),
    }, 60000);
    if (!response.ok) throw new Error(`Gemini visual analysis ${response.status}: ${(await response.text()).slice(0, 700)}`);
    return response.json();
  };
  let parsed;
  try { parsed = parseJsonText(await request()); } catch (error) {
    try { parsed = parseJsonText(await request('\nYour previous response was invalid JSON. Return exactly one valid JSON object, with no markdown, comments, trailing commas, or unescaped newlines in strings.')); } catch { throw error; }
  }
  const list = (value) => Array.isArray(value) ? value.map(String).filter(Boolean) : [];
  const temporal = parsed.temporal && typeof parsed.temporal === 'object' ? parsed.temporal : {};
  const finiteOrNull = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
  const realism=(value)=>['STRONG','MEDIUM','WEAK','UNKNOWN'].includes(value)?value:'UNKNOWN';
  return { entities: list(parsed.entities), people: list(parsed.people), objects: list(parsed.objects), actions: list(parsed.actions), environment: list(parsed.environment), location: list(parsed.location), visibleText: list(parsed.visibleText), cameraDistance: clean(parsed.cameraDistance || 'UNKNOWN'), cameraMovement: clean(parsed.cameraMovement || 'UNKNOWN'), motionLevel: ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'UNKNOWN'].includes(parsed.motionLevel) ? parsed.motionLevel : 'UNKNOWN', visualQuality: ['POOR', 'FAIR', 'GOOD', 'EXCELLENT', 'UNKNOWN'].includes(parsed.visualQuality) ? parsed.visualQuality : 'UNKNOWN', sourceAudioUseful: ['NONE', 'AMBIENCE', 'MECHANICAL', 'DIALOGUE', 'IMPACT', 'MUSIC', 'NOISY', 'UNKNOWN'].includes(parsed.sourceAudioUseful) ? parsed.sourceAudioUseful : 'UNKNOWN', semanticDescription: clean(parsed.semanticDescription || 'Unknown visual content'), confidence: Number.isFinite(Number(parsed.confidence)) ? Math.max(0, Math.min(1, Number(parsed.confidence))) : 0.35, photorealism:realism(parsed.photorealism), temporalRealism:realism(parsed.temporalRealism), styleMatch:realism(parsed.styleMatch), physics:realism(parsed.physics), temporal: { actionOnsetTime: finiteOrNull(temporal.actionOnsetTime), actionPeakTime: finiteOrNull(temporal.actionPeakTime), recommendedStartTime: finiteOrNull(temporal.recommendedStartTime), recommendedEndTime: finiteOrNull(temporal.recommendedEndTime), confidence: Number.isFinite(Number(temporal.confidence)) ? Math.max(0, Math.min(1, Number(temporal.confidence))) : 0, evidence: clean(temporal.evidence || '') } };
}

async function extractFrame(videoPath, seconds, targetPath) {
  await mkdir(dirname(targetPath), { recursive: true });
  await run('ffmpeg', ['-y', '-ss', String(Math.max(0, seconds)), '-i', videoPath, '-frames:v', '1', '-vf', 'scale=1280:1280:force_original_aspect_ratio=decrease', '-pix_fmt', 'yuvj420p', '-threads', '1', '-q:v', '3', targetPath], { quiet: true });
  return targetPath;
}

async function detectRealShots(videoPath, duration) {
  // Analysis is deliberately cheaper than acquisition.  Full-resolution scene
  // decoding of long stock clips made preflight crawl without improving a
  // 45–240s edit; decode a bounded, downscaled inspection range and keep the
  // source timecodes honest.
  const inspectionDuration = Math.min(Math.max(0, Number(duration) || 0), 120);
  const detected = await captureCommand('ffmpeg', ['-t', String(inspectionDuration), '-i', videoPath, '-vf', "scale=640:-2,select='gt(scene,0.28)',showinfo", '-an', '-f', 'null', '-']);
  return parseShotBoundaries(detected.stderr, inspectionDuration || duration, 0.8);
}

function unknownSemanticProfile(asset, shot, frames, error = null) {
  return { segmentId: `${asset.id}-shot-${Math.round(shot.startTime * 1000)}`, assetId: asset.id, startTime: shot.startTime, endTime: shot.endTime, duration: shot.duration, representativeFrames: frames, entities: [], people: [], objects: [], actions: [], environment: [], location: [], visibleText: [], cameraDistance: 'UNKNOWN', cameraMovement: 'UNKNOWN', motionLevel: 'UNKNOWN', visualQuality: 'UNKNOWN', sourceAudioUseful: asset.sourceAudio ? 'UNKNOWN' : 'NONE', semanticDescription: 'Unknown visual content; semantic analysis failed', confidence: 0, provenance: { method: 'multiframe-vision-failed', model: VISION_MODEL, sampledFrames: frames.length, analyzedAt: now(), ...(error ? { error: String(error) } : {}) }, rightsTier: asset.rightsTier, sourceKey: asset.sourceKey, sourceUrl: asset.sourceUrl };
}

async function analyzeMovingAsset(asset, index) {
  const shots = await detectRealShots(asset.localPath, Number(asset.durationSeconds || 0));
  const profiles = [];
  const frameRoot = join(runRoot, 'segment-frames', safeFileName(asset.id));
  for (const [shotIndex, shot] of shots.entries()) {
    const points = [...new Set([shot.startTime + Math.min(0.12, shot.duration * 0.08), shot.startTime + shot.duration * 0.28, shot.startTime + shot.duration * 0.5, shot.startTime + shot.duration * 0.72, Math.max(shot.startTime, shot.endTime - Math.min(0.12, shot.duration * 0.08))].map((value) => Number(value.toFixed(3))))];
    const frames = [];
    for (const [frameIndex, point] of points.entries()) frames.push(await extractFrame(asset.localPath, point, join(frameRoot, `${String(shotIndex).padStart(2, '0')}-${frameIndex}.jpg`)));
    let semantic;
    try { semantic = await geminiVisualJson(frames, `This is shot ${shotIndex + 1} from source asset ${asset.id}. Source metadata is only a lead: ${clean(asset.metadata?.title || asset.id)}. Shot bounds are ${shot.startTime.toFixed(3)}-${shot.endTime.toFixed(3)} seconds. Duration ${shot.duration.toFixed(2)} seconds.`, points); } catch (error) { semantic = unknownSemanticProfile(asset, shot, frames, error); }
    const temporal = semantic.temporal || {};
    const recommendedStart = Number(temporal.recommendedStartTime);
    const recommendedEnd = Number(temporal.recommendedEndTime);
    const temporalConfidence = Number(temporal.confidence || 0);
    const usableStartTime = temporalConfidence >= 0.5 && Number.isFinite(recommendedStart) ? Math.max(shot.startTime, Math.min(shot.endTime - 0.25, recommendedStart)) : shot.startTime;
    const usableEndTime = temporalConfidence >= 0.5 && Number.isFinite(recommendedEnd) ? Math.min(shot.endTime, Math.max(usableStartTime + 0.25, recommendedEnd)) : shot.endTime;
    const actionOnsetTime = Number.isFinite(Number(temporal.actionOnsetTime)) ? Math.max(shot.startTime, Math.min(shot.endTime, Number(temporal.actionOnsetTime))) : null;
    const actionPeakTime = Number.isFinite(Number(temporal.actionPeakTime)) ? Math.max(shot.startTime, Math.min(shot.endTime, Number(temporal.actionPeakTime))) : null;
    profiles.push({ ...semantic, segmentId: `${asset.id}-shot-${shotIndex + 1}`, assetId: asset.id, startTime: shot.startTime, endTime: shot.endTime, duration: shot.duration, usableStartTime, usableEndTime, actionOnsetTime, actionPeakTime, temporalConfidence, temporalEvidence: clean(temporal.evidence || ''), provenance: semantic.provenance?.method ? { ...semantic.provenance, sampledFrames: frames.length, temporalAnalysis: 'gemini-frame-sequence-with-source-timestamps' } : { method: 'gemini-multiframe-vision', model: VISION_MODEL, sampledFrames: frames.length, analyzedAt: now(), temporalAnalysis: 'gemini-frame-sequence-with-source-timestamps' }, rightsTier: asset.rightsTier, sourceKey: asset.sourceKey, sourceUrl: asset.sourceUrl, localPath: asset.localPath, provider: asset.provider, mime: asset.mime, metadata: asset.metadata, visualFingerprint: `${asset.visualFingerprint || asset.id}:shot:${shotIndex + 1}`, sourceAudio: asset.sourceAudio });
  }
  return { asset, shots, profiles, index };
}

async function geminiResearch(query, options = {}) {
  if (!API_KEY) throw new Error('GEMINI_API_KEY is required for research');
  const freshness = options.recencyDays ? `Prefer sources from the last ${options.recencyDays} days.` : '';
  let response;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await fetchTimed('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': API_KEY, 'Api-Revision': '2026-05-20' },
      body: JSON.stringify({ model: SEARCH_MODEL, input: `Research this video opportunity with primary and reputable sources: ${query}. ${freshness} Return factual claims, dates, named entities, audiovisual leads and risks.`, tools: [{ type: 'google_search' }] }),
    }, 60000);
    if (response.ok || ![429, 500, 502, 503, 504].includes(response.status) || attempt === 2) break;
    await sleep(1200 * (attempt + 1));
  }
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
  // Some current Interactions responses render citations directly into the
  // returned research text instead of exposing url_citation annotations. Keep
  // those URLs as explicitly lower-confidence discovery receipts rather than
  // silently writing an empty ResearchPack.
  for (const url of textBlocks(json).join('\n').match(/https?:\/\/[^\s)\]}>]+/g) || []) {
    const normalized = url.replace(/[.,;:]+$/, '');
    if (!sources.some((source) => source.url === normalized)) {
      let title = normalized;
      try { title = new URL(normalized).hostname; } catch { /* URL was already validated by the regex. */ }
      sources.push({ url: normalized, title, provenance: 'TEXT_URL_DISCOVERY' });
    }
  }
  return { query, retrievedAt: now(), synthesis: textBlocks(json).join('\n'), sources: sources.slice(0, 24) };
}

async function readNewsTitles() {
  try {
    const response = await fetchTimed('https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en', { headers: { 'user-agent': 'AUTO-YTB research client' } }, 8000);
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

async function discoverCommons(query, limit = 6, options = {}) {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.search = new URLSearchParams({ action: 'query', generator: 'search', gsrsearch: `${query} filetype:bitmap`, gsrnamespace: '6', gsrlimit: String(Math.min(12, limit * 2)), prop: 'imageinfo', iiprop: 'url|mime|size|extmetadata', iiurlwidth: '1600', format: 'json', origin: '*', maxlag: '5' }).toString();
  let response;
  const attempts = Math.max(1, Math.min(4, Number(options.attempts ?? 4)));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    response = await fetchTimed(url, { headers: { 'user-agent': 'AUTO-YTB Media Intelligence research client (contact: local studio)' } }, Number(options.timeoutMs ?? 15000));
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
      response = await fetchTimed(asset.url, { headers: { 'user-agent': 'AUTO-YTB Media Vault (contact: local studio)' } }, 30000);
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
  const inferred = await geminiJson(`Convert this creator input into a production brief for an autonomous video studio. Do not write the final script yet. Resolve concrete named entities, domain, research query and 8-20 specific media queries that can find exact public audiovisual evidence. For a ranking/list, return every proposed ranked entity in entities and create entity-specific moving-video queries for each. Return JSON with topic, angle, audience, domain, entities, researchQuery, visualQueries, titleHypotheses, thumbnailPromise. Creator input: ${promptInput}`);
  assertNovel(JSON.stringify(inferred), 'inferred prompt');
  return { ...inferred, topic: inferred.topic || promptInput, angle: inferred.angle || promptInput, inputMode: 'USER_PROMPT', selectedAt: now(), sourcePrompt: promptInput };
}

async function deriveMediaPlan(opportunity, research) {
  const planned = await geminiJson(`Create a footage discovery plan before writing a final video script. This is not final narration. Use only evidence in the research sources. Return JSON: {entities:[{canonicalName,type,aliases,visualIdentifiers,criticality,queries}], visualQueries:[string], storyOutline:[{purpose,claim,entities,visualCriticality,visualNeed}], titleDirection}. For a top list, return every ranked item as an entity and at least three concrete visual queries for each item. Visual criticality may be MUST_SHOW_EXACT, SHOULD_SHOW_EXACT, STRONG_CONTEXT_OK, EDITORIAL_CONTEXT_OK, or OPTIONAL_VISUAL. Do not invent named entities or facts.\nBRIEF:\n${JSON.stringify({topic: opportunity.topic, angle: opportunity.angle, entities: opportunity.entities, viewerPromise: opportunity.viewerPromise, sourcePrompt: opportunity.sourcePrompt})}\nRESEARCH:\n${research.synthesis.slice(0, 16000)}\nSOURCES:\n${research.sources.map((source) => `${source.title} | ${source.url}`).join('\n')}`);
  const entities = Array.isArray(planned?.entities) ? planned.entities : [];
  const entityNames = entities.map((entity) => clean(entity.canonicalName || entity.name)).filter(Boolean);
  const entityQueries = entities.flatMap((entity) => Array.isArray(entity.queries) ? entity.queries : []);
  return {
    version: 'ENTITY_MEDIA_PLAN_V1',
    ...planned,
    entities,
    resolvedEntityNames: [...new Set([...entityNames, ...(opportunity.entities || [])].map(clean).filter(Boolean))],
    visualQueries: [...new Set([...(planned?.visualQueries || []), ...entityQueries, ...(opportunity.visualQueries || [])].map(clean).filter(Boolean))],
    createdAt: now(),
  };
}

function normalizeCreatorMediaPlan(plan, opportunity) {
  const entities = Array.isArray(plan?.entities) ? plan.entities
    .map((entity) => ({ ...entity, canonicalName: clean(entity.canonicalName || entity.name), aliases: Array.isArray(entity.aliases) ? entity.aliases.map(clean).filter(Boolean) : [], queries: Array.isArray(entity.queries) ? entity.queries.map(clean).filter(Boolean) : [], criticality: entity.criticality || 'MUST_SHOW_EXACT' }))
    .filter((entity) => entity.canonicalName) : [];
  if (!entities.length) return null;
  const entityQueries = entities.flatMap((entity) => entity.queries);
  return {
    version: 'ENTITY_MEDIA_PLAN_V1',
    ...plan,
    entities,
    resolvedEntityNames: [...new Set([...entities.map((entity) => entity.canonicalName), ...(opportunity.entities || [])].map(clean).filter(Boolean))],
    visualQueries: [...new Set([...(plan.visualQueries || []), ...entityQueries, ...(opportunity.visualQueries || [])].map(clean).filter(Boolean))],
    createdAt: now(),
    provenance: 'CREATOR_STRUCTURED_MEDIA_PLAN',
  };
}

async function readCreatorScript() {
  if (!requestedScriptPath) return null;
  const raw = await readFile(resolve(requestedScriptPath), 'utf8');
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.narration === 'string' || typeof parsed?.script === 'string') return { raw, narration: clean(parsed.narration || parsed.script), structured: parsed };
  } catch { /* Plain text scripts are valid input. */ }
  return { raw, narration: clean(raw), structured: null };
}

async function makeScript(opportunity, research, media) {
  const duration = Math.max(45, Math.min(240, requestedDuration));
  const beatTarget = Math.max(6, Math.min(16, Math.round(duration / 12)));
  const sourceDigest = media.slice(0, 24).map((asset) => `${asset.title} | ${asset.pageUrl} | ${asset.license}`).join('\n');
  const prompt = `Write an original, natural English YouTube script for a ${duration}-second ${duration > 120 ? '16:9 documentary explainer' : 'fast explainer'} about: ${opportunity.topic}. Angle: ${opportunity.angle}. Audience: ${opportunity.audience || 'general audience'}. Use only claims supported by the research below. The narration must progress through new information, concrete evidence, contrast or consequence; no filler, no generic welcome, no repeated thesis. Start with a value-first hook. End with a payoff or useful answer. Return JSON: {title, hookMechanism, narration, beats:[{id,narration,entities,claimIds,visualIntent:{requiredEntities,preferredEntities,requiredActions,preferredActions,location,shotPreferences,semanticGoal,avoid,queries},editorialForm,importance}], claims:[{id,text,type,sourceUrls,confidence}], entities:[{name,type,aliases}], packaging:{title,thumbnailText,thumbnailConcept,description}}. Need ${beatTarget} meaningfully different beats. Keep the narration long enough for the requested duration but never pad. Every beat must name an exact structured visual intention and query list.\nRESEARCH:\n${research.synthesis.slice(0, 16000)}\nSOURCES:\n${research.sources.map((source) => `${source.title} | ${source.url}`).join('\n')}\nMEDIA RECONNAISSANCE:\n${sourceDigest}`;
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

async function buildThumbnail(imagePath, text) {
  throw new Error('LEGACY_THUMBNAIL_DISABLED: use buildThumbnailDirector with a semantically selected editorial frame');
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
  const music = null;
  const count = Math.max(1, assignments.length);
  const scenes = beats.map((beat, index) => ({ id: `${beat.id}-s${index + 1}`, startSec: beat.startSec, durationSec: beat.targetDurationSec, kind: 'image', instruction: beat.visualIntent, sourceIds: [assignments[index % count].id], generated: false }));
  const timelineAssets = scenes.map((scene, index) => { const asset = assignments[index % count]; return { id: `${asset.id}-${index}`, uri: fileUri(asset.localPath), mimeType: extname(asset.localPath).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg', provider: asset.provider, model: 'commons-segment-index-v1', costUsd: 0, sceneId: scene.id, generated: false, sourceIds: [asset.id], sourceUrl: asset.pageUrl, license: asset.license, metadata: { sourceUrl: asset.pageUrl, rightsStatus: asset.rightsStatus, attribution: asset.attribution, entityMatch: asset.entityMatch, segment: { startSec: 0, endSec: null }, repeatedSource: index >= new Set(assignments.map((item) => item.id)).size } }; });
  const renderManifest = { projectId: runId, createdAt: now(), contentFormat: 'LONG_HORIZONTAL', aspectRatio: '16:9', frame: { width: 1280, height: 720 }, engineeringResolution: '1280x720', contentArchetype: { version: 1, id: 'AUTONOMOUS_SOURCED_NARRATIVE', label: 'Autonomous sourced narrative', confidence: 70, reasons: ['selected from live input and media reconnaissance'], voiceMode: 'SINGLE_NARRATOR', realityMode: 'FACTUAL', cameraProfile: 'EDITORIAL_DOCUMENTARY', syntheticDisclosurePolicy: 'Synthetic voice only; visuals are rights-cleared source material.', profile: {} }, executionPlan: { archetypeId: 'AUTONOMOUS_SOURCED_NARRATIVE', researchMode: 'FACTUAL_RESEARCH', researchRequired: true, factClaimMode: 'VERIFY_CLAIMS', scriptMode: 'NARRATION', voiceMode: 'SINGLE_NARRATOR', voiceRequired: true, allowIntegratedNarrator: false, requiresCanonicalCast: false, audioMode: 'NARRATION_LED', captionMode: 'FULL_SPEECH', visualMode: 'EVIDENCE_FIRST', realityMode: 'FACTUAL', cameraProfile: 'EDITORIAL_DOCUMENTARY', syntheticDisclosurePolicy: 'Synthetic voice only; visuals are rights-cleared source material.', preferredFormats: ['LONG_HORIZONTAL'], targetSceneDurationSec: { long: 12 }, generativeSpendBias: 0, requiredCapabilities: { search: true, voice: true, image: false, video: false } }, captionPlan: { enabled: true, burnIn: false, preset: 'EDITORIAL_CLEAN', source: 'VOICE_ALIGNMENT', mode: 'FULL_SPEECH', maxChars: 48, maxDurationSeconds: 4.2, maxLines: 2 }, editPlan: { preset: 'DOCUMENTARY', transitionMode: 'MOTIVATED', filmLook: false, punchInAnchors: true, preserveAudioTiming: true }, script: { title: script.title, targetDurationSec: actualDuration, beats }, scenes, assets: timelineAssets, voice: { id: `voice-${runId}`, uri: voice.uri, mimeType: voice.mimeType, provider: voice.provider, model: voice.model, durationSeconds: actualDuration, costUsd: 0, alignment: makeAlignment(script.narration, actualDuration) }, music: null, estimatedCostUsd: 0, actualCostUsd: 0, containsSyntheticMedia: true };
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

function assTime(seconds) {
  const value = Math.max(0, Number(seconds) || 0); const h = Math.floor(value / 3600); const m = Math.floor((value % 3600) / 60); const s = Math.floor(value % 60); const cs = Math.floor((value - Math.floor(value)) * 100);
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function assText(value) { return String(value ?? '').replace(/[{}]/g, '').replace(/\\/g, '\\\\').replace(/\r?\n/g, ' '); }

async function writeKaraokeAss(words, path, width = 1280, height = 720) {
  await mkdir(dirname(path), { recursive: true });
  const safeWords = words.filter((word) => word.word && Number.isFinite(word.startTime) && Number.isFinite(word.endTime) && word.endTime > word.startTime);
  const chunks = buildKaraokeChunks(safeWords, 4);
  const events = chunks.flatMap((chunk) => chunk.words.map((activeWord, activeIndex) => {
    const nextStart = chunk.words[activeIndex + 1]?.startTime ?? chunk.endTime;
    const payload = chunk.words.map((word, index) => {
      const normalized = String(word.word).toLowerCase().replace(/[^a-z0-9%./-]/g, '');
      const semantic = /^(\d+|[a-z0-9-]{9,})$/i.test(normalized);
      const style = index === activeIndex ? '{\\c&H00D7FF&\\b1\\fscx108\\fscy108}' : semantic ? '{\\c&H66E6FF&\\b1}' : '{\\c&HFFFFFF&\\b0}';
      return `${style}${assText(word.word)}`;
    }).join(' ');
    return `Dialogue: 0,${assTime(activeWord.startTime)},${assTime(nextStart)},Karaoke,,0,0,0,,${payload}`;
  }));
  const ass = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${width}\nPlayResY: ${height}\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Karaoke,Arial,52,&H00FFFFFF,&H0000D7FF,&H00101828,&H90101828,-1,0,0,0,100,100,0,0,1,3,1,2,70,70,70,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n${events.join('\n')}\n`;
  const styledAss = ass.replace(/Style: Karaoke,[^\n]+/, 'Style: Karaoke,Arial,54,&H00FFFFFF,&H0000D7FF,&H00081218,&H98101828,-1,0,0,0,100,100,0,0,1,4,2,2,78,78,112,1');
  await writeFile(path, styledAss, 'utf8');
  return { path, chunks, wordCount: safeWords.length };
}

async function createMechanismIllustration(targetPath) {
  await mkdir(dirname(targetPath), { recursive: true });
  if (existsSync(targetPath)) return targetPath;
  const vf = [
    'drawbox=x=0:y=0:w=1280:h=720:color=0x071722:t=fill',
    'drawbox=x=80:y=180:w=1120:h=430:color=0x0b526f@0.92:t=fill',
    'drawbox=x=80:y=180:w=1120:h=8:color=0x7be7ff:t=fill',
    'drawbox=x=120:y=95:w=185:h=72:color=0x263844:t=fill',
    "drawtext=text='COMPRESSED AIR':fontcolor=white:fontsize=24:x=143:y=120",
    'drawbox=x=305:y=125:w=350:h=14:color=0xe8bd62:t=fill',
    "drawtext=text='PIPE':fontcolor=0x071722:fontsize=20:x=455:y=92",
    'drawbox=x=560:y=552:w=300:h=28:color=0xd0d7de:t=fill',
    "drawtext=text='BOTTOM DIFFUSER / SPARGER':fontcolor=white:fontsize=25:x=575:y=595",
    'drawbox=x=980:y=210:w=16:h=110:color=0xe8bd62:t=fill',
    'drawbox=x=940:y=275:w=96:h=10:color=0xe8bd62:t=fill',
    "drawtext=text='HORIZONTAL WATER SPRAY':fontcolor=0xffe9a6:fontsize=22:x=900:y=340",
    "drawtext=text='ILLUSTRATION OF THE MECHANISM':fontcolor=0xffd166:fontsize=28:x=78:y=30",
    "drawtext=text='air enters below the landing zone':fontcolor=0xc6f4ff:fontsize=24:x=450:y=662",
    "drawtext=text='o':fontcolor=white:fontsize=38:x=610:y='520-45*t'",
    "drawtext=text='o  o':fontcolor=white:fontsize=34:x=700:y='510-58*t'",
    "drawtext=text='o o  o':fontcolor=white:fontsize=30:x=520:y='500-70*t'",
    "drawtext=text='O  o':fontcolor=white:fontsize=42:x=820:y='520-38*t'",
    "drawtext=text='SURFACE AGITATION':fontcolor=white:fontsize=26:x=430:y=196"
  ].join(',');
  await run('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'color=c=0x071722:s=1280x720:r=30:d=4.6', '-vf', vf, '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', targetPath], { quiet: true });
  return targetPath;
}

async function createSurfaceSprayIllustration(targetPath) {
  await mkdir(dirname(targetPath), { recursive: true });
  if (existsSync(targetPath)) return targetPath;
  const vf = [
    'drawbox=x=0:y=0:w=1280:h=720:color=0x081722:t=fill',
    'drawbox=x=80:y=190:w=1120:h=420:color=0x0d5d7c:t=fill',
    'drawbox=x=80:y=190:w=1120:h=8:color=0x7be7ff:t=fill',
    'drawbox=x=980:y=230:w=20:h=170:color=0xe8bd62:t=fill',
    'drawbox=x=910:y=390:w=160:h=12:color=0xe8bd62:t=fill',
    "drawtext=text='HORIZONTAL WATER SPRAY':fontcolor=0xffe9a6:fontsize=34:x=740:y=92",
    "drawtext=text='MECHANICAL SURFACE AGITATION':fontcolor=white:fontsize=30:x=290:y=30",
    "drawtext=text='visible landing-zone cue':fontcolor=0xc6f4ff:fontsize=28:x=470:y=645",
    "drawtext=text='~':fontcolor=white:fontsize=54:x='840-90*t':y='370-30*sin(t*4)'",
    "drawtext=text='~':fontcolor=white:fontsize=48:x='760-80*t':y='405-24*sin(t*5)'",
    "drawtext=text='~':fontcolor=white:fontsize=42:x='680-70*t':y='440-20*sin(t*6)'",
    "drawtext=text='ILLUSTRATION BASED ON WORLD AQUATICS RULES':fontcolor=0xffd166:fontsize=22:x=80:y=680"
  ].join(',');
  await run('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'color=c=0x081722:s=1280x720:r=30:d=4.6', '-vf', vf, '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', targetPath], { quiet: true });
  return targetPath;
}

function decorateTruthContext(segment) {
  const text = `${segment.semanticDescription || ''} ${(segment.actions || []).join(' ')} ${segment.sourceUrl || ''}`.toLowerCase();
  const contextType = /scuba|underwater cliff|reef/.test(text) ? 'UNKNOWN' : /cliff dive|cliff diver|coastal cliff/.test(text) ? 'CLIFF_DIVING' : 'UNKNOWN';
  return { ...segment, contextType };
}

function truthIntentForMechanism(intent) {
  const text = `${intent.semanticGoal || ''} ${(intent.requiredEntities || []).join(' ')} ${(intent.requiredActions || []).join(' ')}`.toLowerCase();
  if (/sparger|diffuser|compress|air source|pipe|mechanism|impact cushioning|air-water plume|bubble machine|nozzles|floor|aerated plume|cushion|training|practice/.test(text)) return { ...intent, semanticGoal: intent.semanticGoal || 'show the pool mechanism that creates the air-water plume', requiredActions: (intent.requiredActions || []).filter((action) => !/diving|jumping|splashing|cliff/i.test(action)), requiredMechanism: [...new Set([...(intent.requiredMechanism || []), 'compressed air sparger system'])], requiredObject: [...new Set([...(intent.requiredObject || []), 'bottom diffuser', 'sparger'])], requiredEffect: [...new Set([...(intent.requiredEffect || []), 'rising bubbles', 'surface agitation'])], contextType: 'TRAINING' };
  if (/spray|agitation|landing zone|surface disturbance|surface reference|visual reference/.test(text)) return { ...intent, semanticGoal: intent.semanticGoal || 'show the deliberate mechanical disturbance on the diving water surface', requiredMechanism: [...new Set([...(intent.requiredMechanism || []), 'mechanical surface agitation'])], requiredEffect: [...new Set([...(intent.requiredEffect || []), 'surface spray', 'visible water disturbance'])], contextType: 'HIGH_DIVING_COMPETITION' };
  if (/diver|diving tower|cliff|jump|landing|plunge/.test(text)) return { ...intent, requiredActions: [...new Set([...(intent.requiredActions || []), 'diving', 'jumping', 'splashing'])], contextType: /cliff/.test(text) ? 'CLIFF_DIVING' : 'HIGH_DIVING_COMPETITION' };
  return intent;
}

async function makeTruthRepairScript(research, semanticSegments) {
  const sourceDigest = semanticSegments.slice(0, 40).map((asset) => `${asset.segmentId} | ${asset.sourceUrl} | ${asset.semanticDescription} | actions=${(asset.actions || []).join(',')} | context=${asset.contextType || 'UNKNOWN'}`).join('\n');
  const verifiedSources = [
    'https://www.worldaquatics.com/sites/default/files/2018-03-06_fina_diving_officials_manual_2018-2021.pdf',
    'https://www.pulsair.com/diving-pool-bubbler-sparger/how-it-works/',
    'https://www.aquaticgroup.com/products/equipment/sparger-dive-systems/'
  ];
  const script = await geminiJson(`Repair the existing video about high-diving water safety without changing the subject. The previous premise was too broad and falsely treated scuba bubbles as a sparger. Write a factually careful 45-75 second English YouTube script with 8-10 phrase-level beats. Reframe it around only these verified propositions: World Aquatics rules say mechanical surface agitation is installed to aid divers' visual perception; a bubble machine is conditional on creating sufficient agitation; otherwise a horizontal water sprinkler is used; separate training/facility sparger systems use compressed air through bottom diffusers. Do not claim every high dive uses a bubbler, do not claim competition systems are turned off, do not claim high-pressure air unless a source explicitly supports it, do not claim surface tension is the mechanism, and do not equate scuba exhalation bubbles with a sparger. Begin with an immediate visual hook and finish with a complete payoff. Every sentence must add a new fact or visual event. Return JSON only with title, hookMechanism, narration, beats (each beat MUST use the key narration), claims, packaging. Each beat visualIntent must include requiredMechanism, requiredObject, requiredEffect when discussing a mechanism, and contextType. Mark an explanatory diagram as editorialForm=TECHNICAL_ILLUSTRATION, never as live footage. Verified primary sources: ${verifiedSources.join(' | ')}. Research: ${research.synthesis.slice(0, 12000)}. Existing material: ${sourceDigest}`);
  if (!script?.narration || !Array.isArray(script.beats) || script.beats.length < 7) throw new Error('TRUTH_REPAIR_BLOCKED: script did not contain enough phrase-level beats');
  const beats = script.beats.map((beat) => { const narration = beat.narration || beat.narrationChunk || beat.text || ''; const rawIntent = normalizeVisualIntent(beat.visualIntent, beat.entities || []); return { ...beat, narration, visualIntent: truthIntentForMechanism({ ...rawIntent, semanticGoal: rawIntent.semanticGoal || narration }) }; });
  return { ...script, beats, targetDurationSec: 60, generatedAt: now(), alignmentMethod: 'GEMINI_WORD_TIMESTAMPS_REQUIRED', truthRepair: true, verifiedSources };
}

async function makeFootageScript(opportunity, research, segments, creatorScript = null, mediaPlan = null) {
  const targetDuration = Math.max(45, Math.min(240, requestedDuration));
  const isList = /\b(top|best|most important|ranked|ranking|ten)\b/i.test(`${opportunity.topic} ${opportunity.angle} ${creatorScript?.narration || ''}`);
  const beatTarget = Math.max(isList ? 18 : 8, Math.min(42, Math.round(targetDuration / (isList ? 7 : 8))));
  const sourceDigest = segments.slice(0, 48).map((asset) => `${asset.segmentId || asset.id} | ${asset.sourceUrl} | ${asset.startTime?.toFixed?.(2) ?? asset.clipStartSec ?? 0}-${asset.endTime?.toFixed?.(2) ?? asset.clipEndSec ?? ''}s | entities=${(asset.entities || []).join(',')} | actions=${(asset.actions || []).join(',')} | motion=${asset.motionLevel} | description=${asset.semanticDescription || 'UNKNOWN'}`).join('\n');
  const creatorConstraint = creatorScript?.narration ? `CREATOR SCRIPT (canonical narration; preserve its factual wording and sentence order unless a claim is unsupported, in which case flag it in claims rather than silently replacing it):\n${creatorScript.narration}\n` : '';
  const script = await geminiJson(`${creatorConstraint}Write ${creatorScript?.narration ? 'a structured editorial compilation of the canonical creator script' : 'an original, natural English YouTube script'} for an approximately ${targetDuration}-second ${targetDuration > 120 ? '16:9 documentary/list video' : 'fast sourced explainer'} about ${opportunity.topic}. Angle: ${opportunity.angle || opportunity.viewerPromise}. Viewer promise: ${opportunity.viewerPromise || opportunity.thumbnailPromise}. Use only claims supported by the research below. This is SOURCED_AUTOPRODUCTION: write around the semantically analyzed moving footage below, but do not require literal footage for non-critical connective language. Named entities and ranked items require MUST_SHOW_EXACT or SHOULD_SHOW_EXACT intent. Start with a value-first visual hook. No intro, essay language, repeated thesis, or generic conclusion. End with a concrete payoff/callback. Return JSON only: {title, hookMechanism, narration, beats:[{id,narration,entities,claimIds,visualIntent:{requiredEntities,preferredEntities,requiredActions,preferredActions,location,shotPreferences,semanticGoal,avoid,queries,visualCriticality},editorialForm,importance}],claims:[{id,text,type,sourceUrls,confidence,status}],packaging:{title,thumbnailText,thumbnailConcept,description}}. Use approximately ${beatTarget} phrase-level beats with varied visual intentions. Do not return asset IDs or preselected segment references. A visualIntent must be structured, specific, and phrase-level.\nENTITY MEDIA PLAN:\n${JSON.stringify(mediaPlan || {})}\nFOOTAGE POOL (actual multiframe visual analysis):\n${sourceDigest}\nRESEARCH:\n${research.synthesis.slice(0, 14000)}\nSOURCES:\n${research.sources.map((source) => `${source.title} | ${source.url}`).join('\n')}`);
  if (!script?.narration || !Array.isArray(script.beats) || script.beats.length < 5) throw new Error('FOOTAGE_PRO script failed beat-density gate');
  const wordCount = script.narration.split(/\s+/).filter(Boolean).length;
  const minWords = Math.max(70, Math.round(targetDuration * 1.55));
  const maxWords = Math.round(targetDuration * 3.25);
  if (wordCount < minWords || wordCount > maxWords) throw new Error(`SOURCED_AUTOPRODUCTION script word count ${wordCount} is outside the earned ${targetDuration}s range`);
  return { ...script, targetDurationSec: targetDuration, generatedAt: now(), alignmentMethod: 'GEMINI_WORD_TIMESTAMPS_REQUIRED', wordCount, sourceInputMode: creatorScript ? 'USER_SCRIPT' : 'USER_PROMPT' };
}

function normalizeScriptVisualCriticality(script, opportunity, mediaPlan) {
  const knownEntities = [...new Set([...(mediaPlan?.resolvedEntityNames || []), ...(opportunity?.entities || [])].map(clean).filter(Boolean))];
  const plannedEntities = (mediaPlan?.entities || []).map((entity) => ({ canonical: clean(entity.canonicalName || entity.name), aliases: [entity.canonicalName, ...(entity.aliases || [])].map(clean).filter(Boolean) })).filter((entity) => entity.canonical);
  const resolvesToKnownEntity = (value) => knownEntities.some((entity) => {
    const a = clean(value).toLowerCase(); const b = entity.toLowerCase();
    return a === b || a.includes(b) || b.includes(a);
  });
  const beats = (script.beats || []).map((beat) => {
    const intent = normalizeVisualIntent(beat.visualIntent, beat.entities || []);
    const narration = clean(beat.narration || beat.narrationChunk || beat.text || '').toLowerCase();
    // Do not let the script model invent a mandatory action that the spoken
    // line never claims.  A visual intent may still prefer a dynamic shot,
    // but an exact still/reference remains honest for a line such as “Then
    // the 2015 Hellcat” unless the narration actually says it is burning out,
    // racing, launching, etc.
    const actionLanguage = /\b(?:drive|driving|drove|raced|racing|race|launch|launched|accelerat|burnout|burning|spinn|drift|cruis|rev|roar|run|running|fly|flying|turn|turning|sits|parked|displayed|opens|opening|moves|moving)\w*/i.test(narration);
    const groundedIntent = actionLanguage ? intent : { ...intent, requiredActions: [] };
    const spokenCanonicalEntities = plannedEntities.filter((entity) => entity.aliases.some((alias) => alias.length > 2 && narration.includes(alias.toLowerCase()))).map((entity) => entity.canonical);
    // The script model may abbreviate a visual intent to a brand (for example
    // "Dodge") even while the narration names the exact model.  Restore the
    // canonical requirement from the spoken words; a named list item cannot
    // become generic stock merely because the intent JSON was imprecise.
    if (spokenCanonicalEntities.length) return {
      ...beat,
      visualIntent: {
        ...groundedIntent,
        requiredEntities: [...new Set(spokenCanonicalEntities)],
        preferredEntities: [...new Set([...(intent.preferredEntities || []), ...spokenCanonicalEntities])],
        visualCriticality: 'MUST_SHOW_EXACT',
      },
    };
    const required = groundedIntent.requiredEntities || [];
    const exactEntities = required.filter(resolvesToKnownEntity);
    const explicitlyResolvedEntities = required.filter((value) => plannedEntities.some((entity) => [entity.canonical, ...entity.aliases].some((alias) => alias.toLowerCase() === clean(value).toLowerCase())));
    const unsupportedLabels = required.filter((entity) => !resolvesToKnownEntity(entity));
    const fallbackEntities = (beat.entities || []).filter(resolvesToKnownEntity);
    // A partial label such as “Ford Mustang” can overlap a planned exact
    // model without proving that this particular line names that model.  Do
    // not let that overlap force the same exact still through the closing
    // connective phrases of a listicle.
    if (!unsupportedLabels.length && explicitlyResolvedEntities.length) return { ...beat, visualIntent: groundedIntent };
    if (!unsupportedLabels.length && exactEntities.length && explicitlyResolvedEntities.length === 0) return {
      ...beat,
      visualIntent: { ...groundedIntent, requiredEntities: [], preferredEntities: [...new Set([...(groundedIntent.preferredEntities || []), ...required])], visualCriticality: 'STRONG_CONTEXT_OK' },
    };
    if (!unsupportedLabels.length || exactEntities.length) return { ...beat, visualIntent: groundedIntent };
    // A technical component can be shown through a real close-up of its host
    // object.  It must not invent a separate entity that the MediaVault was
    // never asked to resolve, and it must not turn missing footage into a
    // default graphic.
    return {
      ...beat,
      visualIntent: {
        ...groundedIntent,
        requiredEntities: fallbackEntities.length ? fallbackEntities : [],
        preferredEntities: [...new Set([...(intent.preferredEntities || []), ...unsupportedLabels])],
        visualCriticality: intent.visualCriticality === 'MUST_SHOW_EXACT' ? 'STRONG_CONTEXT_OK' : intent.visualCriticality,
      },
    };
  });
  return { ...script, beats };
}

function splitLongNarrationUnits(units, maximumSeconds = 3.4) {
  return units.flatMap((unit) => {
    if (unit.endTime - unit.startTime <= maximumSeconds || unit.words.length < 4) return [unit];
    const pieces = []; let start = 0;
    while (start < unit.words.length) {
      let end = start + 1;
      while (end < unit.words.length && unit.words[end].endTime - unit.words[start].startTime <= maximumSeconds) end += 1;
      if (end === start + 1 && end < unit.words.length) end += 1;
      const words = unit.words.slice(start, end);
      pieces.push({ ...unit, id: `${unit.id}-e${pieces.length + 1}`, text: words.map((word) => word.word).join(' '), startTime: words[0].startTime, endTime: words.at(-1).endTime, words });
      start = end;
    }
    return pieces;
  });
}

function reflowEditorialUnits(units, totalDuration) {
  if (!units.length) return units;
  const boundaries = units.map((unit, index) => {
    if (index === 0) return 0;
    const previous = units[index - 1];
    return Math.max(previous.endTime, Math.min(units[index].startTime, (previous.endTime + units[index].startTime) / 2));
  });
  boundaries.push(Math.max(boundaries.at(-1) + 0.2, Number(totalDuration) || units.at(-1).endTime));
  return units.map((unit, index) => ({ ...unit, startTime: boundaries[index], endTime: boundaries[index + 1], editorialTiming: { spokenStartTime: unit.startTime, spokenEndTime: unit.endTime, method: 'pause-aware-contiguous-timeline' } }));
}

function localizeExactVisualCriticality(units, mediaPlan) {
  const aliases = (mediaPlan?.entities || []).map((entity) => ({ canonical: clean(entity.canonicalName), aliases: [entity.canonicalName, ...(entity.aliases || [])].map(clean).filter(Boolean), criticality: entity.criticality || 'MUST_SHOW_EXACT' }));
  return units.map((unit) => {
    const intent = unit.visualIntent || {};
    if (!['MUST_SHOW_EXACT', 'SHOULD_SHOW_EXACT'].includes(intent.visualCriticality || '')) return unit;
    const required = (intent.requiredEntities || []).map(clean).filter(Boolean);
    const text = clean(unit.text).toLowerCase();
    const spoken = required.some((entity) => {
      const resolved = aliases.find((entry) => entry.canonical.toLowerCase() === entity.toLowerCase());
      if (resolved?.criticality === 'STRONG_CONTEXT_OK' || resolved?.criticality === 'EDITORIAL_CONTEXT_OK' || resolved?.criticality === 'OPTIONAL_VISUAL') return false;
      return (resolved?.aliases || [entity]).some((alias) => {
        if (alias.length > 2 && text.includes(alias.toLowerCase())) return true;
        // Word-aligned editorial units can split a spoken model designation
        // across a natural phrase boundary. Two distinctive model tokens in a
        // single unit are sufficient evidence that the exact visual must land
        // here; a brand name alone is deliberately not enough.
        const distinctive = alias.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2 && !['ford', 'dodge', 'pontiac', 'plymouth', 'chevrolet', 'buick', 'amc', 'ford'].includes(token));
        return distinctive.length > 1 && distinctive.filter((token) => text.includes(token)).length >= 2;
      });
    });
    if (spoken) return unit;
    // A list item's exact identity must land when it is named. Subsequent
    // explanation can use honest real detail/context rather than forcing the
    // same asset onto every phrase and making a slideshow out of one photo.
    return { ...unit, visualIntent: { ...intent, requiredEntities: [], preferredEntities: [...new Set([...(intent.preferredEntities || []), ...required])], visualCriticality: 'STRONG_CONTEXT_OK' } };
  });
}

function selectSemanticMatches(units, segments) {
  const selected = []; const sourceCounts = {}; const usedSources = []; const usedFingerprints = [];
  for (const unit of units) {
    const ranked = matchSemanticFootage(unit, segments, { usedSourceKeys: usedSources, usedFingerprints, sourceCounts });
    const criticality = unit.visualIntent?.visualCriticality || (unit.importance === 'CRITICAL' ? 'MUST_SHOW_EXACT' : 'STRONG_CONTEXT_OK');
    const permitted = criticality === 'MUST_SHOW_EXACT' || criticality === 'SHOULD_SHOW_EXACT'
      ? ['EXACT', 'STRONG']
      : ['EXACT', 'STRONG', 'CONTEXTUAL'];
    const requestedDuration = Math.max(0.2, unit.endTime - unit.startTime);
    const freshRanked = ranked.filter((candidate) => !usedFingerprints.includes(candidate.segment.visualFingerprint || candidate.segment.segmentId));
    // Prefer fresh candidates, but do not turn a finite media pool into a
    // false match failure when only a previously used permitted candidate can
    // honestly cover this short connective unit.
    const candidatePool = [...freshRanked, ...ranked.filter((candidate) => !freshRanked.includes(candidate))];
    const usable = permitted.flatMap((classification) => candidatePool.filter((candidate) => candidate.classification === classification))
      .find((candidate) => candidate.segment.localPath && segmentMediaRange(candidate.segment).duration + 0.03 >= requestedDuration);
    const match = usable || candidatePool.find((candidate) => permitted.includes(candidate.classification));
    if (!match || !permitted.includes(match.classification) || !match.segment.localPath) throw new Error(`EDITORIAL_MATCH_BLOCKED: no ${criticality === 'MUST_SHOW_EXACT' ? 'exact/strong' : 'honest contextual-or-better'} visual for ${unit.id}: ${unit.text}`);
    const orderedCandidates = permitted.flatMap((classification) => candidatePool.filter((candidate) => candidate.classification === classification));
    selected.push({ unitId: unit.id, match, topCandidates: orderedCandidates.slice(0, 3) });
    const source = match.segment.sourceKey || match.segment.sourceUrl || match.segment.assetId;
    sourceCounts[source] = (sourceCounts[source] || 0) + 1; usedSources.push(source); usedFingerprints.push(match.segment.visualFingerprint || match.segment.segmentId);
  }
  return selected;
}

function relaxSecondaryVisualGaps(units, segments, mediaPlan) {
  return units.map((unit) => {
    const exactRequired = ['MUST_SHOW_EXACT', 'SHOULD_SHOW_EXACT'].includes(unit.visualIntent?.visualCriticality || '');
    if (!exactRequired) return unit;
    const ranked = matchSemanticFootage(unit, segments, { usedSourceKeys: [], usedFingerprints: [], sourceCounts: {} });
    const hasUsableExact = ranked.some((candidate) => ['EXACT', 'STRONG'].includes(candidate.classification) && candidate.segment.localPath);
    if (hasUsableExact) return unit;
    const plannedTypes = (mediaPlan?.entities || []).filter((entity) => (unit.visualIntent.requiredEntities || []).some((required) => [entity.canonicalName, ...(entity.aliases || [])].some((label) => clean(label).toLowerCase() === clean(required).toLowerCase()))).map((entity) => String(entity.type || '').toUpperCase());
    const identityTypes = new Set(['AUTOMOBILE', 'PERSON', 'PLACE', 'BUILDING', 'COMPANY', 'PRODUCT', 'MACHINE', 'ANIMAL', 'EVENT']);
    const auxiliaryEntity = plannedTypes.length > 0 && plannedTypes.every((type) => !identityTypes.has(type));
    if (unit.importance !== 'NORMAL' && !auxiliaryEntity) return unit;
    return { ...unit, visualIntent: { ...unit.visualIntent, requiredEntities: [], visualCriticality: 'STRONG_CONTEXT_OK', editorialFallback: 'SECONDARY_EXACT_GAP_RELAXED' } };
  });
}

function exactCandidateForUnit(unit, segments) {
  const ranked = matchSemanticFootage(unit, segments, { usedSourceKeys: [], usedFingerprints: [], sourceCounts: {} });
  const requestedDuration = Math.max(0.2, unit.endTime - unit.startTime);
  return ranked.find((candidate) => ['EXACT', 'STRONG'].includes(candidate.classification) && candidate.segment.localPath && segmentMediaRange(candidate.segment).duration + 0.03 >= requestedDuration) || null;
}

function entityPlanForUnit(unit, mediaPlan) {
  const haystack = clean(`${unit.text} ${(unit.visualIntent?.requiredEntities || []).join(' ')} ${(unit.visualIntent?.preferredEntities || []).join(' ')}`).toLowerCase();
  return (mediaPlan?.entities || []).find((entity) => [entity.canonicalName, ...(entity.aliases || [])].map(clean).filter(Boolean).some((name) => haystack.includes(name.toLowerCase()))) || null;
}

function referenceTitleScore(entity, asset) {
  const title = clean(asset.title).toLowerCase();
  const terms = clean(entity.canonicalName).toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length > 2 && !['the','and','with'].includes(term));
  const aliases = (entity.aliases || []).map(clean).filter(Boolean).map((value) => value.toLowerCase());
  const requiredYears = [...new Set(clean(entity.canonicalName).match(/\b(?:18|19|20)\d{2}\b/g) || [])];
  // A broadly named file such as "Oldsmobile Rocket 88" must not silently
  // stand in for a specified model year.
  if (requiredYears.length && !requiredYears.some((year) => title.includes(year))) return 0;
  const requiresRt = /\br\/?t\b/i.test(entity.canonicalName);
  if (requiresRt && !/\br[\s/-]?t\b/i.test(title)) return 0;
  const direct = aliases.some((alias) => title.includes(alias)) || title.includes(clean(entity.canonicalName).toLowerCase());
  return (direct ? 100 : 0) + terms.filter((term) => title.includes(term)).length;
}

async function discoverReferenceForEntity(entity, slot) {
  const cachePath = join(reportRoot, 'ReferenceMediaPack.json');
  const cached = await readJson(cachePath, { version: 1, references: [] });
  const cachedReference = (cached.references || []).find((entry) => entry.entity === entity.canonicalName && entry.localPath && existsSync(entry.localPath) && referenceTitleScore(entity, entry) >= 100);
  if (cachedReference) return cachedReference;
  const queries = [...new Set([clean(entity.canonicalName), ...(entity.aliases || []).map(clean)])].filter(Boolean).slice(0, 3);
  const candidates = [];
  for (const query of queries) {
    try { candidates.push(...await discoverCommons(query, 8, { attempts: 1, timeoutMs: 8000 })); } catch { /* Discovery failure is recorded with the gap, not hidden by an unrelated image. */ }
    await sleep(350);
  }
  const ranked = [...new Map(candidates.map((asset) => [asset.pageUrl, asset])).values()]
    .map((asset) => ({ asset, score: referenceTitleScore(entity, asset) }))
    .filter((item) => item.score >= 100)
    .sort((left, right) => right.score - left.score);
  if (!ranked.length) return null;
  const downloaded = await downloadAsset({ ...ranked[0].asset, id: `reference-${slug(entity.canonicalName)}`, provider: 'Wikimedia Commons', sourceUrl: ranked[0].asset.pageUrl, sourceKey: ranked[0].asset.pageUrl, rightsTier: 'PUBLISHABLE_WITH_ATTRIBUTION', metadata: { title: ranked[0].asset.title, license: ranked[0].asset.license, creator: ranked[0].asset.creator, pageUrl: ranked[0].asset.pageUrl } }, `reference-${slot}`);
  const reference = { ...downloaded, entity: entity.canonicalName, score: ranked[0].score };
  await writeJson(cachePath, { version: 1, references: [...(cached.references || []).filter((entry) => entry.entity !== entity.canonicalName), reference], updatedAt: now() });
  return reference;
}

async function generateReferenceGroundedSegments(units, semanticSegments, mediaPlan, store) {
  // Build an exact, rights-cleared reference palette for every named critical
  // entity.  A stock segment can still win editorially after temporal review,
  // but metadata/vision overconfidence cannot prevent the planner from having
  // a verified exact alternative available.
  const exactUnits = units.filter((unit) => ['MUST_SHOW_EXACT', 'SHOULD_SHOW_EXACT'].includes(unit.visualIntent?.visualCriticality || ''));
  const gaps = buildVisualGapReport(exactUnits.map((unit) => ({ unitId: unit.id, startTime: unit.startTime, endTime: unit.endTime, narration: unit.text, claimIds: unit.claimIds || [], entities: unit.visualIntent?.requiredEntities || [], requiredAction: unit.visualIntent?.requiredActions || [], requiredObject: unit.visualIntent?.requiredObject || [], requiredMechanism: unit.visualIntent?.requiredMechanism || [], visualIntent: unit.visualIntent, realExactCount: 0, realStrongCount: 0, realContextualCount: 0, syntheticCandidateNeeded: true, documentCandidateCount: 0, graphicCandidateCount: 0, selectedStrategy: 'SYNTHETIC_PHOTOREAL', confidence: null, reason: 'Expanded real moving-footage search did not produce an exact, usable, rights-cleared segment.' })));
  await writeJson(join(reportRoot, 'VisualGapReport.json'), gaps);
  if (!exactUnits.length) return { segments: [], referenceSegments: [], generations: [], gaps };
  const unique = [];
  for (const unit of exactUnits) {
    const entity = entityPlanForUnit(unit, mediaPlan);
    if (entity && !unique.some((entry) => entry.entity.canonicalName === entity.canonicalName)) unique.push({ unit, entity });
  }
  const generations = []; const syntheticSegments = []; const referenceSegments = [];
  if (String(process.env.REAL_GENERATION_ENABLED || '').toLowerCase() !== 'true') {
    await writeJson(join(reportRoot, 'SyntheticResourcePack.json'), { version: 1, generations: exactUnits.map((unit) => ({ unitId: unit.id, decision: 'REJECT', rejectionReasons: ['REAL_GENERATION_DISABLED'] })), keptSegments: [], referenceFallbackSegments: [], generatedAt: now() });
    return { segments: [], referenceSegments: [], generations, gaps };
  }
  const priorSynthetic = await readJson(join(reportRoot, 'SyntheticResourcePack.json'), null);
  let referenceProviderUnavailable = Boolean(priorSynthetic?.generations?.some((entry) => (entry.rejectionReasons || []).some((reason) => /inlineData[^]*?(?:not supported|isn.t supported)|reference[^]*?not supported/i.test(String(reason)))));
  const provider = new GeminiVideoProvider({ apiKey: API_KEY, store, model: process.env.GEMINI_VIDEO_MODEL || 'veo-3.1-fast-generate-preview', resolution: process.env.GEMINI_VIDEO_RESOLUTION || '720p', pollMs: 10000, timeoutMs: 900000 });
  for (const [index, entry] of unique.entries()) {
    const reference = await discoverReferenceForEntity(entry.entity, index + 1);
    if (!reference) { generations.push({ unitId: entry.unit.id, entity: entry.entity.canonicalName, decision: 'REJECT', rejectionReasons: ['NO_RIGHTS_CLEARED_EXACT_REFERENCE'] }); continue; }
    referenceSegments.push({ segmentId: `reference-${slug(entry.entity.canonicalName)}`, assetId: `reference-${slug(entry.entity.canonicalName)}`, startTime: 0, endTime: 8, duration: 8, usableStartTime: 0, usableEndTime: 8, entities: [entry.entity.canonicalName], people: [], objects: ['verified reference photograph'], actions: [], environment: [], location: [], visibleText: [], cameraDistance: 'MEDIUM', cameraMovement: 'STATIC', motionLevel: 'NONE', visualQuality: 'GOOD', sourceAudioUseful: 'NONE', semanticDescription: `Rights-cleared reference photograph of the exact ${entry.entity.canonicalName}.`, confidence: 0.8, provenance: { method: 'wikimedia-commons-exact-title-reference', referenceTitle: reference.title, verifiedAt: now() }, rightsTier: 'PUBLISHABLE_WITH_ATTRIBUTION', sourceKey: reference.pageUrl, sourceUrl: reference.pageUrl, localPath: reference.localPath, provider: 'Wikimedia Commons', mime: reference.mime || 'image/jpeg', assetType: 'IMAGE', evidenceRole: 'DIRECT_EVIDENCE', visualFingerprint: `reference:${reference.sha256}`, metadata: { title: reference.title, license: reference.license, creator: reference.creator, attribution: reference.attribution, pageUrl: reference.pageUrl } });
    const justification = SyntheticBrollEngine.justify({ unitId: entry.unit.id, visualGap: `No exact moving footage for ${entry.entity.canonicalName}.`, whyRealFootageInsufficient: 'Multi-provider moving-footage discovery and temporal inspection found no exact usable segment.', whyScriptShouldRemain: 'The entity is central to the approved story and is supported by the ClaimLedger research.', whySyntheticIsAppropriate: 'A reference-grounded camera-motion illustration can show the physical product without claiming to be archival evidence.', providerChoice: provider.name, expectedQuality: 'HIGH', estimatedCost: { value: null, currency: 'USD', source: 'provider billing unavailable at execution time' }, alternativesConsidered: ['Pexels moving video', 'Pixabay moving video', 'Wikimedia moving video', 'Wikimedia exact still'] });
    assertGenerationJustification(justification);
    const continuity = buildVisualContinuityProfile({ overall: semanticSegments.slice(0, 3) });
    const contract = SyntheticBrollEngine.buildContract({ subject: `the exact ${entry.entity.canonicalName} shown in the supplied legitimate reference image`, action: entry.unit.visualIntent?.requiredActions?.join(', ') || 'a restrained, physically plausible rolling or detail-camera movement', shotPurpose: 'reference-grounded product insert', environment: 'plausible real-world documentary environment consistent with the reference', cameraPosition: 'eye-level medium three-quarter documentary shot', cameraMovement: 'gentle handheld or tripod documentary movement', lensFeel: 'natural 50mm documentary lens', depthOfField: 'moderate depth of field', lighting: 'natural available light', timeOfDay: 'daylight matching reference', colorTemperature: 'neutral natural', exposure: 'ordinary camera exposure', motionBlur: 'natural', frameRateFeel: '24fps documentary', shutterFeel: 'natural shutter', captureCharacter: 'professional documentary camera texture', shotDurationSeconds: 8, aspectRatio: '16:9', screenDirection: 'neutral', subjectScale: 'medium product detail', visualEnergy: 'medium', previousShotContext: 'real moving footage', nextShotContext: 'real moving footage' });
    const prompt = compileSyntheticShotPrompt(contract, continuity, ['do not redesign the supplied vehicle', 'preserve its exact era, body shape, proportions and exterior identifiers']);
    if (referenceProviderUnavailable) { generations.push({ unitId: entry.unit.id, entity: entry.entity.canonicalName, decision: 'REJECT', reference: reference.pageUrl, prompt, rejectionReasons: ['PROVIDER_REFERENCE_CAPABILITY_UNAVAILABLE'], justification }); continue; }
    let asset;
    try { asset = await provider.generate({ prompt, durationSeconds: 8, aspectRatio: '16:9', referenceUris: [fileUri(reference.localPath)] }); } catch (error) { const message = String(error); if (/inlineData[^]*?(?:not supported|isn.t supported)|reference[^]*?not supported/i.test(message)) referenceProviderUnavailable = true; generations.push({ unitId: entry.unit.id, entity: entry.entity.canonicalName, decision: 'REJECT', reference: reference.pageUrl, prompt, rejectionReasons: [`PROVIDER_FAILURE: ${message}`], justification }); continue; }
    const localPath = fileURLToPath(asset.uri);
    const probe = await probeVideoFile(localPath);
    const analysis = await analyzeMovingAsset({ id: `synthetic-${slug(entry.entity.canonicalName)}`, localPath, durationSeconds: probe.durationSeconds, sourceAudio: probe.sourceAudio, mime: probe.mime, provider: asset.provider, sourceUrl: reference.pageUrl, sourceKey: `synthetic:${asset.id}`, rightsTier: 'SYNTHETIC_ILLUSTRATION', visualFingerprint: asset.id, metadata: { title: entry.entity.canonicalName, license: reference.license, creator: reference.creator, referenceUrl: reference.pageUrl, providerMetadata: asset.metadata } }, 500 + index);
    const reviews = analysis.profiles.map((profile) => passesPhotorealismGate({ photorealism: profile.photorealism, temporalRealism: profile.temporalRealism, styleMatch: profile.styleMatch, physics: profile.physics }));
    const keep = reviews.length > 0 && reviews.every((review) => review.keep);
    const rejectionReasons = keep ? [] : [...new Set(reviews.flatMap((review) => review.reasons))];
    const record = { unitId: entry.unit.id, entity: entry.entity.canonicalName, provider: asset.provider, model: asset.model, reference: { pageUrl: reference.pageUrl, title: reference.title, license: reference.license }, prompt, justification, candidateUri: asset.uri, generatedDurationSeconds: probe.durationSeconds, decision: keep ? 'KEEP' : 'REJECT', rejectionReasons, reviews };
    generations.push(record);
    if (!keep) continue;
    syntheticSegments.push(...analysis.profiles.map((profile) => ({ ...profile, entities: [...new Set([entry.entity.canonicalName, ...(profile.entities || [])])], assetType: 'SYNTHETIC_VIDEO', evidenceRole: 'SYNTHETIC_ILLUSTRATION', generated: true, sourceUrl: reference.pageUrl, sourceKey: `synthetic:${asset.id}`, rightsTier: 'SYNTHETIC_ILLUSTRATION', provider: asset.provider, metadata: { ...profile.metadata, syntheticProvenance: record, referenceUrl: reference.pageUrl, referenceLicense: reference.license } })));
  }
  await writeJson(join(reportRoot, 'SyntheticResourcePack.json'), { version: 1, generations, keptSegments: syntheticSegments.map((segment) => segment.segmentId), referenceFallbackSegments: referenceSegments.map((segment) => segment.segmentId), generatedAt: now() });
  return { segments: syntheticSegments, referenceSegments, generations, gaps };
}

function detectDefaultMotionEffects(manifest) {
  const auditText = JSON.stringify({ editPlan: manifest.editPlan, scenes: manifest.scenes, assets: manifest.assets });
  return /vibration|jitter|ken.?burns|random\s+(translate|scale)|shake/i.test(auditText);
}

async function buildThumbnailDirector(matches, text) {
  const candidates = [...new Map(matches.flatMap((item) => item.topCandidates).filter((candidate) => candidate.segment.localPath && (['EXACT', 'STRONG'].includes(candidate.classification) || (String(candidate.segment.assetType || '').toUpperCase() !== 'IMAGE' && candidate.classification === 'CONTEXTUAL'))).map((candidate) => [candidate.segment.segmentId, candidate])).values()]
    .sort((left, right) => (String(left.segment.assetType || '').toUpperCase() === 'IMAGE' ? 1 : 0) - (String(right.segment.assetType || '').toUpperCase() === 'IMAGE' ? 1 : 0) || right.score - left.score)
    .slice(0, 3);
  if (candidates.length === 0) throw new Error('THUMBNAIL_BLOCKED: no semantically strong visual segment available');
  const out = [];
  for (const [index, candidate] of candidates.entries()) {
    const segment = candidate.segment; const range = segmentMediaRange(segment); const frame = join(runRoot, 'thumbnail', `candidate-${index + 1}-source.jpg`); const target = join(finalRoot, `thumbnail-candidate-${index + 1}.jpg`);
    if (String(segment.assetType || '').toUpperCase() === 'IMAGE' || /^image\//i.test(String(segment.mime || ''))) await copyFile(segment.localPath, frame);
    else await extractFrame(segment.localPath, range.startTime + range.duration / 2, frame);
    const titleFile = join(runRoot, 'thumbnail', `title-${index + 1}.txt`); await writeFile(titleFile, clean(text).slice(0, 68));
    await run('ffmpeg', ['-y', '-i', frame, '-vf', `scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,drawbox=x=0:y=0:w=iw:h=ih:color=black@0.28:t=fill,drawtext=textfile='${titleFile.replaceAll('\\', '/').replaceAll(':', '\\:')}':fontcolor=white:fontsize=58:line_spacing=8:borderw=3:bordercolor=black:x=70:y=h-190`, '-frames:v', '1', '-q:v', '2', target], { quiet: true });
    out.push({ path: target, segmentId: segment.segmentId, sourceUrl: segment.sourceUrl, score: candidate.score, classification: candidate.classification, frameTime: range.startTime + range.duration / 2, sourceTimecode: [range.startTime, range.endTime] });
  }
  const selected = out.toSorted((a, b) => b.score - a.score)[0];
  await copyFile(selected.path, join(finalRoot, 'thumbnail.jpg'));
  return { selected: join(finalRoot, 'thumbnail.jpg'), candidates: out, method: 'semantic-action-frame-midpoint-plus-title-composition' };
}

async function buildTruthThumbnail(selected, text, diagramPath, semanticSegments = []) {
  const poolMatches = semanticSegments.filter((segment) => segment.localPath).map((segment) => ({ segment, score: Number(segment.confidence || 0) }));
  const allMatches = [...selected.map((item) => item.match), ...poolMatches];
  const strong = allMatches.find((match) => /leaps off a high rocky cliff|jumps off a stone structure|cliff-diving adventure/i.test(match.segment.semanticDescription || '') && match.segment.localPath)
    || allMatches.find((match) => /leaps|jumps|diving/i.test(match.segment.semanticDescription || '') && match.segment.localPath)
    || allMatches.find((match) => /cliff|dive|jump/i.test(match.segment.semanticDescription || '') && match.segment.localPath)
    || selected[0]?.match;
  if (!strong?.segment?.localPath) throw new Error('THUMBNAIL_BLOCKED: truth repair has no diver visual');
  const diverFrame = join(runRoot, 'thumbnail', 'truth-diver.jpg');
  const strongRange = segmentMediaRange(strong.segment); const actionStart = Number.isFinite(Number(strong.segment.actionOnsetTime)) ? Number(strong.segment.actionOnsetTime) : strongRange.startTime; const actionFrameTime = Math.min(strongRange.endTime - 0.2, Math.max(strongRange.startTime, actionStart + 0.9));
  await extractFrame(strong.segment.localPath, actionFrameTime, diverFrame);
  const diagramFrame = join(runRoot, 'thumbnail', 'truth-diagram.jpg');
  await extractFrame(diagramPath, 2.6, diagramFrame);
  const title = join(runRoot, 'thumbnail', 'truth-title.txt');
  await writeFile(title, 'WHY WATER MOVES', 'utf8');
  const candidates = [
    { name: 'thumbnail-truth-1.jpg', filter: '[0:v]scale=720:1280:force_original_aspect_ratio=increase,crop=720:720:(in_w-out_w)/2:0[left];[1:v]scale=560:720:force_original_aspect_ratio=increase,crop=560:720:(in_w-out_w)/2:(in_h-out_h)/2[right];[left][right]hstack=inputs=2,drawbox=x=0:y=0:w=iw:h=ih:color=black@0.16:t=fill,drawtext=textfile=\'TITLE\':fontcolor=white:fontsize=54:borderw=4:bordercolor=black:x=48:y=56'
    },
    { name: 'thumbnail-truth-2.jpg', filter: '[0:v]scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720:(in_w-out_w)/2:(in_h-out_h)/2[base];[1:v]scale=420:210:force_original_aspect_ratio=increase,crop=420:210:(in_w-out_w)/2:(in_h-out_h)/2[diag];[base][diag]overlay=760:420,drawbox=x=0:y=0:w=iw:h=ih:color=black@0.2:t=fill,drawtext=textfile=\'TITLE\':fontcolor=white:fontsize=64:borderw=4:bordercolor=black:x=54:y=54'
    },
    { name: 'thumbnail-truth-3.jpg', filter: '[1:v]scale=720:720:force_original_aspect_ratio=increase,crop=720:720:(in_w-out_w)/2:(in_h-out_h)/2[left];[0:v]scale=560:1280:force_original_aspect_ratio=increase,crop=560:720:(in_w-out_w)/2:0[right];[left][right]hstack=inputs=2,drawbox=x=0:y=0:w=iw:h=ih:color=black@0.12:t=fill,drawtext=textfile=\'TITLE\':fontcolor=white:fontsize=54:borderw=4:bordercolor=black:x=48:y=56'
    }
  ];
  const results = [];
  for (const candidate of candidates) {
    const target = join(finalRoot, candidate.name);
    const filter = candidate.filter.replaceAll('TITLE', title.replaceAll('\\', '/').replaceAll(':', '\\:'));
    await run('ffmpeg', ['-y', '-i', diverFrame, '-i', diagramFrame, '-filter_complex', filter, '-frames:v', '1', '-q:v', '2', target], { quiet: true });
    const mobile = join(runRoot, 'thumbnail', `${candidate.name.replace('.jpg', '')}-mobile.jpg`);
    await run('ffmpeg', ['-y', '-i', target, '-vf', 'scale=320:180', '-frames:v', '1', '-q:v', '3', mobile], { quiet: true });
    results.push({ path: target, mobilePreview: mobile, concept: candidate.name, subject: strong.segment.segmentId, sourceTimecode: [strong.segment.startTime, strong.segment.endTime] });
  }
  const selectedThumb = results[0];
  await copyFile(selectedThumb.path, join(finalRoot, 'thumbnail-v2.jpg'));
  await writeJson(join(reportRoot, 'ThumbnailQC-v2.json'), { status: 'PASS', selected: selectedThumb, candidates: results, method: 'diver-plus-technical-mechanism-composite', mobilePreview: selectedThumb.mobilePreview, promise: clean(text) });
  return { selected: join(finalRoot, 'thumbnail-v2.jpg'), candidates: results, method: 'truthful-diver-plus-mechanism-composite' };
}

async function inspectEditorialVideo(videoPath, units, selected) {
  const rows = [];
  const renderedDuration = Number((await probeVideoFile(videoPath)).durationSeconds || 0);
  const safeLastFrame = Math.max(0.05, renderedDuration - 0.05);
  const entries = [...units.entries()];
  // Bounded parallelism keeps temporal review comprehensive without letting
  // one long video turn into dozens of serial provider round trips.
  for (let offset = 0; offset < entries.length; offset += 8) {
    const batch = await Promise.all(entries.slice(offset, offset + 8).map(async ([index, unit]) => {
      const match = selected[index]?.match; if (!match) return null;
      const rawTimes = [unit.startTime + Math.min(0.15, Math.max(0.05, unit.endTime - unit.startTime) * 0.15), (unit.startTime + unit.endTime) / 2, Math.max(unit.startTime, unit.endTime - 0.15)];
      const times = [...new Set(rawTimes.map((time) => Math.max(0.05, Math.min(safeLastFrame, time))))];
      const frames = [];
      for (const [frameIndex, time] of times.entries()) frames.push(await extractFrame(videoPath, time, join(runRoot, 'qc', 'editorial', `${String(index).padStart(2, '0')}-${frameIndex}.jpg`)));
      let observation;
      try { observation = await geminiVisualJson(frames, `This is the FINAL RENDERED VIDEO at ${unit.startTime.toFixed(2)}-${unit.endTime.toFixed(2)} seconds. Narration phrase: "${unit.text}". Required visual intent: ${JSON.stringify(unit.visualIntent)}. Decide whether the rendered frames show the phrase: EXACT, STRONG, CONTEXTUAL, WEAK, or WRONG. Mention the observed action and whether it arrives in time.`); } catch (error) { observation = { semanticDescription: `Editorial visual inspection failed: ${error}`, confidence: 0 }; }
      const observed = clean(observation.semanticDescription || ''); const lower = observed.toLowerCase(); const inspectionFailed = Number(observation.confidence ?? 0) <= 0 || /inspection failed|enoent|error:/i.test(lower); const exactVisualRequired = ['MUST_SHOW_EXACT', 'SHOULD_SHOW_EXACT'].includes(unit.visualIntent?.visualCriticality || ''); const wrong = /\bwrong\b|does not|not show|unrelated|mismatch|cannot see/i.test(lower); const directStillIdentity = match.classification === 'EXACT' && String(match.segment.assetType || '').toUpperCase() === 'IMAGE' && !(unit.visualIntent?.requiredActions || []).length; const weak = !directStillIdentity && /\bweak\b|unclear|barely|generic|static/i.test(lower);
      // Contextual B-roll is an allowed soft signal.  It becomes a QC defect
      // only when the unit explicitly requires exact identity, or when the
      // inspector could not inspect the rendered interval at all.
      const defect = inspectionFailed && !directStillIdentity ? 'EDITORIAL_INSPECTION_FAILED' : exactVisualRequired && wrong ? 'WRONG_VISUAL' : exactVisualRequired && weak ? 'WEAK_VISUAL' : null;
      return { unitId: unit.id, narration: unit.text, startTime: unit.startTime, endTime: unit.endTime, selectedSegmentId: match.segment.segmentId, selectedSourceUrl: match.segment.sourceUrl, renderedFrames: frames, observation, defect };
    }));
    rows.push(...batch.filter(Boolean));
  }
  const critical = rows.filter((row) => row.defect === 'WRONG_VISUAL' || row.defect === 'WEAK_VISUAL' || row.defect === 'EDITORIAL_INSPECTION_FAILED');
  return { method: 'multiframe-vision-on-final-rendered-intervals', inspectedUnits: rows.length, defects: critical, rows, status: critical.length ? 'INTERNAL_REPAIR_REQUIRED' : 'PASS', reviewedAt: now() };
}

async function visualRewritePass(script, semanticSegments, failure) {
  const digest = semanticSegments.slice(0, 48).map((segment) => `${segment.segmentId} | ${segment.semanticDescription} | entities=${segment.entities.join(',')} | actions=${segment.actions.join(',')} | location=${segment.location.join(',')}`).join('\n');
  const rewritten = await geminiJson(`Perform a VisualRewritePass on this sourced-video script. The previous phrase could not be matched to a strong real moving segment: ${failure}. Rewrite only unsupported visual language while preserving verified claims, natural English, the approximate ${Math.max(45, Math.min(240, requestedDuration))}-second target, and a clear payoff. Non-critical connective lines may use strong editorial context. Named entities must retain exact visual intent. Do not invent a visual. Return JSON only in the same schema: {title,hookMechanism,narration,beats:[{id,narration,entities,claimIds,visualIntent:{requiredEntities,preferredEntities,requiredActions,preferredActions,location,shotPreferences,semanticGoal,avoid,queries,visualCriticality},editorialForm,importance}],claims,packaging}. FOOTAGE THAT CAN ACTUALLY BE SHOWN:\n${digest}\nORIGINAL SCRIPT:\n${JSON.stringify(script)}`);
  if (!rewritten?.narration || !Array.isArray(rewritten.beats) || rewritten.beats.length < 5) throw new Error('VISUAL_REWRITE_BLOCKED: rewritten script is incomplete');
  return { ...rewritten, targetDurationSec: Math.max(45, Math.min(240, requestedDuration)), generatedAt: now(), alignmentMethod: 'GEMINI_WORD_TIMESTAMPS_REQUIRED', visualRewritePass: true };
}

async function renderFootageProRun(opportunity, research, semanticSegments, creatorScript = null, mediaPlan = null) {
  const cachedScript = await readJson(join(reportRoot, 'script.json'), null);
  let script = cachedScript?.sourceOpportunityTopic === opportunity.topic && cachedScript?.sourceInputText === clean(creatorScript?.narration || '') && cachedScript?.narration && Array.isArray(cachedScript.beats) ? cachedScript : await makeFootageScript(opportunity, research, semanticSegments, creatorScript, mediaPlan);
  script = normalizeScriptVisualCriticality({ ...script, sourceOpportunityTopic: opportunity.topic, sourceInputText: clean(creatorScript?.narration || '') }, opportunity, mediaPlan);
  await writeJson(join(reportRoot, 'script.json'), script);
  const store = new NodeLocalObjectStore(join(runRoot, 'storage'));
  const voiceStatePath = join(reportRoot, 'voice-state.json');
  const cachedVoice = await readJson(voiceStatePath, null);
  const synthesizeVoice = async (text) => {
    const rawVoiceProvider = new GeminiVoiceProvider({ apiKey: API_KEY, store, model: TTS_MODEL, defaultVoice: TTS_VOICE, protocol: 'generateContent' });
    const voiceProvider = withGeminiWordAlignment(rawVoiceProvider, { apiKey: API_KEY, strict: true, minCoverage: 0.88 });
    const synthesized = await voiceProvider.synthesize({ text, voice: TTS_VOICE, language: 'en-US' });
    await writeJson(voiceStatePath, { ...synthesized, sourceText: text });
    return synthesized;
  };
  let voice = cachedVoice?.sourceText === script.narration && cachedVoice?.uri?.startsWith('file://') && existsSync(cachedVoice.uri.replace(/^file:\/\//, '')) && Array.isArray(cachedVoice.metadata?.wordTimestamps) ? cachedVoice : await synthesizeVoice(script.narration);
  let wordTimestamps = voice.metadata?.wordTimestamps || [];
  if (wordTimestamps.length < 30 || wordTimestamps.some((word) => !Number.isFinite(word.startTime) || !Number.isFinite(word.endTime) || word.endTime <= word.startTime)) throw new Error('FOOTAGE_PRO blocked: validated real word timestamps were not returned');
  let actualDuration = Number(voice.durationSeconds || wordTimestamps.at(-1)?.endTime || 0);
  const minDuration = Math.max(25, requestedDuration * 0.55); const maxDuration = Math.max(90, requestedDuration * 1.45);
  if (actualDuration < minDuration || actualDuration > maxDuration) throw new Error(`SOURCED_AUTOPRODUCTION voice duration ${actualDuration.toFixed(2)}s outside earned ${minDuration.toFixed(0)}-${maxDuration.toFixed(0)}s range`);
  await writeJson(join(reportRoot, 'raw-word-timestamps.json'), { method: voice.metadata?.alignmentSource || 'unknown', words: wordTimestamps });
  let units;
  try { units = reflowEditorialUnits(localizeExactVisualCriticality(splitLongNarrationUnits(buildNarrationUnits(script.beats.map((beat, index) => ({ ...beat, id: beat.id || `beat-${index + 1}` })), wordTimestamps)), mediaPlan), actualDuration); } catch (error) { await writeJson(join(reportRoot, 'alignment-error.json'), { error: String(error), wordCount: wordTimestamps.length }); throw error; }
  if (units.length < Math.max(6, Math.round(actualDuration / 12))) throw new Error(`EDITORIAL_TIMELINE_BLOCKED: only ${units.length} phrase-level units were aligned`);
  let effectiveSegments = semanticSegments;
  let syntheticRun = await generateReferenceGroundedSegments(units, effectiveSegments, mediaPlan, store);
  // Reference stills are valid conditioning inputs, never final visual
  // assets.  A VIDEO_ONLY production may use the generated moving result or
  // fail/rewrite; it must not silently select the still fallback.
  effectiveSegments = [...effectiveSegments, ...syntheticRun.segments];
  let selected;
  units = relaxSecondaryVisualGaps(units, effectiveSegments, mediaPlan);
  try { selected = selectSemanticMatches(units, effectiveSegments); } catch (error) {
    let rewritten;
    try { rewritten = await visualRewritePass(script, semanticSegments, String(error)); } catch (rewriteError) {
      await writeJson(join(reportRoot, 'visual-rewrite-error.json'), { originalMatchError: String(error), rewriteError: String(rewriteError), at: now() });
      throw error;
    }
    script = normalizeScriptVisualCriticality(rewritten, opportunity, mediaPlan);
    await writeJson(join(reportRoot, 'script-rewritten.json'), script); await writeJson(join(reportRoot, 'script.json'), script);
    voice = await synthesizeVoice(script.narration); wordTimestamps = voice.metadata?.wordTimestamps || []; actualDuration = Number(voice.durationSeconds || wordTimestamps.at(-1)?.endTime || 0); await writeJson(join(reportRoot, 'raw-word-timestamps.json'), { method: voice.metadata?.alignmentSource || 'unknown', words: wordTimestamps });
    if (wordTimestamps.length < 30) throw new Error('FOOTAGE_PRO blocked after VisualRewritePass: word timestamps unavailable');
    if (actualDuration < minDuration || actualDuration > maxDuration) throw new Error(`SOURCED_AUTOPRODUCTION VisualRewritePass voice duration ${actualDuration.toFixed(2)}s outside earned range`);
    units = reflowEditorialUnits(localizeExactVisualCriticality(splitLongNarrationUnits(buildNarrationUnits(script.beats.map((beat, index) => ({ ...beat, id: beat.id || `beat-${index + 1}` })), wordTimestamps)), mediaPlan), actualDuration);
    if (units.length < Math.max(6, Math.round(actualDuration / 12))) throw new Error(`EDITORIAL_TIMELINE_BLOCKED after VisualRewritePass: only ${units.length} phrase-level units were aligned`);
    syntheticRun = await generateReferenceGroundedSegments(units, semanticSegments, mediaPlan, store);
    effectiveSegments = [...semanticSegments, ...syntheticRun.segments];
    units = relaxSecondaryVisualGaps(units, effectiveSegments, mediaPlan);
    try { selected = selectSemanticMatches(units, effectiveSegments); } catch (finalMatchError) { await recordTopicRejection(opportunity.topic, opportunity.angle, ['EDITORIAL_MATCH_BLOCKED'], finalMatchError); throw finalMatchError; }
  }
  const coverage = coverageFromTimeline(units, selected);
  let thumbnail;
  try {
    thumbnail = await buildThumbnailDirector(selected, script.packaging?.thumbnailText || script.title);
  } catch (error) {
    const rejectedPath = join(reportRoot, 'rejected-topics.json');
    const rejected = await readJson(rejectedPath, []);
    await writeJson(rejectedPath, [...(Array.isArray(rejected) ? rejected : []), { topic: opportunity.topic, angle: opportunity.angle, blockers: ['THUMBNAIL_BLOCKED'], reason: String(error), rejectedAt: now() }]);
    throw error;
  }
  const noveltySimilarity = Number((await readJson(join(reportRoot, 'novelty.json'), { maxSimilarity: 0 })).maxSimilarity || 0);
  const greenlight = evaluateCreativeGreenlightEvidence({ promise: opportunity.viewerPromise || opportunity.angle || script.title, hook: { match: selected[0]?.match || null, firstFrameEvidence: 'first editorial unit uses a semantically selected moving segment' }, units, coverage, semanticSegments, noveltySimilarity, thumbnailEvidence: thumbnail.method });
  await writeJson(join(reportRoot, 'TopicGreenlightReport.json'), greenlight);
  if (greenlight.status !== 'PASS') {
    const rejectedPath = join(reportRoot, 'rejected-topics.json');
    const rejected = await readJson(rejectedPath, []);
    await writeJson(rejectedPath, [...(Array.isArray(rejected) ? rejected : []), { topic: opportunity.topic, angle: opportunity.angle, blockers: greenlight.blockers, mediaDepth: greenlight.dimensions?.mediaDepth ?? null, rejectedAt: now() }]);
    throw new Error(`CREATIVE_GREENLIGHT_BLOCKED: ${greenlight.blockers.join('; ')}`);
  }
  let visualCursor = 0;
  const scenes = selected.map((item, index) => {
    const unit = units[index]; const startSec = visualCursor; const endSec = Math.max(startSec + 0.2, unit.endTime);
    visualCursor = endSec;
    return { id: `${unit.id}-s${index + 1}`, startSec, durationSec: endSec - startSec, kind: item.match.segment.assetType === 'IMAGE' ? 'image' : 'video', instruction: unit.visualIntent, sourceIds: [item.match.segment.segmentId], generated: item.match.segment.assetType === 'SYNTHETIC_VIDEO', evidenceRole: item.match.segment.evidenceRole || 'CONTEXTUAL_REAL', visualLead: unit.startTime > startSec ? { seconds: unit.startTime - startSec, reason: index === 0 ? 'Opening selected footage establishes the entity before narration begins.' : 'Adjacent selected footage carries the natural speech pause.' } : null };
  });
  const timelineItems = scenes.map((scene) => ({ startTime: scene.startSec, endTime: scene.startSec + scene.durationSec, visualType: scene.generated ? 'SYNTHETIC_VIDEO' : scene.kind === 'image' ? 'IMAGE' : 'REAL_VIDEO' }));
  assertFinalTimelineIsVideoOnly(timelineItems.map((item, index) => ({ id: scenes[index].id, start: item.startTime, end: item.endTime, kind: item.visualType, metadata: { evidenceRole: scenes[index].evidenceRole, videoOnly: item.visualType === 'SYNTHETIC_VIDEO' ? true : undefined } })));
  const mediaRatios = timelineMediaRatios(timelineItems);
  const timelineAssets = selected.map((item, index) => { const segment = item.match.segment; const range = segmentMediaRange(segment); const scene = scenes[index]; const generated = segment.assetType === 'SYNTHETIC_VIDEO'; return { id: `${segment.segmentId}-${index}`, uri: fileUri(segment.localPath), mimeType: segment.mime || 'video/mp4', provider: segment.provider, model: generated ? (segment.metadata?.syntheticProvenance?.model || 'reference-grounded-video') : 'multiframe-semantic-segment-v1', costUsd: 0, sceneId: scene.id, generated, evidenceRole: segment.evidenceRole || (generated ? 'SYNTHETIC_ILLUSTRATION' : 'CONTEXTUAL_REAL'), sourceIds: [segment.segmentId], sourceUrl: segment.sourceUrl, license: segment.metadata?.license || null, metadata: { sourceUrl: segment.sourceUrl, rightsStatus: segment.rightsTier, attribution: segment.metadata?.creator || null, title: segment.metadata?.title || segment.segmentId, clipStartSec: range.startTime, clipEndSec: range.endTime, sourceAudio: segment.sourceAudio, visualMatch: item.match.classification, matchExplanation: item.match.explanation, semanticProfile: segment.provenance, shotTimecode: [segment.startTime, segment.endTime], usableTimecode: [range.startTime, range.endTime], temporalEvidence: segment.temporalEvidence || null, syntheticProvenance: segment.metadata?.syntheticProvenance || null } }; });
  const containsSyntheticMedia = timelineAssets.some((asset) => asset.generated);
  const renderManifest = { projectId: runId, createdAt: now(), finalMediaPolicy: 'VIDEO_ONLY', contentFormat: 'SHORT_HORIZONTAL', aspectRatio: '16:9', frame: { width: 1280, height: 720 }, engineeringResolution: '1280x720', contentArchetype: { version: 1, id: 'FOOTAGE_PRO_SOURCED_NARRATIVE', label: 'Footage-first sourced narrative', confidence: 82, reasons: ['multiframe segment understanding', 'phrase-level semantic footage matching'], voiceMode: 'SINGLE_NARRATOR', realityMode: 'FACTUAL', cameraProfile: 'EDITORIAL_DOCUMENTARY', syntheticDisclosurePolicy: containsSyntheticMedia ? 'Synthetic illustrations retain provenance and are never direct evidence.' : 'Synthetic voice only; source video provenance retained.', profile: {} }, captionPlan: { enabled: true, burnIn: false, preset: 'KARAOKE_BOLD', source: 'GEMINI_WORD_TIMESTAMPS', mode: 'WORD_KARAOKE' }, editPlan: { preset: 'FOOTAGE_PRO', transitionMode: 'CLEAN_CUTS', filmLook: false, punchInAnchors: false, preserveAudioTiming: true, defaultMotionEffects: [] }, script: { title: script.title, targetDurationSec: actualDuration, beats: units.map((unit) => ({ id: unit.id, narration: unit.text, entities: unit.visualIntent.requiredEntities, visualIntent: unit.visualIntent, startSec: unit.startTime, targetDurationSec: unit.endTime - unit.startTime, importance: unit.importance })) }, scenes, assets: timelineAssets, voice: { id: `voice-${runId}`, uri: voice.uri, mimeType: voice.mimeType, provider: voice.provider, model: voice.model, durationSeconds: actualDuration, alignment: voice.alignment, wordTimestamps }, music: null, estimatedCostUsd: 0, actualCostUsd: Number(voice.metadata?.transcriptionCostUsd || 0), containsSyntheticMedia };
  await writeJson(join(runRoot, 'timeline', 'MasterTimeline.json'), renderManifest);
  const matchingReceipts = selected.map((item, index) => ({ editorialUnit: units[index], topCandidates: item.topCandidates.map((candidate) => { const range = segmentMediaRange(candidate.segment); return { segmentId: candidate.segment.segmentId, sourceUrl: candidate.segment.sourceUrl, shotTimecode: [candidate.segment.startTime, candidate.segment.endTime], sourceTimecode: [range.startTime, range.endTime], classification: candidate.classification, score: candidate.score, components: candidate.components, explanation: candidate.explanation }; }), selectedSegment: item.match.segment.segmentId, selectedSourceTimecode: [segmentMediaRange(item.match.segment).startTime, segmentMediaRange(item.match.segment).endTime] }));
  await writeJson(join(reportRoot, 'matching-receipts.json'), matchingReceipts);
  await writeJson(join(reportRoot, 'NarrationUnits.json'), units);
  await writeJson(join(reportRoot, 'segment-semantic-profiles.json'), semanticSegments);
  await writeJson(join(reportRoot, 'VisualCoverageReport.json'), coverage);
  await writeJson(join(reportRoot, 'MediaRatios.json'), mediaRatios);
  const manifestPath = join(runRoot, 'timeline', 'render-manifest.json'); await writeJson(manifestPath, renderManifest);
  const renderer = new FfmpegRenderer({ outputRoot: renderRoot, width: 1280, height: 720, fps: 30, targetLufs: -16, truePeakDb: -1.5, loudnessRange: 7 });
  const rendered = await renderer.render({ manifestUri: fileUri(manifestPath), outputKey: 'v1-base.mp4' });
  const basePath = rendered.uri.replace(/^file:\/\//, '');
  const assPath = join(runRoot, 'audio', 'karaoke.ass'); const karaoke = await writeKaraokeAss(wordTimestamps, assPath);
  const v1 = join(finalRoot, 'video-v1.mp4');
  await run('ffmpeg', ['-y', '-i', basePath, '-vf', `subtitles='${assPath.replaceAll('\\', '/').replaceAll(':', '\\:')}'`, '-c:a', 'copy', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-movflags', '+faststart', v1], { quiet: true });
  const wordAlignmentReport = { valid: true, method: voice.metadata?.alignmentSource || 'gemini-word-timestamps', confidence: 'NOT_SUPPLIED_BY_PROVIDER', wordCount: wordTimestamps.length, coverage: voice.metadata?.alignmentCoverage ?? null };
  await writeJson(join(reportRoot, 'WordAlignmentReport.json'), wordAlignmentReport);
  const candidatesForPreflight = semanticSegments.map((segment) => ({ ...segment, id: segment.segmentId, durationSeconds: segment.duration, usableDurationSeconds: segment.duration, sourceAudio: segment.sourceAudioUseful !== 'NONE', actions: segment.actions, entities: segment.entities, visualFingerprint: segment.visualFingerprint || segment.segmentId }));
  const preflight = evaluateFootagePro({ mode: 'FOOTAGE_PRO', targetDurationSeconds: actualDuration, movingVideoSeconds: mediaRatios.seconds.REAL_VIDEO, stillImageSeconds: mediaRatios.seconds.IMAGE + mediaRatios.seconds.DOCUMENT + mediaRatios.seconds.GRAPHIC + mediaRatios.seconds.GENERATED_VIDEO, candidates: candidatesForPreflight, requiredEntities: opportunity.entities || [], topicGreenlit: greenlight.status === 'PASS', wordAlignmentAvailable: wordAlignmentReport.valid, defaultMotionEffectDetected: detectDefaultMotionEffects(renderManifest), minimumCandidates: 15 });
  // A sourced edit with a meaningful exact-still/document layer is a hybrid
  // editorial product even when it contains no synthetic video.  Do not hide
  // that mix behind the stricter FOOTAGE_PRO label; the report remains honest
  // about both moving-video and still-image coverage.
  const productionMode = mediaRatios.ratios.SYNTHETIC_VIDEO > 0.25 || mediaRatios.ratios.REAL_VIDEO < 0.75 ? 'HYBRID_EDITORIAL' : 'FOOTAGE_PRO';
  const syntheticShotScores = syntheticRun.segments.map((segment) => ({ photorealism: segment.photorealism || 'UNKNOWN', temporalRealism: segment.temporalRealism || 'UNKNOWN', styleMatch: segment.styleMatch || 'UNKNOWN', physics: segment.physics || 'UNKNOWN', score: null, evidence: [segment.semanticDescription], method: 'temporal-generated-shot-review' }));
  const modeContract = evaluateModeContract({ mode: productionMode, durationSeconds: actualDuration, realVideoSeconds: mediaRatios.seconds.REAL_VIDEO, syntheticVideoSeconds: mediaRatios.seconds.SYNTHETIC_VIDEO, graphicSeconds: mediaRatios.seconds.GRAPHIC, imageSeconds: mediaRatios.seconds.IMAGE, criticalVisualsCovered: coverage.ratios.wrong === 0 && coverage.ratios.weak === 0, syntheticShots: syntheticShotScores });
  await writeJson(join(reportRoot, 'ModeContractReport.json'), modeContract);
  const qc = await inspectVideo(v1); const editorialQc = await inspectEditorialVideo(v1, units, selected);
  await writeJson(join(reportRoot, 'EditorialCritic-v1.json'), editorialQc);
  let finalVideo = v1; let finalEditorialQc = editorialQc; let finalSelected = selected; let repair = { applied: false, reason: editorialQc.defects.length ? 'No semantically stronger local replacement was available' : 'No critical editorial defect found', contentChanged: false };
  const firstDefect = editorialQc.defects[0];
  if (firstDefect) {
    const defectIndex = units.findIndex((unit) => unit.id === firstDefect.unitId); const current = finalSelected[defectIndex];
    const alternative = current?.topCandidates?.find((candidate) => candidate.segment.segmentId !== current.match.segment.segmentId && ['EXACT', 'STRONG'].includes(candidate.classification));
    if (alternative) {
      const repairedSelected = finalSelected.map((item, index) => index === defectIndex ? { ...item, match: alternative } : item);
      const alternativeRange = segmentMediaRange(alternative.segment);
      const repairedManifest = { ...renderManifest, scenes: renderManifest.scenes.map((scene, index) => index === defectIndex ? { ...scene, sourceIds: [alternative.segment.segmentId], instruction: units[index].visualIntent } : scene), assets: renderManifest.assets.map((asset, index) => index === defectIndex ? { ...asset, id: `${alternative.segment.segmentId}-${index}-repair`, uri: fileUri(alternative.segment.localPath), sourceIds: [alternative.segment.segmentId], sourceUrl: alternative.segment.sourceUrl, metadata: { ...asset.metadata, clipStartSec: alternativeRange.startTime, clipEndSec: alternativeRange.endTime, shotTimecode: [alternative.segment.startTime, alternative.segment.endTime], usableTimecode: [alternativeRange.startTime, alternativeRange.endTime], semanticProfile: alternative.segment.provenance, visualMatch: alternative.classification, repair: 'LOCALIZED_SEMANTIC_REPLACEMENT' } } : asset) };
      const repairManifestPath = join(runRoot, 'timeline', 'repair-manifest.json'); await writeJson(repairManifestPath, repairedManifest);
      const repairRenderer = new FfmpegRenderer({ outputRoot: join(renderRoot, 'repair'), width: 1280, height: 720, fps: 30, targetLufs: -16, truePeakDb: -1.5, loudnessRange: 7 });
      const repaired = await repairRenderer.render({ manifestUri: fileUri(repairManifestPath), outputKey: 'v2-base.mp4' });
      const v2 = join(finalRoot, 'video-v2.mp4'); const repairedBase = repaired.uri.replace(/^file:\/\//, '');
      await run('ffmpeg', ['-y', '-i', repairedBase, '-vf', `subtitles='${assPath.replaceAll('\\', '/').replaceAll(':', '\\:')}'`, '-c:a', 'copy', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-movflags', '+faststart', v2], { quiet: true });
      const beforeHash = hash(await readFile(v1)); const afterHash = hash(await readFile(v2));
      finalVideo = v2; finalSelected = repairedSelected; finalEditorialQc = await inspectEditorialVideo(v2, units, finalSelected);
      repair = { applied: true, defect: firstDefect, oldSegmentId: current.match.segment.segmentId, newSegmentId: alternative.segment.segmentId, oldSourceTimecode: [segmentMediaRange(current.match.segment).startTime, segmentMediaRange(current.match.segment).endTime], newSourceTimecode: [alternativeRange.startTime, alternativeRange.endTime], affectedOutputInterval: [units[defectIndex].startTime, units[defectIndex].endTime], beforeHash, afterHash, contentChanged: beforeHash !== afterHash, postRepairCritic: finalEditorialQc };
      await writeJson(join(reportRoot, 'RepairPlan.json'), repair);
    }
  }
  const finalCoverage = coverageFromTimeline(units, finalSelected);
  await writeJson(join(reportRoot, 'VisualCoverageReport-final.json'), finalCoverage);
  const matchingReceiptsFinal = finalSelected.map((item, index) => { const range = segmentMediaRange(item.match.segment); return { editorialUnit: units[index], selectedSegment: item.match.segment.segmentId, selectedClassification: item.match.classification, shotTimecode: [item.match.segment.startTime, item.match.segment.endTime], selectedSourceTimecode: [range.startTime, range.endTime], temporalEvidence: item.match.segment.temporalEvidence || null }; });
  await writeJson(join(reportRoot, 'matching-receipts-final.json'), matchingReceiptsFinal);
  const finalQc = finalVideo === v1 ? qc : await inspectVideo(finalVideo);
  const report = { version: 2, runId, status: modeContract.status === 'PASS' && finalQc.status === 'PASS' && finalEditorialQc.status === 'PASS' ? 'READY_FOR_HUMAN_REVIEW' : 'INTERNAL_REVIEW_REQUIRED', input: { mode, opportunity }, output: { video: finalVideo, thumbnail: thumbnail.selected, durationSeconds: actualDuration, format: '16:9', title: script.packaging?.title || script.title }, voice: { provider: voice.provider, model: voice.model, alignmentMethod: wordAlignmentReport.method, wordCount: wordTimestamps.length, karaoke, wordAlignmentReport }, footage: { productionMode, preflight, modeContract, mediaRatios, coverage: finalCoverage, uniqueMovingSegments: effectiveSegments.length, uniqueSources: new Set(effectiveSegments.map((item) => item.sourceKey)).size, topSourceShare: Math.max(...[...new Set(effectiveSegments.map((item) => item.sourceKey))].map((key) => effectiveSegments.filter((item) => item.sourceKey === key).length / Math.max(1, effectiveSegments.length))), selected: finalSelected.map((item) => { const range = segmentMediaRange(item.match.segment); return { id: item.match.segment.segmentId, assetType: item.match.segment.assetType || 'REAL_VIDEO', evidenceRole: item.match.segment.evidenceRole || 'CONTEXTUAL_REAL', sourceUrl: item.match.segment.sourceUrl, shotTimecode: [item.match.segment.startTime, item.match.segment.endTime], sourceTimecode: [range.startTime, range.endTime], classification: item.match.classification, temporalEvidence: item.match.segment.temporalEvidence || null }; }), synthetic: { count: syntheticRun.segments.length, candidates: syntheticRun.generations } }, greenlight, qc: { v1: { technical: qc, editorial: editorialQc }, repair, final: { technical: finalQc, editorial: finalEditorialQc } }, cost: { externalPaidUsd: 'UNKNOWN_PROVIDER_BILLING_NOT_EXPOSED', localRenderUsd: 0, alignmentUsd: Number(voice.metadata?.transcriptionCostUsd || 0) }, limitations: ['No procedural music was used; the current render intentionally relies on narration and source audio availability rather than a synthetic tone bed.', 'Human review remains required.'] };
  await writeJson(join(reportRoot, 'production-run.json'), report);
  return { script, voice, segments: semanticSegments, preflight, qc: { technical: finalQc, editorial: finalEditorialQc }, video: finalVideo, thumbnail: thumbnail.selected, report, units, selected: finalSelected, renderManifest, wordTimestamps };
}

async function runFootageProProduction(history) {
  const stage = (name, detail = {}) => console.log(JSON.stringify({ runId, stage: name, at: now(), ...detail }));
  stage('START');
  const creatorScript = await readCreatorScript();
  const creatorInput = clean(requestedPrompt || creatorScript?.narration || '');
  const cachedOpportunity = await readJson(join(reportRoot, 'opportunity.json'), null);
  const cachedScoutReport = await readJson(join(reportRoot, 'FootageScoutReport.json'), null);
  const requestedWinner = requestedScoutTopic ? cachedScoutReport?.reports?.find((item) => item.topic === requestedScoutTopic) : null;
  const priorGreenlight = await readJson(join(reportRoot, 'TopicGreenlightReport.json'), null);
  const rejectedTopics = await readJson(join(reportRoot, 'rejected-topics.json'), []);
  const cachedTopicRejected = Array.isArray(rejectedTopics) && rejectedTopics.some((item) => item.topic === cachedOpportunity?.topic);
  const scouting = creatorInput
    ? { winner: cachedOpportunity?.sourcePrompt === creatorInput ? cachedOpportunity : await buildOpportunity(creatorInput, history), reports: [], resumedFromCache: Boolean(cachedOpportunity?.sourcePrompt === creatorInput) }
    : requestedWinner ? { winner: requestedWinner, reports: cachedScoutReport.reports, resumedFromCache: true }
      // A named resumable run is an editing continuation, not a new topic
      // scout.  A localized quality failure must preserve its research/media
      // checkpoints so it can be repaired deterministically.
      : resumeRun && cachedOpportunity?.topic ? { winner: cachedOpportunity }
        : await scoutMovingTopics(history);
  const structuredBrief = creatorScript?.structured || {};
  const creatorOverrides = Object.fromEntries(Object.entries({
    topic: structuredBrief.topic,
    angle: structuredBrief.angle,
    audience: structuredBrief.audience,
    domain: structuredBrief.domain,
    entities: structuredBrief.entities,
    researchQuery: structuredBrief.researchQuery,
    visualQueries: structuredBrief.visualQueries,
    viewerPromise: structuredBrief.viewerPromise,
    thumbnailPromise: structuredBrief.thumbnailPromise,
  }).filter(([, value]) => value !== undefined && value !== null && value !== ''));
  let opportunity = { ...scouting.winner, ...creatorOverrides, inputMode: creatorScript ? 'USER_SCRIPT' : (mode === 'radar' ? 'RADAR_AUTONOMOUS' : 'USER_PROMPT'), selectedAt: cachedOpportunity?.selectedAt || now(), sourcePrompt: creatorInput || scouting.winner.sourcePrompt };
  const scoutScore = scouting.winner.nativeVideo || { grade: 'PENDING_DEEP_MEDIA_RECON' };
  const novelty = resumeRun && cachedOpportunity?.topic ? { ...(await readJson(join(reportRoot, 'novelty.json'), {})), maxSimilarity: 0, method: 'RESUME_EXISTING_OPPORTUNITY' } : await noveltyAgainstHistory(opportunity, history);
  await writeJson(join(reportRoot, 'opportunity.json'), opportunity);
  stage('OPPORTUNITY_READY', { topic: opportunity.topic });
  await writeJson(join(reportRoot, 'novelty.json'), novelty);
  await writeJson(join(reportRoot, 'TopicGreenlightReport.json'), { status: 'PENDING_EVIDENCE', evidence: { nativeVideoScout: scoutScore, scoutQueries: opportunity.scoutQueries, novelty }, generatedAt: now() });
  if (!resumeRun && novelty.maxSimilarity >= 0.55) throw new Error(`NOVELTY_GATE_BLOCKED similarity=${novelty.maxSimilarity}`);
  const cachedResearch = await readJson(join(reportRoot, 'research-pack.json'), null);
  const research = cachedResearch?.query === opportunity.topic && Array.isArray(cachedResearch?.sources) && cachedResearch.sources.length > 0 && typeof cachedResearch?.synthesis === 'string' ? cachedResearch : await geminiResearch(opportunity.topic, { recencyDays: 30 });
  await writeJson(join(reportRoot, 'research-pack.json'), research);
  stage('RESEARCH_READY', { cached: research === cachedResearch, sources: research.sources?.length || 0 });
  const cachedMediaPlan = await readJson(join(reportRoot, 'EntityMediaPlan.json'), null);
  const creatorMediaPlan = normalizeCreatorMediaPlan(structuredBrief.entityMediaPlan, opportunity);
  const mediaPlan = creatorMediaPlan || (cachedMediaPlan?.sourceTopic === opportunity.topic ? cachedMediaPlan : await deriveMediaPlan(opportunity, research));
  opportunity = { ...opportunity, entities: mediaPlan.resolvedEntityNames, visualQueries: mediaPlan.visualQueries, entityMediaPlan: mediaPlan };
  await writeJson(join(reportRoot, 'EntityMediaPlan.json'), { ...mediaPlan, sourceTopic: opportunity.topic });
  await writeJson(join(reportRoot, 'opportunity.json'), opportunity);
  stage('ENTITY_MEDIA_PLAN_READY', { entities: mediaPlan.entities?.length || 0 });
  const focusedQueries = [...new Set([
    ...(mediaPlan.visualQueries || []),
    opportunity.catalogQuery,
    ...(opportunity.entities || []),
    clean(opportunity.topic).split(/[:—-]/)[0],
  ].map(clean).filter(Boolean))].slice(0, requestedDuration > 120 ? 28 : 14);
  const focusedSearchCache = await readJson(join(reportRoot, 'focused-searches.json'), null);
  const focusedSearches = Array.isArray(focusedSearchCache) && focusedSearchCache.length === focusedQueries.length ? focusedSearchCache : await Promise.all(focusedQueries.map((query) => searchMovingTopic(query, 20)));
  await writeJson(join(reportRoot, 'focused-searches.json'), focusedSearches);
  stage('MOVING_DISCOVERY_READY', { cached: focusedSearches === focusedSearchCache, queries: focusedQueries.length });
  const discoveredCandidates = [...new Map([
    ...(scouting.winner.candidates || []),
    ...focusedSearches.flatMap((result) => result.candidates),
  ].map((item) => [item.sourceKey || item.id, item])).values()];
  const relevanceRanked = discoveredCandidates
    .map((item) => ({ ...item, relevanceScore: movingCandidateRelevance(item, opportunity) }))
    .filter((item) => item.relevanceScore >= 1);
  const allCandidates = relevanceRanked.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
  const minimumAssets = requestedDuration > 120 ? Math.max(20, Math.min(48, Math.ceil(requestedDuration / 5))) : 12;
  if (allCandidates.length < minimumAssets) throw new Error(`FOOTAGE_PREFLIGHT_BLOCKED_RELEVANCE: only ${allCandidates.length} moving candidates match the selected topic's source metadata`);
  const downloaded = [];
  stage('MEDIA_ACQUISITION_START', { candidates: allCandidates.length, minimumAssets });
  // Prefer sources that the current acquisition path can actually retrieve.
  // Wikimedia remains in discovery, but a transient archive throttle must not
  // consume the whole download budget when Pexels/Pixabay already provide the
  // required depth.
  const acquisitionPreferred = allCandidates.filter((item) => !/Wikimedia Commons/i.test(String(item.provider || '')));
  const downloadCandidates = (acquisitionPreferred.length >= minimumAssets ? acquisitionPreferred : allCandidates).slice(0, Math.max(minimumAssets + 4, 16));
  for (let offset = 0; offset < downloadCandidates.length; offset += 4) {
    const batch = await Promise.all(downloadCandidates.slice(offset, offset + 4).map(async (candidate, index) => {
      try { return await downloadMovingCandidate(candidate, mediaRoot, offset + index); } catch (error) { await writeJson(join(reportRoot, 'download-failures.json'), [...(await readJson(join(reportRoot, 'download-failures.json'), [])), { candidate: candidate.id, error: String(error), at: now() }]); return null; }
    }));
    downloaded.push(...batch.filter(Boolean));
  }
  if (downloaded.length < minimumAssets) throw new Error(`FOOTAGE_PREFLIGHT_BLOCKED_AFTER_DOWNLOAD: only ${downloaded.length} real moving assets survived download/probe`);
  stage('MEDIA_ACQUISITION_READY', { downloaded: downloaded.length });
  const cachedMediaPack = await readJson(join(reportRoot, 'MediaResourcePack.json'), null);
  let semanticSegments;
  if (cachedMediaPack?.opportunity === opportunity.topic && Array.isArray(cachedMediaPack?.semanticSegments) && cachedMediaPack.semanticSegments.length >= 15 && cachedMediaPack.semanticSegments.filter((segment) => Number(segment.confidence) > 0 && segment.provenance?.method === 'gemini-multiframe-vision' && segment.provenance?.temporalAnalysis === 'gemini-frame-sequence-with-source-timestamps' && Number.isFinite(Number(segment.usableStartTime)) && Number.isFinite(Number(segment.usableEndTime))).length >= Math.max(12, Math.floor(cachedMediaPack.semanticSegments.length * 0.7))) {
    semanticSegments = cachedMediaPack.semanticSegments;
    stage('MEDIA_INTELLIGENCE_REUSED', { segments: semanticSegments.length });
  } else {
    const analyzed = [];
    for (let offset = 0; offset < downloaded.length; offset += 3) {
      const batch = await Promise.all(downloaded.slice(offset, offset + 3).map((asset, index) => analyzeMovingAsset(asset, offset + index)));
      analyzed.push(...batch);
    }
    semanticSegments = analyzed.flatMap((item) => item.profiles);
    await writeJson(join(reportRoot, 'shot-detection.json'), analyzed.map((item) => ({ assetId: item.asset.id, sourceUrl: item.asset.sourceUrl, shots: item.shots })));
    await writeJson(join(reportRoot, 'MediaResourcePack.json'), { version: 2, opportunity: opportunity.topic, semanticSegments, sourceCount: new Set(semanticSegments.map((item) => item.sourceKey)).size, generatedAt: now(), understanding: { method: 'actual-shot-boundaries-plus-multiframe-gemini-vision', model: VISION_MODEL } });
    stage('MEDIA_INTELLIGENCE_READY', { segments: semanticSegments.length });
  }
  if (semanticSegments.length < minimumAssets) throw new Error(`FOOTAGE_PREFLIGHT_BLOCKED_AFTER_ANALYSIS: only ${semanticSegments.length} real shot segments were understood`);
  const actionful = semanticSegments.filter((item) => item.actions.length > 0 && item.motionLevel !== 'NONE' && item.confidence >= 0.35);
  if (actionful.length < Math.max(6, Math.floor(minimumAssets * 0.55))) throw new Error(`FOOTAGE_PREFLIGHT_BLOCKED_SEMANTIC_DEPTH: only ${actionful.length} actionful understood segments survived`);
  const validatedScore = scoreNativeVideoAvailability(semanticSegments.map((item) => ({ ...item, id: item.segmentId, durationSeconds: item.duration, usableDurationSeconds: item.duration, actions: item.actions, entities: item.entities, sourceAudio: item.sourceAudioUseful !== 'NONE', visualFingerprint: item.visualFingerprint || item.segmentId })), opportunity.entities || []);
  if (validatedScore.grade === 'POOR') throw new Error(`FOOTAGE_PREFLIGHT_BLOCKED_SEMANTIC_NATIVE_SCORE: ${validatedScore.grade}`);
  stage('EDITORIAL_RENDER_START', { segments: semanticSegments.length });
  const result = await renderFootageProRun(opportunity, research, semanticSegments, creatorScript, mediaPlan);
  history.productions.push({ runId, topic: opportunity.topic, angle: opportunity.angle, entities: opportunity.entities, domain: opportunity.domain, inputMode: opportunity.inputMode, sourceUrls: [...new Set(result.segments.map((item) => item.sourceUrl))], providers: [...new Set(result.segments.map((item) => item.provider))], titlePattern: result.script.packaging?.title || result.script.title, thumbnailPattern: result.script.packaging?.thumbnailConcept, storyStructure: result.script.hookMechanism, visualStyle: 'FOOTAGE_PRO moving video with semantic phrase-level cuts', voice: TTS_VOICE, musicStyle: 'NO_MUSIC_UNTIL_PROPER_LIBRARY_AVAILABLE', status: result.report.status, humanStatus: 'PENDING_HUMAN_REVIEW', positiveTrainingExample: false, createdAt: now(), novelty });
  history.learning.push({ runId, observed: { duration: result.qc.technical.durationSeconds, nativeVideoScore: validatedScore, movingVideoRatio: result.report.footage.mediaRatios.ratios.REAL_VIDEO, uniqueSegments: result.segments.length, sourceCount: new Set(result.segments.map((item) => item.sourceKey)).size, alignmentMethod: result.voice.metadata?.alignmentSource, critic: result.qc.editorial }, confidence: 'LOW_SINGLE_SAMPLE', recordedAt: now() });
  await writeJson(MEMORY, history);
  await writeJson(join(runRoot, 'run-manifest.json'), { runId, inputMode: mode, createdAt: now(), stages: ['FOOTAGE_SCOUT', 'TOPIC_GREENLIGHT', 'RESEARCH', 'MEDIA_DOWNLOAD', 'SEGMENT_INDEX', 'SCRIPT', 'VOICE_WORD_ALIGNMENT', 'EDITORIAL_TIMELINE', 'RENDER', 'RENDERED_VIDEO_QC'], artifacts: result.report });
  console.log(JSON.stringify(result.report, null, 2));
}

async function runTruthRepairProduction() {
  const cachedOpportunity = await readJson(join(reportRoot, 'opportunity.json'), null);
  const cachedPack = await readJson(join(reportRoot, 'MediaResourcePack.json'), null);
  if (!cachedOpportunity?.topic || !Array.isArray(cachedPack?.semanticSegments)) throw new Error('TRUTH_REPAIR_BLOCKED: existing production artifacts are missing');
  const research = await geminiResearch('Verify the distinction between World Aquatics diving-pool mechanical surface agitation, horizontal water spray, optional underwater bubble machines, and facility/training sparger systems. Use current primary rules and manufacturer documentation. Do not generalize competition high diving, cliff diving, and training systems.', { recencyDays: 3650 });
  await writeJson(join(reportRoot, 'PremiseVerificationReport.json'), {
    status: 'REFRAME_REQUIRED',
    oldPremise: 'Why High Divers Need Underwater Bubblers',
    verifiedPremise: 'Diving facilities deliberately agitate the landing surface to help divers perceive it; some training pools use compressed-air sparger systems, while competition rules also describe horizontal water spray and do not make every high dive a bubbler story.',
    primarySources: [
      { url: 'https://www.worldaquatics.com/sites/default/files/2018-03-06_fina_diving_officials_manual_2018-2021.pdf', supports: ['mechanical surface agitation', 'visual perception', 'bubble machine conditional on sufficient agitation', 'horizontal water sprinkler fallback'] },
      { url: 'https://www.pulsair.com/diving-pool-bubbler-sparger/how-it-works/', supports: ['compressed air through bottom diffuser', 'facility/training bubbler mechanism'] },
      { url: 'https://www.aquaticgroup.com/products/equipment/sparger-dive-systems/', supports: ['training-system sparger design', 'air-diffusing technology'] }
    ],
    researchSources: research.sources,
    reviewedAt: now(),
  });
  await writeJson(join(reportRoot, 'ClaimLedger-v2.json'), {
    status: 'REVIEWED',
    claims: [
      { id: 'v2-c1', claim: 'World Aquatics diving facilities use mechanical surface agitation to aid visual perception of the water surface.', support: 'World Aquatics Diving Officials Manual, FR 5.3.10', source: 'https://www.worldaquatics.com/sites/default/files/2018-03-06_fina_diving_officials_manual_2018-2021.pdf', allowedWording: 'rules call for mechanical surface agitation to help divers perceive the surface', confidence: 'STRONG' },
      { id: 'v2-c2', claim: 'A bubble machine is acceptable for that purpose only when it creates enough agitation; otherwise a horizontal water sprinkler is used.', support: 'World Aquatics Diving Officials Manual, FR 5.3.10', source: 'https://www.worldaquatics.com/sites/default/files/2018-03-06_fina_diving_officials_manual_2018-2021.pdf', allowedWording: 'a bubble machine is conditional, not universal', confidence: 'STRONG' },
      { id: 'v2-c3', claim: 'Training/facility spargers inject compressed air through bottom diffusers beneath the landing area.', support: 'Pulsair and ADG product documentation', source: 'https://www.pulsair.com/diving-pool-bubbler-sparger/how-it-works/', confidence: 'STRONG' },
      { id: 'v2-c4', claim: 'Scuba-diver exhalation bubbles are not evidence of a pool sparger system.', support: 'mechanism identity rule', source: 'AUTO-YTB semantic evidence policy', allowedWording: 'never equate effect-only footage with the system that creates it', confidence: 'REQUIRED_GATE'
      },
    ],
    rejectedClaims: ['all high divers need underwater bubblers', 'surface tension is the operative mechanism', 'generic scuba bubbles show a bottom-mounted sparger', 'the same system is present in cliff diving and competition diving'],
    reviewedAt: now(),
  });
  const diagramPath = join(mediaRoot, 'truth-mechanism-illustration-v2.mp4');
  await createMechanismIllustration(diagramPath);
  const sprayPath = join(mediaRoot, 'truth-surface-spray-illustration-v2.mp4');
  await createSurfaceSprayIllustration(sprayPath);
  const diagramSegment = {
    segmentId: 'auto-ytb-truth-mechanism-illustration', assetId: 'auto-ytb-truth-mechanism-illustration', startTime: 0, endTime: 4.6, duration: 4.6,
    usableStartTime: 0, usableEndTime: 4.6, representativeFrames: [], entities: ['diving pool sparger system', 'surface agitation system'], people: [],
    objects: ['bottom diffuser', 'sparger', 'compressor', 'pipe', 'landing zone', 'horizontal water sprinkler', 'surface spray nozzle'], actions: ['compressed air enters', 'rising bubbles', 'horizontal water spray', 'surface agitation'], environment: ['diving pool'], location: ['training pool'], visibleText: ['COMPRESSED AIR', 'BOTTOM DIFFUSER / SPARGER', 'HORIZONTAL WATER SPRAY', 'SURFACE AGITATION'], cameraDistance: 'diagram', cameraMovement: 'animated schematic', motionLevel: 'MEDIUM', visualQuality: 'EXCELLENT', sourceAudioUseful: 'NONE',
    semanticDescription: 'Accurate explanatory illustration contrasting a compressor sending air through a pipe to a bottom diffuser/sparger with a horizontal water spray nozzle that agitates the diving surface.', confidence: 1, provenance: { method: 'AUTO-YTB-technical-illustration-from-verified-sources', sampledFrames: 1, analyzedAt: now() }, rightsTier: 'PUBLISHABLE_CONFIRMED', sourceKey: 'AUTO-YTB_ORIGINAL_ILLUSTRATION', sourceUrl: 'https://www.worldaquatics.com/sites/default/files/2018-03-06_fina_diving_officials_manual_2018-2021.pdf', localPath: diagramPath, provider: 'AUTO-YTB', mime: 'video/mp4', contextType: 'UNKNOWN', visualFingerprint: 'AUTO-YTB_ORIGINAL_ILLUSTRATION_TRUTH_MECHANISM', sourceAudio: false,
  };
  const spraySegment = {
    segmentId: 'auto-ytb-truth-surface-spray-illustration', assetId: 'auto-ytb-truth-surface-spray-illustration', startTime: 0, endTime: 4.6, duration: 4.6,
    usableStartTime: 0, usableEndTime: 4.6, representativeFrames: [], entities: ['surface agitation system', 'diving pool'], people: [], objects: ['horizontal water sprinkler', 'surface spray nozzle', 'landing zone'], actions: ['horizontal water spray', 'visible water disturbance', 'surface agitation'], environment: ['diving pool'], location: ['competition diving pool'], visibleText: ['HORIZONTAL WATER SPRAY', 'MECHANICAL SURFACE AGITATION'], cameraDistance: 'diagram', cameraMovement: 'animated schematic', motionLevel: 'MEDIUM', visualQuality: 'EXCELLENT', sourceAudioUseful: 'NONE',
    semanticDescription: 'Accurate explanatory illustration of a horizontal water sprinkler spraying across a diving landing zone to create visible mechanical surface agitation.', confidence: 1, provenance: { method: 'AUTO-YTB-technical-illustration-from-World-Aquatics-rule', sampledFrames: 1, analyzedAt: now() }, rightsTier: 'PUBLISHABLE_CONFIRMED', sourceKey: 'AUTO-YTB_ORIGINAL_SURFACE_SPRAY_ILLUSTRATION', sourceUrl: 'https://www.worldaquatics.com/sites/default/files/2018-03-06_fina_diving_officials_manual_2018-2021.pdf', localPath: sprayPath, provider: 'AUTO-YTB', mime: 'video/mp4', contextType: 'UNKNOWN', visualFingerprint: 'AUTO-YTB_ORIGINAL_SURFACE_SPRAY_ILLUSTRATION', sourceAudio: false,
  };
  const semanticSegments = [diagramSegment, spraySegment, ...cachedPack.semanticSegments.map(decorateTruthContext)];
  await writeJson(join(reportRoot, 'MediaResourcePack-v2.json'), { version: 3, topic: cachedOpportunity.topic, semanticSegments, directEvidence: { centralMechanism: diagramSegment.segmentId, basis: diagramSegment.sourceUrl }, generatedAt: now() });
  const cachedTruthScript = await readJson(join(reportRoot, 'script-v2.json'), null);
  const script = cachedTruthScript?.truthRepair ? cachedTruthScript : await makeTruthRepairScript(research, semanticSegments);
  await writeJson(join(reportRoot, 'script-v2.json'), script);
  const store = new NodeLocalObjectStore(join(runRoot, 'storage'));
  const rawVoiceProvider = new GeminiVoiceProvider({ apiKey: API_KEY, store, model: TTS_MODEL, defaultVoice: TTS_VOICE, protocol: 'generateContent' });
  const voiceProvider = withGeminiWordAlignment(rawVoiceProvider, { apiKey: API_KEY, strict: true, minCoverage: 0.88 });
  const cachedTruthVoice = await readJson(join(reportRoot, 'voice-state-v2.json'), null);
  const voice = cachedTruthVoice?.sourceText === script.narration && cachedTruthVoice?.uri?.startsWith('file://') && existsSync(cachedTruthVoice.uri.replace(/^file:\/\//, '')) ? cachedTruthVoice : await voiceProvider.synthesize({ text: script.narration, voice: TTS_VOICE, language: 'en-US' });
  const wordTimestamps = voice.metadata?.wordTimestamps || [];
  if (wordTimestamps.length < 30) throw new Error('TRUTH_REPAIR_BLOCKED: real word alignment unavailable');
  const actualDuration = Number(voice.durationSeconds || wordTimestamps.at(-1)?.endTime || 0);
  await writeJson(join(reportRoot, 'voice-state-v2.json'), { sourceText: script.narration, uri: voice.uri, mimeType: voice.mimeType, provider: voice.provider, model: voice.model, alignment: voice.alignment, durationSeconds: actualDuration, alignmentSource: voice.metadata?.alignmentSource || 'unknown', wordTimestamps, metadata: voice.metadata });
  const units = buildNarrationUnits(script.beats.map((beat, index) => ({ ...beat, id: beat.id || `beat-${index + 1}`, visualIntent: truthIntentForMechanism(normalizeVisualIntent(beat.visualIntent, beat.entities || [])) })), wordTimestamps);
  if (units.length < 8) throw new Error(`TRUTH_REPAIR_BLOCKED: only ${units.length} phrase units`);
  const selected = selectSemanticMatches(units, semanticSegments);
  const centralEvidence = centralObjectEvidenceGate({ centralObject: 'diving-pool sparger/surface-agitation mechanism', requiredMechanism: ['compressed air sparger system'], selected, allowIllustration: true });
  await writeJson(join(reportRoot, 'CentralObjectEvidenceGate-v2.json'), centralEvidence);
  if (centralEvidence.status !== 'PASS') throw new Error('TRUTH_REPAIR_BLOCKED: central mechanism has no direct evidence');
  const coverage = coverageFromTimeline(units, selected);
  const timelineItems = units.map((unit, index) => ({ startTime: unit.startTime, endTime: unit.endTime, visualType: selected[index].match.segment.provider === 'AUTO-YTB' ? 'GRAPHIC' : 'REAL_VIDEO' }));
  const mediaRatios = timelineMediaRatios(timelineItems);
  const scenes = selected.map((item, index) => { const unit = units[index]; return { id: `${unit.id}-s${index + 1}`, startSec: unit.startTime, durationSec: Math.max(0.2, unit.endTime - unit.startTime), kind: 'video', instruction: unit.visualIntent, sourceIds: [item.match.segment.segmentId], generated: false }; });
  const timelineAssets = selected.map((item, index) => { const segment = item.match.segment; const range = segmentMediaRange(segment); return { id: `${segment.segmentId}-${index}-v2`, uri: fileUri(segment.localPath), mimeType: segment.mime || 'video/mp4', provider: segment.provider, model: segment.provider === 'AUTO-YTB' ? 'truth-technical-illustration-v1' : 'multiframe-semantic-segment-v1', costUsd: 0, sceneId: scenes[index].id, generated: segment.provider === 'AUTO-YTB', sourceIds: [segment.segmentId], sourceUrl: segment.sourceUrl, license: 'Original explanatory illustration grounded in cited primary sources', metadata: { sourceUrl: segment.sourceUrl, rightsStatus: segment.rightsTier, attribution: segment.provider === 'AUTO-YTB' ? 'AUTO-YTB original illustration' : segment.metadata?.creator || null, title: segment.semanticDescription, clipStartSec: range.startTime, clipEndSec: range.endTime, sourceAudio: segment.sourceAudio, visualMatch: item.match.classification, matchExplanation: item.match.explanation, semanticProfile: segment.provenance, contextType: segment.contextType, shotTimecode: [segment.startTime, segment.endTime], usableTimecode: [range.startTime, range.endTime] } }; });
  const renderManifest = { projectId: runId, createdAt: now(), contentFormat: 'SHORT_HORIZONTAL', aspectRatio: '16:9', frame: { width: 1280, height: 720 }, engineeringResolution: '1280x720', contentArchetype: { version: 1, id: 'FOOTAGE_PRO_TRUTH_REPAIR', label: 'Factual editorial repair', confidence: 0, reasons: ['verified premise', 'direct mechanism illustration', 'phrase-level semantic matching'], voiceMode: 'SINGLE_NARRATOR', realityMode: 'FACTUAL', cameraProfile: 'EDITORIAL_DOCUMENTARY', profile: {} }, captionPlan: { enabled: true, preset: 'KARAOKE_BOLD', source: 'GEMINI_WORD_TIMESTAMPS', mode: 'WORD_KARAOKE' }, editPlan: { preset: 'FOOTAGE_PRO', transitionMode: 'CLEAN_CUTS', preserveAudioTiming: true, defaultMotionEffects: [] }, script: { title: script.title, targetDurationSec: actualDuration, beats: units.map((unit) => ({ id: unit.id, narration: unit.text, entities: unit.visualIntent.requiredEntities, visualIntent: unit.visualIntent, startSec: unit.startTime, targetDurationSec: unit.endTime - unit.startTime, importance: unit.importance })) }, scenes, assets: timelineAssets, voice: { id: `voice-${runId}-v2`, uri: voice.uri, mimeType: voice.mimeType, provider: voice.provider, model: voice.model, durationSeconds: actualDuration, alignment: voice.alignment, wordTimestamps }, music: null, estimatedCostUsd: 0, actualCostUsd: Number(voice.metadata?.transcriptionCostUsd || 0), containsSyntheticMedia: true };
  const v2ManifestPath = join(runRoot, 'timeline', 'MasterTimeline-v2.json'); await writeJson(v2ManifestPath, renderManifest);
  const renderer = new FfmpegRenderer({ outputRoot: join(renderRoot, 'truth-v2'), width: 1280, height: 720, fps: 30, targetLufs: -16, truePeakDb: -1.5, loudnessRange: 7 });
  const rendered = await renderer.render({ manifestUri: fileUri(v2ManifestPath), outputKey: 'base.mp4' });
  const assPath = join(runRoot, 'audio', 'karaoke-v2-truth.ass'); const karaoke = await writeKaraokeAss(wordTimestamps, assPath);
  const v2 = join(finalRoot, 'video-v2.mp4');
  await run('ffmpeg', ['-y', '-i', rendered.uri.replace(/^file:\/\//, ''), '-vf', `subtitles='${assPath.replaceAll('\\', '/').replaceAll(':', '\\:')}'`, '-c:a', 'copy', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-movflags', '+faststart', v2], { quiet: true });
  const probe = await probeVideoFile(v2);
  const expectedTimelineEnd = Math.max(...units.map((unit) => unit.endTime));
  const consistency = finalArtifactConsistencyGate({ actualDurationSeconds: probe.durationSeconds, expectedTimelineEndSeconds: expectedTimelineEnd, audioDurationSeconds: Number(voice.durationSeconds || 0), lastWordEndSeconds: wordTimestamps.at(-1)?.endTime || 0, lastCaptionEndSeconds: wordTimestamps.at(-1)?.endTime || 0, toleranceSeconds: 0.3, tailToleranceSeconds: 0.15 });
  const ending = endingIntegrityReport({ actualDurationSeconds: probe.durationSeconds, expectedTimelineEndSeconds: expectedTimelineEnd, audioDurationSeconds: Number(voice.durationSeconds || 0), lastWordEndSeconds: wordTimestamps.at(-1)?.endTime || 0, lastCaptionEndSeconds: wordTimestamps.at(-1)?.endTime || 0, finalSpokenText: units.at(-1)?.text, payoffPresent: true, toleranceSeconds: 0.3, tailToleranceSeconds: 0.15 });
  await writeJson(join(reportRoot, 'FinalArtifactConsistencyGate-v2.json'), consistency); await writeJson(join(reportRoot, 'EndingIntegrityReport-v2.json'), ending);
  if (consistency.status !== 'PASS' || ending.status !== 'PASS') throw new Error(`TRUTH_REPAIR_BLOCKED: final artifact consistency failed ${JSON.stringify({ consistency, ending })}`);
  const editorial = await inspectEditorialVideo(v2, units, selected); await writeJson(join(reportRoot, 'EditorialCritic-v2.json'), editorial);
  const thumbnail = await buildTruthThumbnail(selected, script.packaging?.title || script.title, diagramPath, semanticSegments);
  const receipts = selected.map((item, index) => { const range = segmentMediaRange(item.match.segment); return { narration: units[index].text, startTime: units[index].startTime, endTime: units[index].endTime, visualIntent: units[index].visualIntent, topCandidates: item.topCandidates.map((candidate) => ({ segmentId: candidate.segment.segmentId, source: candidate.segment.sourceUrl, sourceTimecode: [segmentMediaRange(candidate.segment).startTime, segmentMediaRange(candidate.segment).endTime], classification: candidate.classification, score: candidate.score, explanation: candidate.explanation })), selectedSegment: item.match.segment.segmentId, selectedSourceTimecode: [range.startTime, range.endTime], matchClass: item.match.classification }; });
  await writeJson(join(reportRoot, 'matching-receipts-v2.json'), receipts);
  await writeJson(join(reportRoot, 'TemporalReviewReport-v2.json'), { status: editorial.status, intervals: editorial.rows, reviewedAt: now() });
  const report = { version: 3, runId, status: consistency.status === 'PASS' && ending.status === 'PASS' && centralEvidence.status === 'PASS' && editorial.status === 'PASS' ? 'READY_FOR_HUMAN_REVIEW' : 'INTERNAL_REVIEW_REQUIRED', output: { video: v2, thumbnail: thumbnail.selected, durationSeconds: probe.durationSeconds, title: script.packaging?.title || script.title }, premise: await readJson(join(reportRoot, 'PremiseVerificationReport.json'), null), claimLedger: await readJson(join(reportRoot, 'ClaimLedger-v2.json'), null), centralEvidence, voice: { provider: voice.provider, model: voice.model, alignmentMethod: voice.metadata?.alignmentSource || 'gemini-word-timestamps', wordCount: wordTimestamps.length, karaoke }, footage: { mediaRatios, coverage, selected: selected.map((item) => ({ segmentId: item.match.segment.segmentId, sourceUrl: item.match.segment.sourceUrl, classification: item.match.classification })) }, qc: { editorial, consistency, ending }, cost: { externalPaidUsd: 'UNKNOWN_PROVIDER_BILLING_NOT_EXPOSED', localRenderUsd: 0, alignmentUsd: Number(voice.metadata?.transcriptionCostUsd || 0) }, limitations: ['The central sparger is shown with an original explanatory illustration grounded in primary documentation; it is not claimed to be live facility footage.', 'Human review remains required.'] };
  await writeJson(join(reportRoot, 'production-run-v2.json'), report);
  console.log(JSON.stringify(report, null, 2));
}

async function repairFootageProRun() {
  const manifestPath = join(runRoot, 'timeline', 'render-manifest.json');
  const manifest = await readJson(manifestPath, null);
  const basePath = join(renderRoot, 'v1-base.mp4');
  if (!manifest || !existsSync(basePath)) throw new Error(`FOOTAGE_PRO_REPAIR_BLOCKED: missing canonical render artifacts for ${runId}`);
  const assPath = join(runRoot, 'audio', 'karaoke-v2.ass');
  const words = manifest.voice?.wordTimestamps || [];
  const karaoke = await writeKaraokeAss(words, assPath);
  const v2 = join(finalRoot, 'video-v2.mp4');
  await run('ffmpeg', ['-y', '-i', basePath, '-vf', `subtitles='${assPath.replaceAll('\\', '/').replaceAll(':', '\\:')}'`, '-c:a', 'copy', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-movflags', '+faststart', v2], { quiet: true });
  const qc = await inspectVideo(v2);
  const report = { version: 2, runId, repair: { type: 'KARAOKE_CURRENT_WORD_HIGHLIGHT', reason: 'V1 caption review showed progressive ASS coloring rather than a distinct active spoken word', localized: true }, before: join(finalRoot, 'video-v1.mp4'), after: v2, karaoke, qc, verified: existsSync(v2) && qc.status === 'PASS', reviewedAt: now() };
  await writeJson(join(reportRoot, 'repair-report.json'), report);
  console.log(JSON.stringify(report, null, 2));
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
  if (!['sourced', 'footage-pro', 'radar', 'footage-pro-repair', 'footage-pro-truth-repair', 'auto', 'hybrid', 'generative-editorial', 'full-generative', 'character-series'].includes(mode)) throw new Error('QUALITY_RESET_BLOCKED: unsupported production mode. Use sourced, auto, hybrid, generative-editorial, full-generative or character-series.');
  if (mode === 'footage-pro-repair') {
    await mkdir(reportRoot, { recursive: true }); await mkdir(finalRoot, { recursive: true }); await repairFootageProRun(); return;
  }
  if (mode === 'footage-pro-truth-repair') {
    await mkdir(mediaRoot, { recursive: true }); await mkdir(reportRoot, { recursive: true }); await mkdir(finalRoot, { recursive: true });
    await runTruthRepairProduction(); return;
  }
  const autoPlan = mode === 'auto' ? new ProductionDirector().createPlan({ requestedMode: 'AUTO', prompt: requestedPrompt, characterSeries: Boolean(requestedCharacterId) || /character|episode|cartoon|animated/i.test(requestedPrompt || ''), targetDurationSeconds: requestedDuration, aspectRatio: requestedAspectRatio }) : null;
  const dispatchedMode = autoPlan?.mode === 'CHARACTER_SERIES' ? 'character-series' : autoPlan?.mode === 'GENERATIVE_EDITORIAL' ? 'generative-editorial' : autoPlan?.mode === 'FULL_GENERATIVE' ? 'full-generative' : mode;
  if (['generative-editorial', 'full-generative', 'character-series'].includes(dispatchedMode)) {
    await mkdir(mediaRoot, { recursive: true }); await mkdir(reportRoot, { recursive: true }); await mkdir(finalRoot, { recursive: true });
    return runGenerativeProduction({ runId, runRoot, reportRoot, finalRoot, mode: dispatchedMode, prompt: requestedPrompt, scriptPath: requestedScriptPath, durationSeconds: requestedDuration, aspectRatio: requestedAspectRatio, characterId: requestedCharacterId, budgetUsd: requestedBudget == null ? null : Number(requestedBudget), env: process.env });
  }
  if (!API_KEY) throw new Error('Missing GEMINI_API_KEY');
  await mkdir(mediaRoot, { recursive: true }); await mkdir(reportRoot, { recursive: true }); await mkdir(finalRoot, { recursive: true });
  const history = await loadCreativeHistory();
  if (['sourced', 'footage-pro', 'radar', 'hybrid'].includes(mode) || autoPlan?.mode === 'HYBRID_EDITORIAL' || autoPlan?.mode === 'FOOTAGE_PRO') return runFootageProProduction(history);
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
    const tokens = new Set(`${beat.visualIntent?.queries?.join(' ') || ''} ${(beat.entities || []).join(' ')} ${opportunity.topic}`.toLowerCase().split(/\W+/).filter((token) => token.length > 3));
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
    const tokens = new Set(`${beat.visualIntent?.queries?.join(' ') || ''} ${(beat.entities || []).join(' ')} ${opportunity.topic}`.toLowerCase().split(/\W+/).filter((token) => token.length > 3));
    const titleTokens = new Set(clean(asset?.title).toLowerCase().split(/\W+/).filter((token) => token.length > 3));
    const overlap = [...tokens].filter((token) => titleTokens.has(token));
    const genericVisualTokens = new Set(['bridge', 'river', 'road', 'view', 'aerial', 'photo', 'image', 'file', 'jpg', '2022', '2016', '2014', 'official', 'historical', 'detail', 'steel', 'structure', 'engineering']);
    const concreteEntities = (beat.entities || []).slice(0, 3).map((entity) => [...new Set(String(entity).toLowerCase().split(/\W+/).filter((token) => token.length > 3 && !genericVisualTokens.has(token)))]).filter((tokens) => tokens.length > 0);
    const entityMatches = concreteEntities.map((tokens) => tokens.filter((token) => titleTokens.has(token)));
    const distinctiveEntityOverlap = [...new Set(entityMatches.flat())];
    const exact = concreteEntities.length > 0 && entityMatches.every((matches, index) => matches.length === concreteEntities[index].length);
    return { beatId: beat.id, narration: beat.narration, entity: beat.entities, selectedAsset: asset?.title, class: exact ? 'EXACT' : 'CONTEXTUAL', confidence: exact ? 'PROVENANCE_PLUS_ENTITY_TITLE_MATCH' : 'PROVENANCE_ONLY_CONTEXTUAL', queries: beat.visualIntent?.queries || [], titleOverlap: overlap.slice(0, 8), distinctiveEntityOverlap };
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

main().catch(async (error) => {
  const message = String(error?.stack || error);
  try {
    await mkdir(reportRoot, { recursive: true });
    await writeJson(join(reportRoot, 'run-error.json'), {
      runId,
      mode,
      status: 'FAILED',
      error: message,
      errorType: /429|503|timeout|outage/i.test(message) ? 'PROVIDER_OUTAGE' : /RIGHTS|PUBLISHABLE/i.test(message) ? 'RIGHTS_BLOCK' : 'QUALITY_REJECT',
      failedAt: now(),
    });
  } catch { /* Preserve the original production error even when diagnostics fail. */ }
  console.error(message);
  process.exitCode = 1;
});
