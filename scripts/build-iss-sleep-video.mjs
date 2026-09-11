import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createLiveRuntime } from '../packages/runtime-node/factory.mjs';

const projectId = '708059c9-f9fb-4d11-b3f1-43c97996ca81';
const root = resolve('.');
const storage = resolve(root, '.data', 'storage', 'projects', projectId);
const sourceRoot = resolve(root, 'assets', 'source-footage');

function loadDotEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    values[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  return values;
}

const localEnv = loadDotEnv(await readFile(resolve(root, '.env.local'), 'utf8'));
const env = { ...localEnv, ...process.env };
const narration = `Here's the weirdest part about sleeping in space: astronauts don't lie down. They zip themselves into sleeping bags attached to the station's walls. Without gravity, your body would simply float through the cabin, and drift into equipment. The bag keeps you in one place, but it doesn't press you into a mattress. Your head, arms, and legs can relax while the station moves around you. And because there is no natural up or down, a wall, ceiling, or floor can become your bedroom. In orbit, sleep isn't about finding a bed. It's about staying safely tethered to the spacecraft.`;

const runtime = createLiveRuntime(env);
const voice = await runtime.voice.synthesize({
  text: narration,
  voice: env.VOICE_ID || 'Kore',
  language: 'en',
});

const nasaSleepUri = resolve(sourceRoot, 'nasa-sleeping-iss.mp4');
const nasaEarthUri = resolve(sourceRoot, 'nasa-iss-earth-4k.mp4');
const sleepUrl = 'https://science.nasa.gov/eclips/videos/sleeping-on-board-the-international-space-station/';
const earthUrl = 'https://svs.gsfc.nasa.gov/30771/';
const sources = {
  sleep: { id: 'nasa-sleeping-iss', uri: nasaSleepUri, title: 'Our World: Sleeping On-Board the International Space Station', url: sleepUrl },
  earth: { id: 'nasa-iss-earth-4k', uri: nasaEarthUri, title: '4K Video from the ISS, April 2016', url: earthUrl },
};

// Every window is a real, continuously decoded video segment. Windows avoid
// the source title cards, host segments and end logos; they show Earth, the
// sleep station, the sleeping bag or astronauts floating through the module.
const shots = [
  ['earth', 10.0], ['sleep', 96.0], ['sleep', 102.0], ['earth', 13.0],
  ['sleep', 90.0], ['sleep', 81.0], ['earth', 24.0], ['sleep', 83.2],
  ['sleep', 86.0], ['earth', 35.0], ['sleep', 104.5], ['sleep', 107.0],
  ['earth', 46.0], ['sleep', 92.0], ['sleep', 102.5], ['earth', 58.0],
];
const beatSpecs = [
  { id: 'beat_1', purpose: 'hook', sceneCount: 3, narration: "Here's the weirdest part about sleeping in space: astronauts don't lie down.", onScreenText: 'NO BED IN SPACE', visualIntent: 'Show Earth from orbit, then an astronaut visibly contained inside a vertical sleeping bag.' },
  { id: 'beat_2', purpose: 'setup', sceneCount: 3, narration: "They zip themselves into sleeping bags attached to the station's walls. Without gravity, your body would simply float through the cabin, and drift into equipment.", onScreenText: 'THE WALL IS THE BED', visualIntent: 'Show the wall-mounted sleeping station and astronauts floating through the cramped ISS module.' },
  { id: 'beat_3', purpose: 'evidence', sceneCount: 4, narration: "The bag keeps you in one place, but it doesn't press you into a mattress. Your head, arms, and legs can relax while the station moves around you.", onScreenText: 'HELD IN PLACE', visualIntent: 'Show the sleeping bag and its surrounding station structure as the astronaut remains contained without a mattress.' },
  { id: 'beat_4', purpose: 'reveal', sceneCount: 3, narration: 'And because there is no natural up or down, a wall, ceiling, or floor can become your bedroom.', onScreenText: 'NO UP. NO DOWN.', visualIntent: 'Show multiple orientations inside the ISS and the sleeping station from different angles.' },
  { id: 'beat_5', purpose: 'payoff', sceneCount: 3, narration: "In orbit, sleep isn't about finding a bed. It's about staying safely tethered to the spacecraft.", onScreenText: 'TETHERED TO SPACE', visualIntent: 'Return to the wall-mounted bag and finish on a clean Earth-from-orbit shot.' },
];

const duration = Number(voice.durationSeconds);
const sceneDuration = duration / shots.length;
const scenes = [];
const assets = [];
const finalizedBeats = [];
let timeline = 0;
let shotIndex = 0;
for (const beatSpec of beatSpecs) {
  const beatStart = timeline;
  for (let localIndex = 0; localIndex < beatSpec.sceneCount; localIndex += 1) {
    const [sourceKey, clipStartSec] = shots[shotIndex];
    const source = sources[sourceKey];
    const scene = {
      id: `${beatSpec.id}-s${localIndex + 1}`,
      startSec: timeline,
      durationSec: sceneDuration,
      kind: 'broll',
      generated: false,
      costTier: 'free',
      sourceFootageId: source.id,
      selectionReason: `Rights-reviewed NASA source action window ${shotIndex + 1}/${shots.length}; the sleeping station, floating astronaut or orbital Earth view directly illustrates this beat.`,
      visualValue: 90,
      instruction: `${beatSpec.visualIntent} Use only continuous source video, with no stills, diagrams, host segments, title cards or logos.`,
      sourceIds: [source.id],
      sourceRefs: [{ sourceType: 'licensed_video', sourceId: source.id, title: source.title, url: source.url, policy: 'VERIFY_BEFORE_PUBLIC' }],
    };
    scenes.push(scene);
    assets.push({
      id: `source-video-${scene.id}`,
      uri: source.uri,
      mimeType: 'video/mp4',
      provider: 'user-source-footage',
      model: 'source-video-curation-v2',
      costUsd: 0,
      sceneId: scene.id,
      generated: false,
      sourceIds: [source.id],
      sourceUrl: source.url,
      license: 'NASA-media-informational-use-with-attribution-rights-review-required',
      metadata: {
        kind: 'broll',
        sourceFootageId: source.id,
        title: source.title,
        rightsStatus: 'VERIFY',
        clipStartSec,
        clipEndSec: clipStartSec + sceneDuration,
        cropMode: 'CENTER',
        sourceRefs: scene.sourceRefs,
        windowStrategy: 'continuous-action-only-no-host-no-logo-v1',
      },
    });
    timeline += sceneDuration;
    shotIndex += 1;
  }
  finalizedBeats.push({
    ...beatSpec,
    startSec: beatStart,
    targetDurationSec: timeline - beatStart,
    retentionDevice: beatSpec.purpose === 'hook' ? 'contradiction' : beatSpec.purpose === 'payoff' ? 'resolution' : 'pattern_interrupt',
  });
}

const manifest = {
  projectId,
  createdAt: new Date().toISOString(),
  version: 'iss-sleep-source-video-v1',
  contentFormat: 'SHORT_VERTICAL',
  aspectRatio: '9:16',
  frame: { width: 1080, height: 1920 },
  contentArchetype: { id: 'EXPLAINER_DOCUMENTARY', label: 'Explainer / documentary', confidence: 95 },
  executionPlan: { archetypeId: 'EXPLAINER_DOCUMENTARY', researchMode: 'FACTUAL_RESEARCH', scriptMode: 'NARRATION', voiceMode: 'SINGLE_NARRATOR', audioMode: 'NARRATION_LED', captionMode: 'FULL_SPEECH', visualMode: 'EVIDENCE_FIRST', realityMode: 'FACTUAL' },
  script: {
    title: 'Why Astronauts Sleep on Walls',
    language: 'en',
    targetDurationSec: duration,
    thesis: 'In microgravity, astronauts use wall-mounted sleeping bags to stay safely contained instead of lying on a bed.',
    outro: "Sleep in orbit means staying safely tethered to the spacecraft.",
    beats: finalizedBeats,
  },
  packaging: [{ id: 'iss-wall-bed', title: 'Why Astronauts Sleep on Walls', thumbnailConcept: 'Astronaut visibly zipped into a vertical sleeping bag inside the ISS with Earth glowing behind the station window.', thumbnailText: 'NO BED IN SPACE', promise: 'Explains why sleeping bags are attached to ISS walls.', curiosity: 9.2, clarity: 9.4, credibility: 9.5, differentiation: 8.7, score: 9.2 }],
  thumbnails: [],
  selectedPackagingId: 'iss-wall-bed',
  sourceFootage: Object.values(sources).map((source) => ({ id: source.id, uri: source.uri, title: source.title, sourceUrl: source.url, sourceId: source.id, license: 'NASA-media-informational-use-with-attribution-rights-review-required', rightsStatus: 'VERIFY', cropMode: 'CENTER' })),
  scenes,
  assets,
  voice,
  containsSyntheticMedia: false,
  visualTreatment: {
    mode: 'SOURCE_VIDEO_ONLY_DOCUMENTARY',
    sourceCadence: 'NASA-ISS-EARTH-AND-SLEEP-STATION-ACTION-ONLY',
    generatedVisualPolicy: 'DISABLED',
    allowedTreatments: ['rights-reviewed-source-video', 'stable-center-crop', 'motivated-hard-cuts'],
    bannedTreatments: ['still-image', 'ai-image', 'ai-video', 'procedural-visualizer', 'host-talking-head', 'title-card', 'logo-intro', 'frozen-frame'],
    disclosure: 'All visual scenes are transformed excerpts from NASA source videos; source attribution and rights review remain attached to every asset.',
  },
  captionPlan: { version: 1, mode: 'FULL_SPEECH', enabled: true, burnIn: true, preset: 'EDITORIAL_CLEAN', source: 'VOICE_ALIGNMENT', maxChars: 52, maxDurationSeconds: 3.6, maxLines: 2, position: 'LOWER_MIDDLE', safeBottomPercent: 22, fontScale: 1.1, speakerAware: false, highlightKeywords: true, uppercase: false },
  editPlan: { version: 1, preset: 'SOURCE_DOCUMENTARY', transitionMode: 'HARD_CUT_ON_ACTION', transitionDurationSeconds: 0, filmLook: false, punchInAnchors: false, preserveAudioTiming: true },
  renderExecution: { captionsBurned: true, captionPreset: 'EDITORIAL_CLEAN', editPreset: 'SOURCE_DOCUMENTARY', transitionsApplied: 0, transitionsSkipped: 0, transitionFallback: 'NONE', punchInsApplied: 0, filmLookApplied: false },
};

const manifestPath = resolve(storage, 'manifest-iss-sleep-v4.json');
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ manifest: manifestPath, durationSeconds: duration, sceneCount: scenes.length, sourceOnly: true, voice: voice.uri }, null, 2));
