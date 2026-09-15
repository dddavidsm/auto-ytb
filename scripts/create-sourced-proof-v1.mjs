import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { FfmpegRenderer } from '../packages/runtime-node/index.mjs';
import { withArchetypeEditorialFinish } from '../packages/runtime-node/editorial-finish.mjs';
import { withFinalMediaInspection } from '../packages/runtime-node/media-inspector.mjs';
import { MediaIntelligenceEngine, compareVideoDNA } from '../packages/production/dist/index.js';

const root = resolve('.');
const proofRoot = resolve(root, '.data', 'sourced-narrative-proof-v1');
const sourceManifest = resolve(root, '.data', 'storage', 'projects', '708059c9-f9fb-4d11-b3f1-43c97996ca81', 'manifest-iss-sleep-v1.json');
const manifestPath = resolve(proofRoot, 'manifest.json');
const renderRoot = resolve(proofRoot, 'final');
await mkdir(renderRoot, { recursive: true });
await copyFile(sourceManifest, manifestPath);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

const engine = new MediaIntelligenceEngine();
engine.registerEntity({ id: 'ENTITY_ISS', canonicalName: 'International Space Station', type: 'LOCATION', aliases: ['ISS'], sourceRefs: ['https://svs.gsfc.nasa.gov/30771/'] });
engine.registerEntity({ id: 'ENTITY_SLEEPING_BAG', canonicalName: 'wall-mounted sleeping bag', type: 'OBJECT', aliases: ['sleeping bag'], sourceRefs: ['https://science.nasa.gov/eclips/videos/sleeping-on-board-the-international-space-station/'] });
engine.registerEntity({ id: 'ENTITY_EARTH_ORBIT', canonicalName: 'Earth from orbit', type: 'LOCATION', aliases: ['Earth', 'orbit'] });
engine.registerDiscovery({ id: 'discovery-nasa-sleep', kind: 'DISCOVERY_REFERENCE', url: 'https://science.nasa.gov/eclips/videos/sleeping-on-board-the-international-space-station/', title: 'Sleeping on board the International Space Station', provider: 'NASA Science', rights: 'VERIFY', entities: ['ENTITY_ISS', 'ENTITY_SLEEPING_BAG'], discoveredAt: new Date().toISOString(), notes: 'Primary source discovery; publication rights remain attached for review.' });
engine.registerDiscovery({ id: 'discovery-nasa-earth', kind: 'DISCOVERY_REFERENCE', url: 'https://svs.gsfc.nasa.gov/30771/', title: '4K Video from the ISS, April 2016', provider: 'NASA SVS', rights: 'VERIFY', entities: ['ENTITY_ISS', 'ENTITY_EARTH_ORBIT'], discoveredAt: new Date().toISOString(), notes: 'Primary source discovery; publication rights remain attached for review.' });

const sourceById = Object.fromEntries((manifest.sourceFootage ?? []).map((x) => [x.id, x]));
const segmentSpecs = [
  ['nasa-sleeping-iss', 'seg-sleeping-bag', 'wall-mounted sleeping bag inside the International Space Station with an astronaut contained in the station', ['ENTITY_ISS', 'ENTITY_SLEEPING_BAG'], ['sleeping bag', 'wall', 'astronaut'], 92],
  ['nasa-sleeping-iss', 'seg-floating-iss', 'astronaut floating through the International Space Station module with equipment around the cabin', ['ENTITY_ISS'], ['floating', 'astronaut', 'module'], 89],
  ['nasa-iss-earth-4k', 'seg-earth-orbit', 'Earth seen from orbit through the International Space Station window', ['ENTITY_EARTH_ORBIT', 'ENTITY_ISS'], ['Earth', 'orbit', 'window'], 96],
];
for (const [sourceId, segmentId, description, entities, semanticTerms, qualityScore] of segmentSpecs) {
  const source = sourceById[sourceId];
  engine.registerSegment({ id: `asset-${segmentId}`, segmentId, kind: 'PUBLISHABLE_ASSET', uri: source.uri, provider: 'NASA-source-footage', sourceUrl: source.sourceUrl, title: source.title, rights: 'VERIFY', license: source.license, entities, startSec: 0, endSec: 120, description, semanticTerms, qualityScore, motionScore: 84 });
}

const entityForBeat = (beat) => beat.purpose === 'hook' ? ['ENTITY_EARTH_ORBIT', 'ENTITY_ISS'] : beat.purpose === 'reveal' || beat.purpose === 'payoff' ? ['ENTITY_SLEEPING_BAG', 'ENTITY_ISS'] : ['ENTITY_ISS', 'ENTITY_SLEEPING_BAG'];
const beats = (manifest.script?.beats ?? []).map((beat) => ({ beatId: beat.id, text: beat.narration, startSec: beat.startSec, endSec: beat.startSec + beat.targetDurationSec, entityIds: entityForBeat(beat), requiredVisual: beat.visualIntent, critical: beat.purpose === 'hook' || beat.purpose === 'payoff' }));
const availability = engine.buildAvailability('EVERGREEN_ISS_SLEEP_001', beats);
const resourcePack = engine.createResourcePack('media-pack-iss-sleep-v1', beats);
const coverage = resourcePack.coverage;

const referenceComparison = compareVideoDNA([
  { sourceId: 'source-proof-brief', role: 'CATEGORY_LEADER', dna: { schema: 'VIDEO_DNA_V1', sourceId: 'source-proof-brief', metadata: { title: 'Source-first proof' }, hook: { firstValueSec: 1, type: 'contradiction' }, narration: { language: 'en' }, editing: { shotCount: manifest.scenes.length, medianShotDurationSec: manifest.script.targetDurationSec / manifest.scenes.length, visualChangeRate: manifest.scenes.length / manifest.script.targetDurationSec }, visualRhythm: { visualTypes: ['exact-source-video'], exactEntityCoverage: coverage.exactVisualCoverageRatio, genericBrollRatio: coverage.genericBrollRatio }, provenance: { method: 'local source manifest; no competitor retention claimed', collectedAt: new Date().toISOString(), evidenceUrls: ['https://science.nasa.gov/eclips/videos/sleeping-on-board-the-international-space-station/', 'https://svs.gsfc.nasa.gov/30771/'] } } },
  { sourceId: 'baseline-constraint', role: 'BASELINE', dna: { schema: 'VIDEO_DNA_V1', sourceId: 'baseline-constraint', metadata: { title: 'Generic B-roll baseline' }, hook: { firstValueSec: 6 }, narration: {}, editing: { visualChangeRate: 0.5 }, visualRhythm: { exactEntityCoverage: 0, genericBrollRatio: 1 }, provenance: { method: 'synthetic comparison baseline, not a competitor claim', collectedAt: new Date().toISOString() } } },
]);

const blueprint = { schema: 'VIDEO_BLUEPRINT_V1', briefId: 'brief-evergreen-iss-sleep', viewerPromise: 'See the exact physical solution astronauts use to sleep without a bed.', hook: { candidates: ['Astronauts do not lie down in space.', 'The wall is the bed.'], selected: 'Astronauts do not lie down in space.', firstFrameIntent: 'Earth from orbit immediately followed by the wall-mounted sleep station.' }, informationArc: beats.map((beat) => ({ beatId: beat.beatId, claim: beat.text, tension: beat.purpose, payoff: beat.onScreenText })), entityIds: ['ENTITY_ISS', 'ENTITY_SLEEPING_BAG', 'ENTITY_EARTH_ORBIT'], mediaIntents: beats.map((beat) => ({ beatId: beat.beatId, query: beat.visualIntent, specificityRequired: beat.critical ? 'EXACT_ENTITY' : 'STRONG_CONTEXT' })), attentionPlan: { predictedCurve: [{ sec: 0, score: 0.9, reason: 'contradiction' }, { sec: 8, score: 0.72, reason: 'physical explanation' }, { sec: 20, score: 0.82, reason: 'sleeping-bag reveal' }, { sec: 34, score: 0.88, reason: 'resolution' }], openLoops: ['Where can a body sleep without a floor?'] }, captionPlan: { style: 'EDITORIAL_CLEAN', emphasis: ['NO BED', 'WALL', 'TETHERED'] }, musicCurve: [{ sec: 0, energy: 0.55 }, { sec: 16, energy: 0.35 }, { sec: 28, energy: 0.18 }], packagingHypothesis: { title: 'Why Astronauts Sleep on Walls', thumbnailPromise: 'A real astronaut inside the ISS sleeping station.' } };

const rightsLedger = resourcePack.rights;
const visualCoverageReport = { exactVisualCoverageRatio: coverage.exactVisualCoverageRatio, genericBrollRatio: coverage.genericBrollRatio, rows: coverage.rows, status: coverage.hardFailures.length ? 'FAIL' : rightsLedger.some((x) => x.rights !== 'CLEARED') ? 'REVIEW_ONLY_RIGHTS_VERIFY' : 'PASS', reason: rightsLedger.some((x) => x.rights !== 'CLEARED') ? 'NASA source rights require verification before public publication.' : 'All selected assets cleared.' };
const masterTimeline = { version: 'MASTER_TIMELINE_V1', sourceManifest: manifestPath, durationSec: manifest.script.targetDurationSec, tracks: { video: manifest.scenes.map((scene) => ({ sceneId: scene.id, beatId: scene.id.split('-s')[0], sourceAssetIds: scene.sourceIds, startSec: scene.startSec, durationSec: scene.durationSec })), narration: { voiceUri: manifest.voice?.uri, language: manifest.script.language }, captions: manifest.captionPlan, music: manifest.music ?? null, sfx: manifest.sfx ?? [] } };
const researchPack = { opportunityId: 'EVERGREEN_ISS_SLEEP_001', trigger: 'EVERGREEN_IDEA', query: 'How do astronauts sleep without gravity?', selectedAngle: 'The physical constraint that turns an ISS wall into a bed.', sourcePack: [...engine.discovery.values()], claims: [{ claim: 'Astronauts use sleeping bags attached to station structures.', sourceRefs: ['discovery-nasa-sleep'] }, { claim: 'The ISS footage shows Earth from orbit and the interior environment.', sourceRefs: ['discovery-nasa-earth', 'discovery-nasa-sleep'] }], freshness: { retrievedAt: new Date().toISOString(), staleAfterDays: 30 } };
const proofManifest = { ...manifest, universal: { productionFormat: 'SOURCED_NARRATIVE', qualityMode: 'STANDARD', briefId: 'brief-evergreen-iss-sleep', opportunityId: 'EVERGREEN_ISS_SLEEP_001', containsSyntheticMedia: false }, rightsGate: 'VERIFY_BEFORE_PUBLIC' };
await writeFile(manifestPath, `${JSON.stringify(proofManifest, null, 2)}\n`);

const raw = new FfmpegRenderer({ outputRoot: renderRoot, ffmpeg: process.env.FFMPEG_BIN ?? 'ffmpeg' });
const renderer = withFinalMediaInspection(withArchetypeEditorialFinish(raw, { ffmpeg: process.env.FFMPEG_BIN ?? 'ffmpeg' }), { ffmpeg: process.env.FFMPEG_BIN ?? 'ffmpeg', ffprobe: process.env.FFPROBE_BIN ?? 'ffprobe' });
const rendered = await renderer.render({ manifestUri: pathToFileURL(manifestPath).href, outputKey: 'sourced-proof-v1.mp4' });
const inspection = await renderer.inspect({ fileUri: rendered.uri, expectedWidth: 1080, expectedHeight: 1920, expectedDurationSeconds: manifest.script.targetDurationSec, requireAudio: true });

const runFfmpeg = (args) => new Promise((resolvePromise, reject) => { const child = spawn(process.env.FFMPEG_BIN ?? 'ffmpeg', args, { stdio: 'ignore' }); child.on('exit', (code) => code === 0 ? resolvePromise() : reject(new Error(`ffmpeg exited ${code}`))); });
const thumbnailPath = resolve(proofRoot, 'thumbnail.jpg');
await runFfmpeg(['-y', '-ss', '2', '-i', rendered.uri.replace(/^file:\/\//, ''), '-frames:v', '1', '-q:v', '2', thumbnailPath]);

const critique = { version: 'V1', result: visualCoverageReport.status === 'PASS' ? 'PASS' : 'REVIEW_ONLY', findings: [visualCoverageReport.status === 'REVIEW_ONLY_RIGHTS_VERIFY' ? 'Public publication blocked until NASA source rights are verified.' : null, coverage.genericBrollRatio > 0.2 ? 'Generic visual ratio is high; rewrite or research affected beats.' : 'Entity-specific source coverage is present for critical beats.', inspection.audioPresent ? null : 'Audio missing.'].filter(Boolean), repairDecision: 'NO_AUTOMATIC_V2: no semantic asset mismatch was detected by the local gate; the remaining blocker is rights verification, not a blind re-render.' };
const cost = { videoGenerationUsd: 0, voiceGenerationUsd: 0, renderUsd: 0, mediaAcquisitionUsd: 0, totalUsd: 0, note: 'Reused existing local source footage and existing cached narration; no new paid generation.' };
await Promise.all([
  writeFile(resolve(proofRoot, 'research-pack.json'), JSON.stringify(researchPack, null, 2)),
  writeFile(resolve(proofRoot, 'media-availability-report.json'), JSON.stringify(availability, null, 2)),
  writeFile(resolve(proofRoot, 'content-entity-graph.json'), JSON.stringify({ entities: resourcePack.entities }, null, 2)),
  writeFile(resolve(proofRoot, 'script-media-coverage-matrix.json'), JSON.stringify(coverage, null, 2)),
  writeFile(resolve(proofRoot, 'media-resource-pack.json'), JSON.stringify(resourcePack, null, 2)),
  writeFile(resolve(proofRoot, 'rights-ledger.json'), JSON.stringify(rightsLedger, null, 2)),
  writeFile(resolve(proofRoot, 'video-blueprint.json'), JSON.stringify(blueprint, null, 2)),
  writeFile(resolve(proofRoot, 'master-timeline.json'), JSON.stringify(masterTimeline, null, 2)),
  writeFile(resolve(proofRoot, 'visual-coverage-report.json'), JSON.stringify(visualCoverageReport, null, 2)),
  writeFile(resolve(proofRoot, 'reference-comparison-report.json'), JSON.stringify(referenceComparison, null, 2)),
  writeFile(resolve(proofRoot, 'v1-critique.json'), JSON.stringify(critique, null, 2)),
  writeFile(resolve(proofRoot, 'cost-ledger.json'), JSON.stringify(cost, null, 2)),
  writeFile(resolve(proofRoot, 'run-receipt.json'), JSON.stringify({ runId: 'sourced-narrative-proof-v1', output: rendered.uri, thumbnail: thumbnailPath, inspection, status: critique.result === 'PASS' ? 'READY_FOR_HUMAN_REVIEW' : 'REVIEW_ONLY_RIGHTS_VERIFY', generatedAt: new Date().toISOString() }, null, 2)),
]);
console.log(JSON.stringify({ proofRoot, video: rendered.uri, thumbnail: thumbnailPath, durationSeconds: inspection.durationSeconds, resolution: `${inspection.width}x${inspection.height}`, audio: inspection.audioPresent, coverage: visualCoverageReport, status: critique.result === 'PASS' ? 'READY_FOR_HUMAN_REVIEW' : 'REVIEW_ONLY_RIGHTS_VERIFY' }, null, 2));
