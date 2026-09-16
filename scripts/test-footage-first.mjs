import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  activeKaraokeWord,
  analyzeReferenceStyle,
  buildKaraokeChunks,
  classifyCreativeHistory,
  evaluateFootagePro,
  evaluateTopicGreenlight,
  scoreNativeVideoAvailability,
  searchPexelsVideo,
  searchPixabayVideo,
  searchWikimediaVideo,
  validateWordAlignment,
} from '../packages/production/dist/index.js';

const video = Array.from({ length: 16 }, (_, index) => ({ id: `v${index}`, provider: index % 2 ? 'Pexels' : 'Pixabay', sourceKey: `source-${index % 4}`, rightsTier: 'PUBLISHABLE_WITH_ATTRIBUTION', durationSeconds: 5, usableDurationSeconds: 5, width: 1920, height: 1080, sourceAudio: index < 6, actions: [`action-${index % 5}`], entities: ['chosen-entity'], visualFingerprint: `fingerprint-${index}` }));
const score = scoreNativeVideoAvailability(video, ['chosen-entity']);
assert.equal(score.publishableCandidateCount, 16);
assert.equal(score.sourceCount, 4);
assert.equal(score.exactEntityCandidateCount, 16);
assert.notEqual(score.grade, 'POOR');

const passed = evaluateFootagePro({ mode: 'FOOTAGE_PRO', targetDurationSeconds: 40, movingVideoSeconds: 60, stillImageSeconds: 0, candidates: video, requiredEntities: ['chosen-entity'], topicGreenlit: true, wordAlignmentAvailable: true });
assert.equal(passed.passed, true);
const rejected = evaluateFootagePro({ mode: 'FOOTAGE_PRO', targetDurationSeconds: 60, movingVideoSeconds: 10, stillImageSeconds: 50, candidates: video.slice(0, 2), topicGreenlit: false, wordAlignmentAvailable: false, defaultMotionEffectDetected: true });
assert.equal(rejected.passed, false);
assert.ok(rejected.blockers.some((item) => item.includes('moving-video ratio')));
assert.ok(rejected.blockers.some((item) => item.includes('fake motion')));
assert.equal(evaluateTopicGreenlight({ topic: 'good', hookStrength: 85, viewerPromiseClarity: 85, storyProgression: 80, visualAction: 90, thumbnailStrength: 75, nativeVideo: score }).passed, true);
assert.equal(evaluateTopicGreenlight({ topic: 'bad', hookStrength: 30, viewerPromiseClarity: 40, storyProgression: 20, visualAction: 20, thumbnailStrength: 30, nativeVideo: { ...score, grade: 'POOR' }, historicalSimilarity: 0.8 }).passed, false);

const words = [
  { word: 'This', startTime: 0, endTime: 0.3, confidence: 0.99 },
  { word: 'is', startTime: 0.3, endTime: 0.5, confidence: 0.99 },
  { word: 'real', startTime: 0.5, endTime: 0.9, confidence: 0.98 },
];
assert.equal(validateWordAlignment(words), true);
const chunks = buildKaraokeChunks(words, 5);
assert.equal(activeKaraokeWord(chunks[0], 0.6), 2);

const style = analyzeReferenceStyle('reference-1', [{ startSeconds: 0, endSeconds: 2, visualKind: 'VIDEO', captions: { wordCount: 4 }, sourceAudio: true }, { startSeconds: 2, endSeconds: 4.5, visualKind: 'VIDEO', captions: { wordCount: 5 } }], 4.5);
assert.equal(style.shotCount.value, 2);
assert.equal(style.footageRatio.value, 1);
assert.equal(style.medianShotDurationSeconds.value, 2.25);
assert.equal(style.durationSeconds.provenance, 'MEASURED');

const negative = classifyCreativeHistory(0, ['SLIDESHOW']);
assert.equal(negative.trainingRole, 'NEGATIVE_FIXTURE_ONLY');
assert.equal(negative.positiveTrainingExample, false);

const pexels = await searchPexelsVideo('people racing', { apiKey: 'test', fetchFn: async () => new Response(JSON.stringify({ total_results: 1, videos: [{ id: 1, url: 'https://pexels.example/1', duration: 8, width: 1920, height: 1080, user: { name: 'Creator' }, video_files: [{ link: 'https://cdn.example/1.mp4', file_type: 'video/mp4', width: 1920, height: 1080 }] }] })) });
assert.equal(pexels.candidates[0].provider, 'Pexels');
const pixabay = await searchPixabayVideo('people racing', { apiKey: 'test', fetchFn: async () => new Response(JSON.stringify({ totalHits: 1, hits: [{ id: 2, pageURL: 'https://pixabay.example/2', duration: 6, user: 'Creator', videos: { large: { url: 'https://cdn.example/2.mp4', width: 1920, height: 1080 } } }] })) });
assert.equal(pixabay.candidates[0].provider, 'Pixabay');
const wikimedia = await searchWikimediaVideo('factory machine', { fetchFn: async () => new Response(JSON.stringify({ query: { pages: { one: { pageid: 3, title: 'File:Machine.webm', imageinfo: [{ url: 'https://commons.example/3.webm', mime: 'video/webm', width: 1920, height: 1080, extmetadata: { LicenseShortName: { value: 'CC BY 4.0' } } }] } } } })) });
assert.equal(wikimedia.candidates[0].provider, 'Wikimedia Commons');

const renderer = await readFile('packages/runtime-node/index.mjs', 'utf8');
assert.equal(renderer.includes('noise=alls='), false);
assert.equal(renderer.includes('xMotion'), false);
assert.equal(renderer.includes('yMotion'), false);
console.log('✓ footage-first preflight, native video scoring, word karaoke, provider adapters, and no-fake-motion guard pass');
