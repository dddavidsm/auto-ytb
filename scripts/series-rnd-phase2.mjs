import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assessCrossShotContinuity, assessTemporalContinuity, mossMasterDesign, seriesEconomics, validateCharacterMaster } from '../packages/production/dist/index.js';
import { BlenderProvider } from '../packages/providers/dist/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const now = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
const runId = `moss-series-rnd-${now}`;
const outDir = path.join(root, '.data', 'pro-series-rnd', runId);
mkdirSync(path.join(outDir, 'reports'), { recursive: true });

const styleProofRun = path.join(root, '.data', 'pro-series-rnd', 'pro-series-style-proofs-20260914123059');
const styleProofB = path.join(styleProofRun, 'videos', 'style-proof-B.mp4');
const styleProofBFrame = path.join(styleProofRun, 'frames', 'style-proof-B-1s.png');
const priorReportPath = path.join(styleProofRun, 'reports', 'professional-series-style-proofs.json');
const priorReport = existsSync(priorReportPath) ? JSON.parse(readFileSync(priorReportPath, 'utf8')) : null;

const sources = {
  youtubeKidsQuality: 'https://blog.youtube/inside-youtube/enabling-high-quality-youtube-kids-experience/',
  independentAnimation: 'https://blog.youtube/intl/es-419/culture-and-trends/como-los-animadores-independientes-redefinen-el-entretenimiento/',
  babyShark: 'https://blog.youtube/culture-and-trends/baby-shark/',
  meshAiTo3d: 'https://docs.meshy.ai/en/webapp/image-to-3d',
  meshRigging: 'https://docs.meshy.ai/en/api/rigging',
  meshAnimation: 'https://docs.meshy.ai/pl/api/animation',
  blenderRender: 'https://docs.blender.org/manual/en/dev/advanced/command_line/render.html',
  runwayActTwo: 'https://help.runwayml.com/hc/en-us/articles/42311337895827-Performance-Capture-with-Act-Two',
  hedraCharacter: 'https://www.hedra.com/models/video/hedra/character-3',
  metaHumanAudio: 'https://dev.epicgames.com/documentation/metahuman/audio-driven-animation',
  veo: 'https://ai.google.dev/gemini-api/docs/veo?hl=en',
};

const targetAgeDecision = {
  selected: 'KIDS_4_7',
  confidence: 'PROVISIONAL',
  evidence: [
    'Anthropomorphic biped characters support readable physical comedy and short dialogue turns.',
    'The age band preserves story flexibility beyond preschool while keeping vocabulary, danger and pacing family-safe.',
    'KIDS_7_10 remains a secondary expansion profile; PRESCHOOL_2_4 would require a different music/dialogue grammar.',
  ],
  compliance: 'MADE_FOR_KIDS_REVIEW_REQUIRED',
};

const concepts = [
  { id: 'A', name: 'Moss & the Runaway Acorn', family: 'HIGH_END_ANTHROPOMORPHIC_ANIMAL', ageBand: 'KIDS_4_7', premise: 'A bipedal red-panda-inspired forest adventurer solves small physical mysteries with a stubborn magical acorn.', conflictEngine: 'goal + prop misbehavior + physical comedy + reveal', productionStrategy: 'persistent 3D character/world masters; deterministic blocking; selective generative hero shots', marketEvidence: 'strong recurring-animal and family-animation demand proxy', seriesPotential: 8.6, score: 8.1 },
  { id: 'B', name: 'Nori & the Pocket Planet', family: 'HIGH_END_STYLIZED_3D_HUMANOID', ageBand: 'KIDS_7_10', premise: 'A curious child inventor and a pocket-sized planet repair impossible household problems.', conflictEngine: 'invention goal + escalating physics problem', productionStrategy: 'humanoid master + reusable workshop sets', marketEvidence: 'strong independent-animation portability proxy', seriesPotential: 7.8, score: 7.5 },
  { id: 'C', name: 'The Lantern Keepers', family: 'SEMI_REALISTIC_CINEMATIC_FAMILY', ageBand: 'FAMILY_GENERAL', premise: 'Two siblings protect a living forest lantern from weather and temptation.', conflictEngine: 'protective quest + environmental obstacle', productionStrategy: 'cinematic performance capture and generated action inserts', marketEvidence: 'higher emotional upside but higher production risk', seriesPotential: 6.2, score: 6.4 },
  { id: 'D', name: 'Tumble & Bramble', family: 'PRESCHOOL_3D_FAMILY_LEARNING', ageBand: 'PRESCHOOL_2_4', premise: 'Two gentle animal friends solve one safe physical problem through repetition and song.', conflictEngine: 'simple goal + repeatable attempt + joyful solution', productionStrategy: 'reusable 3D set and song motifs', marketEvidence: 'very strong preschool demand but narrower dialogue range', seriesPotential: 9.0, score: 8.2 },
];

const formatDNA = {
  formatFamily: '3D_ANTHROPOMORPHIC_ANIMAL_ADVENTURE_COMEDY',
  evidenceStatus: 'PROVISIONAL_FROM_STYLE_PROOF_B_AND_PUBLIC_FORMAT_RESEARCH',
  characterPresenceRatio: 0.82,
  dialogueRatio: 0.45,
  actionRatio: 0.34,
  reactionRatePer10s: 1.5,
  averageShotLengthSeconds: 2.5,
  shotChangeRatePer10s: 4,
  cameraChangeRatePer10s: 2,
  propInteractionRatePer10s: 1.1,
  locationChangeRatePerMinute: 2,
  visualPayoffTimingSeconds: 8,
  textScreenRatio: 0,
  motionDensity: 'HIGH',
  palette: ['warm russet', 'moss green', 'cream', 'acorn gold', 'soft woodland blue'],
  notes: ['Measure against multi-shot footage after Hero Scene; the 8-second proof is not sufficient to claim series continuity.'],
};

const mossVariants = [
  { id: 'MOSS_A', direction: 'refined current proof direction', strengths: ['strong silhouette', 'warm scarf/acorn contrast', 'family appeal'], risks: ['fur detail may drift', 'needs persistent 3D master'] },
  { id: 'MOSS_B', direction: 'more toyetic and preschool-readable', strengths: ['simpler shapes', 'thumbnail clarity', 'fast animation'], risks: ['may reduce older-kids emotional range'] },
  { id: 'MOSS_C', direction: 'slightly older-kids cinematic red panda', strengths: ['richer acting range', 'strong adventure tone'], risks: ['higher rig/material complexity', 'less universal simplicity'] },
];

const characterMasterValidation = validateCharacterMaster(mossMasterDesign);
const blender = new BlenderProvider();
const blenderProbe = await blender.probe();
const temporalReport = assessTemporalContinuity([
  { shotId: 'STYLE_PROOF_B', samples: [
    { at: 'start', characterIdentity: 6, bodyMotion: 7, facialActing: 5, lipSync: 0, flicker: 1, issues: ['single generated clip; cross-shot identity not evidenced'] },
    { at: '50%', characterIdentity: 6, bodyMotion: 7, facialActing: 6, lipSync: 0, flicker: 2, issues: [] },
    { at: 'end', characterIdentity: 6, bodyMotion: 7, facialActing: 6, lipSync: 0, flicker: 2, issues: [] },
  ] },
]);
const crossShotReport = assessCrossShotContinuity([]);
const economics = seriesEconomics({
  oneTime: [{ name: 'Moss master model/rig', costUsd: 0 }, { name: 'Reusable woodland set kit', costUsd: 0 }],
  perEpisode: [{ name: 'ElevenLabs voice', costUsd: 0.2 }, { name: 'Selective generative action shots', costUsd: 1.2 }, { name: 'Local render/QC', costUsd: 0 }],
  episodeDurationsMinutes: [1, 3, 5],
});

const report = {
  runId,
  generatedAt: new Date().toISOString(),
  status: 'PHASE_2_SETUP_READY_HERO_BLOCKED',
  scope: 'Persistent anthropomorphic series R&D; no mini episode produced.',
  humanReview: { styleProofWinner: 'B', direction: 'HIGH_END_ANTHROPOMORPHIC_ANIMAL', sourceProof: styleProofB, sourceFrame: styleProofBFrame, priorStatus: priorReport?.status ?? 'UNKNOWN', note: 'Style Proof B is a direction benchmark, not a persistent character master.' },
  marketResearch: { channelsAndFamilies: ['Oddbods', 'Morphle', 'Talking Tom & Friends', 'MSA', 'TheOdd1sOut', 'Jaiden Animations', 'Haminations', 'Cocomelon', 'Bebefinn', 'BabyBus', 'Little Angel', 'independent animation outliers'], sources, findings: ['Recurring characters/worlds create stronger repeatability than prompt-only novelty.', 'Kids/family quality requires clear stories, age fit and constructive behavior.', 'Independent animation demonstrates portability of original characters and worlds.', 'Public metadata and editorial sources are directional; no owned-channel forecast is claimed.'] },
  targetAgeDecision,
  concepts,
  selectedConcept: { id: 'A', name: 'Moss & the Runaway Acorn', reason: 'Owner-selected anthropomorphic direction from human review, with the best combination of character appeal, repeatability and visual proof evidence.', score: 8.1 },
  anthropomorphicFormatDNA: formatDNA,
  mossVariants,
  mossMasterDesign,
  characterMasterValidation,
  characterMasterStatus: 'BLOCKED_PENDING_CANONICAL_3D_MODEL_RIG_FACE',
  worldMaster: { id: 'MOSS_WORLD_MASTER_V1', status: 'DESIGN_ONLY', locations: ['workshop exterior', 'workshop interior', 'forest path', 'magic clearing'], reusableProps: ['golden acorn', 'satchel', 'workbench', 'lantern'], palette: formatDNA.palette, lighting: 'warm key + soft forest fill + readable rim; continuity required across shots' },
  providerBakeoff: {
    blender: { status: blenderProbe.available ? 'AVAILABLE' : 'INSTALL_PENDING_OR_NOT_ON_PATH', probe: blenderProbe, capabilities: blender.capabilities, officialDocs: sources.blenderRender },
    meshy: { status: 'ACCOUNT_CONFIGURED_FREE_TIER', creditsObserved: 100, model: 'Meshy 7 - Flagship', imageTo3D: 'AVAILABLE_IN_WEB_APP', rigging: 'AVAILABLE_IN_PRODUCT; compatibility must be validated on biped model', animation: 'AVAILABLE_IN_PRODUCT; not yet tested', commercialNote: 'Free workspace showed CC BY 4.0 default and paid private option; do not treat a free asset as final commercial master without license verification.', officialDocs: [sources.meshAiTo3d, sources.meshRigging, sources.meshAnimation] },
    runwayActTwo: { status: 'NOT_CONFIGURED', role: 'acting/performance transfer candidate', officialDocs: sources.runwayActTwo },
    hedraCharacter: { status: 'NOT_CONFIGURED', role: 'audio-to-video character candidate', officialDocs: sources.hedraCharacter },
    veo: { status: 'AVAILABLE_EXISTING_GEMINI_STACK', role: 'selective action/environment shots; not canonical character identity', officialDocs: sources.veo },
    metahuman: { status: 'NOT_JUSTIFIED_FOR_CURRENT_HARDWARE', role: 'realistic humanoid candidate only', officialDocs: sources.metaHumanAudio },
    elevenLabs: { status: process.env.ELEVENLABS_API_KEY ? 'CONFIGURED' : 'UNKNOWN_NO_VALUE_EXPOSED', role: 'persistent voice candidate; existing account/secret not modified' },
  },
  hardware: { gpu: 'NVIDIA GeForce RTX 2060 SUPER', reportedVramGb: 4.29, cpu: 'AMD Ryzen 5 3600', ramGb: 17.1, recommendation: 'EEVEE-first; avoid heavy Unreal/Cycles workflow until a real render benchmark justifies it.' },
  motionTests: { status: 'NOT_RUN', reason: 'No canonical 3D master/rig exists yet; running motion would create a misleading proof.', requiredLibrary: ['idle', 'walk', 'run', 'look', 'reach', 'pick up', 'surprised', 'point'] },
  facialSystem: { status: 'DESIGN_ONLY', requiredBlendShapes: ['blink', 'eye direction', 'brow up/down', 'smile', 'frown', 'surprise', 'REST', 'MBP', 'A', 'E', 'I', 'O', 'U', 'FV', 'L', 'WQ', 'SZ'] },
  voiceAB: { status: 'NOT_RUN', reason: 'Voice bake-off is downstream of character/episode script; ElevenLabs remains the configured candidate.' },
  lipSync: { status: 'NOT_RUN', blocking: true, reason: 'Requires canonical face shapes or provider-native persistent avatar.' },
  actingAB: { status: 'NOT_RUN', reason: 'Runway/Blender comparison requires model input and a driving performance.' },
  heroScene: { status: 'NOT_PRODUCED', reason: 'Correctly withheld: persistent model, rig, facial system and multi-shot continuity are not yet proven.', target: '20-30 seconds; 5+ shots; Moss + secondary character; establishing/medium/close/action/reaction.' },
  temporalQC: temporalReport,
  crossShotContinuity: crossShotReport,
  professionalQualityState: 'PROTOTYPE',
  referenceCalibratedScore: { score: null, status: 'NOT_EVALUATED', reason: 'No Hero Scene exists; automated scoring cannot substitute for the required visual review.' },
  seriesEconomics: economics,
  miniEpisodePlan: null,
  drive: { root: 'PRO_SERIES_RND', phase2Folder: 'anthro-series-phase2', note: 'No new paid/large artifacts uploaded in this setup pass; existing Style Proof B remains untouched.' },
  nextAction: 'Complete a canonical Moss 3D master with verified license, rig, face/visemes and one deterministic multi-shot acting test before Hero Scene spending.',
};

const reportPath = path.join(outDir, 'reports', 'moss-series-phase2.json');
writeFileSync(reportPath, JSON.stringify(report, null, 2));
writeFileSync(path.join(outDir, 'reports', 'README.txt'), [
  'MOSS SERIES R&D PHASE 2',
  '',
  'This run intentionally stops before a mini episode or Hero Scene.',
  'Style Proof B is a benchmark fixture, not evidence of persistent identity.',
  `Report: ${reportPath}`,
].join('\n'));
console.log(JSON.stringify({ runId, reportPath, blender: blenderProbe, characterMasterPassed: characterMasterValidation.passed, status: report.status }, null, 2));
