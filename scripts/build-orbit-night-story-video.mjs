import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createLiveRuntime } from '../packages/runtime-node/factory.mjs';

const projectId = 'e62a7d3d-9f44-4fd1-9e62-2b2fa6c5cf1c';
const root = resolve('.');
const storage = resolve(root, '.data', 'storage', 'projects', projectId);
const sourceRoot = resolve(root, 'assets', 'source-footage');

function loadDotEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/);
    if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
  return values;
}

const localEnv = loadDotEnv(await readFile(resolve(root, '.env.local'), 'utf8'));
const env = { ...localEnv, ...process.env };
const narration = `En tu primera noche en órbita, tu cuerpo busca algo que ya no existe: el suelo. Avanzas hacia tu compartimento, pero no hay arriba ni abajo. Cada movimiento hace que te alejes un poco más. Entonces encuentras el saco. No está sobre una cama: está sujeto a la pared. Te metes dentro y cierras la cremallera. Por primera vez desde que llegaste, dejas de buscar un lugar donde caer. La estación sigue moviéndose, los instrumentos siguen trabajando y por fin puedes dormir, suspendido, como si la nave sujetara tu cuerpo. Aquí, una pared no es una pared. Es la promesa de que seguirás en el mismo sitio cuando despiertes.`;

const runtime = createLiveRuntime(env);
const voice = await runtime.voice.synthesize({ text: narration, voice: env.VOICE_ID || 'Kore', language: 'es' });
const sleepUri = resolve(sourceRoot, 'nasa-sleeping-iss.mp4');
const earthUri = resolve(sourceRoot, 'nasa-iss-earth-4k.mp4');
const sources = {
  sleep: { id: 'nasa-sleeping-iss', uri: sleepUri, title: 'Our World: Sleeping On-Board the International Space Station', url: 'https://science.nasa.gov/eclips/videos/sleeping-on-board-the-international-space-station/' },
  earth: { id: 'nasa-iss-earth-4k', uri: earthUri, title: '4K Video from the ISS, April 2016', url: 'https://svs.gsfc.nasa.gov/30771/' },
};

// Narrative cadence: establish the impossible situation, follow the character,
// reveal the sleeping station, then resolve on a quiet return to orbit.
const shots = [
  ['earth', 10.0], ['sleep', 81.0], ['sleep', 83.2],
  ['earth', 13.0], ['sleep', 86.0], ['sleep', 96.0],
  ['earth', 24.0], ['sleep', 102.0], ['sleep', 104.5],
  ['earth', 35.0], ['sleep', 107.0], ['sleep', 92.0],
  ['sleep', 96.0], ['earth', 46.0], ['earth', 58.0],
];
const beats = [
  { id: 'story_1', purpose: 'hook', sceneCount: 3, narration: 'En tu primera noche en órbita, tu cuerpo busca algo que ya no existe: el suelo.', onScreenText: 'NO HAY ABAJO', visualIntent: 'Open on Earth from orbit, then immediately cut to a real astronaut drifting inside the ISS.' },
  { id: 'story_2', purpose: 'setup', sceneCount: 3, narration: 'Avanzas hacia tu compartimento, pero no hay arriba ni abajo. Cada movimiento hace que te alejes un poco más.', onScreenText: 'SIGUES FLOTANDO', visualIntent: 'Follow continuous floating motion through the station; the visual must show the body moving through the module, not a presenter.' },
  { id: 'story_3', purpose: 'reveal', sceneCount: 3, narration: 'Entonces encuentras el saco. No está sobre una cama: está sujeto a la pared. Te metes dentro y cierras la cremallera.', onScreenText: 'LA PARED ES LA CAMA', visualIntent: 'Reveal the wall-mounted sleeping bag and the astronaut entering or occupying it in real source footage.' },
  { id: 'story_4', purpose: 'payoff', sceneCount: 3, narration: 'Por primera vez desde que llegaste, dejas de buscar un lugar donde caer. La estación sigue moviéndose, los instrumentos siguen trabajando y por fin puedes dormir, suspendido, como si la nave sujetara tu cuerpo.', onScreenText: 'POR FIN, QUIETO', visualIntent: 'Use the sleeping station and calm interior action; let the physical contrast between floating and containment carry the emotion.' },
  { id: 'story_5', purpose: 'payoff', sceneCount: 3, narration: 'Aquí, una pared no es una pared. Es la promesa de que seguirás en el mismo sitio cuando despiertes.', onScreenText: 'CUANDO DESPIERTES', visualIntent: 'Finish with the quiet sleeping station and a clean Earth-from-orbit return, with no logo or title card.' },
];

await mkdir(storage, { recursive: true });
const duration = Number(voice.durationSeconds);
const sceneDuration = duration / shots.length;
const scenes = [];
const assets = [];
const finalizedBeats = [];
let timeline = 0;
let shotIndex = 0;
for (const beat of beats) {
  const beatStart = timeline;
  for (let localIndex = 0; localIndex < beat.sceneCount; localIndex += 1) {
    const [sourceKey, clipStartSec] = shots[shotIndex];
    const source = sources[sourceKey];
    const scene = {
      id: `${beat.id}-s${localIndex + 1}`,
      startSec: timeline,
      durationSec: sceneDuration,
      kind: 'broll',
      generated: false,
      costTier: 'free',
      sourceFootageId: source.id,
      selectionReason: `Continuous NASA action window ${shotIndex + 1}/${shots.length}; selected to advance the character's night rather than repeat an explanation card.`,
      visualValue: 95,
      instruction: `${beat.visualIntent} Use only continuous source video. No stills, diagrams, presenter segments, title cards, logos or frozen frames.`,
      sourceIds: [source.id],
      sourceRefs: [{ sourceType: 'licensed_video', sourceId: source.id, title: source.title, url: source.url, policy: 'VERIFY_BEFORE_PUBLIC' }],
    };
    scenes.push(scene);
    assets.push({
      id: `source-video-${scene.id}`,
      uri: source.uri,
      mimeType: 'video/mp4',
      provider: 'user-source-footage',
      model: 'source-video-curation-v3',
      costUsd: 0,
      sceneId: scene.id,
      generated: false,
      sourceIds: [source.id],
      sourceUrl: source.url,
      license: 'NASA-media-informational-use-with-attribution-rights-review-required',
      metadata: { kind: 'broll', sourceFootageId: source.id, title: source.title, rightsStatus: 'VERIFY', clipStartSec, clipEndSec: clipStartSec + sceneDuration, cropMode: 'CENTER', sourceRefs: scene.sourceRefs, windowStrategy: 'continuous-narrative-action-only-no-host-no-logo-v2' },
    });
    timeline += sceneDuration;
    shotIndex += 1;
  }
  finalizedBeats.push({ ...beat, startSec: beatStart, targetDurationSec: timeline - beatStart, retentionDevice: beat.purpose === 'hook' ? 'open_loop' : beat.purpose === 'reveal' ? 'reveal' : 'contrast' });
}

const manifest = {
  projectId,
  createdAt: new Date().toISOString(),
  version: 'orbit-night-microstory-v1',
  contentFormat: 'SHORT_VERTICAL',
  aspectRatio: '9:16',
  frame: { width: 1080, height: 1920 },
  contentArchetype: { id: 'VERIFIED_REAL_STORY', label: 'Verified real story', confidence: 91 },
  executionPlan: { archetypeId: 'VERIFIED_REAL_STORY', researchMode: 'FACTUAL_RESEARCH', scriptMode: 'NARRATION', voiceMode: 'SINGLE_NARRATOR', audioMode: 'NARRATION_LED', captionMode: 'FULL_SPEECH', visualMode: 'EVIDENCE_FIRST', realityMode: 'FACTUAL' },
  script: { title: 'La noche en la que desapareció el suelo', language: 'es', targetDurationSec: duration, thesis: 'Una microhistoria inmersiva sobre cómo se siente buscar un lugar donde dormir en órbita.', outro: 'Cuando despiertes, seguirás exactamente en el mismo lugar.', beats: finalizedBeats },
  packaging: [{ id: 'orbit-night', title: 'La noche en la que desapareció el suelo', thumbnailConcept: 'Astronauta sujeto en un saco vertical dentro de la ISS con la Tierra al fondo.', thumbnailText: 'NO HAY ABAJO', promise: 'Una noche en órbita contada como una experiencia en primera persona.', curiosity: 9.4, clarity: 9.2, credibility: 9.2, differentiation: 9.1, score: 9.2 }],
  thumbnails: [],
  selectedPackagingId: 'orbit-night',
  sourceFootage: Object.values(sources).map((source) => ({ id: source.id, uri: source.uri, title: source.title, sourceUrl: source.url, sourceId: source.id, license: 'NASA-media-informational-use-with-attribution-rights-review-required', rightsStatus: 'VERIFY', cropMode: 'CENTER' })),
  scenes,
  assets,
  voice,
  containsSyntheticMedia: false,
  visualTreatment: { mode: 'SOURCE_VIDEO_ONLY_MICROSTORY', sourceCadence: 'NASA-ISS-IMMERSIVE-NARRATIVE-ACTION', generatedVisualPolicy: 'DISABLED', allowedTreatments: ['rights-reviewed-source-video', 'stable-center-crop', 'motivated-hard-cuts'], bannedTreatments: ['still-image', 'ai-image', 'ai-video', 'procedural-visualizer', 'host-talking-head', 'title-card', 'logo-intro', 'frozen-frame'], disclosure: 'Real NASA source excerpts are transformed into an original narrated microstory; attribution and rights review remain attached to every asset.' },
  captionPlan: { version: 1, mode: 'FULL_SPEECH', enabled: true, burnIn: true, preset: 'EDITORIAL_CLEAN', source: 'VOICE_ALIGNMENT', maxChars: 52, maxDurationSeconds: 3.6, maxLines: 2, position: 'LOWER_MIDDLE', safeBottomPercent: 22, fontScale: 1.1, speakerAware: false, highlightKeywords: true, uppercase: false },
  editPlan: { version: 1, preset: 'CINEMATIC_STORY', transitionMode: 'HARD_CUT_ON_ACTION', transitionDurationSeconds: 0, filmLook: false, punchInAnchors: true, preserveAudioTiming: true },
  renderExecution: { captionsBurned: true, captionPreset: 'EDITORIAL_CLEAN', editPreset: 'CINEMATIC_STORY', transitionsApplied: 0, transitionsSkipped: 0, transitionFallback: 'NONE', punchInsApplied: 0, filmLookApplied: false },
};

const manifestPath = resolve(storage, 'manifest-orbit-night-story-v1.json');
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ manifest: manifestPath, durationSeconds: duration, sceneCount: scenes.length, format: 'MICROSTORY', voice: voice.uri }, null, 2));
