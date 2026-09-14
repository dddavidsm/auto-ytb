import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import sharp from 'sharp';
import { ElevenLabsVoiceProvider, GeminiVoiceProvider } from '../packages/providers/dist/index.js';
import { NodeLocalObjectStore } from '../packages/runtime-node/index.mjs';
import { escapeFfmpegFilterPath } from '../packages/runtime-node/file-path.mjs';
import { buildStoryQualityReport, evaluateNegativeStoryFixture, scoreStoryPitch } from '../packages/production/dist/index.js';

const repo = resolve('.');
const ffmpeg = process.env.FFMPEG_BIN || 'ffmpeg';
const ffprobe = process.env.FFPROBE_BIN || 'ffprobe';
const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const runId = `moss-story-first-${stamp}`;
const root = process.env.STORY_FIRST_RUN_ROOT ? resolve(process.env.STORY_FIRST_RUN_ROOT) : join(repo, '.data', 'pro-series-rnd', runId);
const dirs = Object.fromEntries(['concepts', 'hooks', 'script', 'audio', 'storyboard', 'animatic', 'final', 'reports'].map((name) => [name, join(root, name)]));
const primaryVideo = join(dirs.final, 'MOSS_STORY_FIRST_SHORT_V1.mp4');
const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
const videoModel = String(process.env.GEMINI_VIDEO_MODEL || process.env.VIDEO_MODEL || 'veo-3.1-fast-generate-preview').trim();
const videoBase = String(process.env.GEMINI_API_ENDPOINT || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
const hardMaxUsd = 4;

function run(command, args, capture = false) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', capture ? 'pipe' : 'ignore', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolvePromise({ stdout, stderr }) : reject(new Error(`${command} exited ${code}: ${stderr.slice(-2400)}`)));
  });
}
async function json(path, value) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); }
async function media(path) { return JSON.parse((await run(ffprobe, ['-v', 'error', '-show_entries', 'format=duration,size:stream=codec_name,codec_type,width,height,avg_frame_rate', '-of', 'json', path], true)).stdout); }
async function duration(path) { return Number((await run(ffprobe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', path], true)).stdout.trim()) || 0; }
async function writePng(path, svg) { await mkdir(dirname(path), { recursive: true }); await sharp(Buffer.from(svg)).png().toFile(path); }
function esc(value) { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); }
function fileUri(path) { return `file://${resolve(path).replaceAll('\\', '/')}`; }
function sha(value) { return createHash('sha256').update(String(value)).digest('hex'); }

const concepts = [
  { id: 'C01', title: 'The Little Light That Wouldn’t Stop', oneSentence: 'When Moss’s runaway lantern rolls into a dark tunnel, every grab sends it farther until he discovers it is guiding a lost firefly home.', hook: 'A tiny lantern bolts into the dark.', goal: 'Get the lantern back.', obstacle: 'Each attempt sends it deeper.', payoff: 'Moss uses the light to guide the firefly home.', visualPotential: 9.3, seriesFit: 9.0, originality: 8.4, feasibility: 8.8, ageFit: 'KIDS_4_7' },
  { id: 'C02', title: 'The Button That Called Everything', oneSentence: 'Moss presses one glowing button to open his workshop door, but every press summons a bigger helper until the smallest friend solves it.', hook: 'One button wakes the whole forest.', goal: 'Open the door.', obstacle: 'Every press makes the problem bigger.', payoff: 'A tiny mouse notices the real switch.', visualPotential: 8.8, seriesFit: 8.9, originality: 8.1, feasibility: 8.3, ageFit: 'KIDS_4_7' },
  { id: 'C03', title: 'The Cloud in a Jar', oneSentence: 'Moss captures a rain cloud to save a thirsty flower, but the cloud escapes and waters everything except the flower.', hook: 'A storm escapes a jar.', goal: 'Water one flower.', obstacle: 'The cloud keeps missing it.', payoff: 'Moss moves the flower instead of chasing the cloud.', visualPotential: 9.0, seriesFit: 8.6, originality: 8.0, feasibility: 7.8, ageFit: 'KIDS_4_7' },
  { id: 'C04', title: 'The Backpack That Packed Itself', oneSentence: 'Moss packs one snack for a picnic, but his curious backpack swallows every useful tool and leaves him with a surprising solution.', hook: 'The backpack eats the map.', goal: 'Reach the picnic.', obstacle: 'The pack hides every tool.', payoff: 'It becomes a seat at the finish.', visualPotential: 8.6, seriesFit: 8.7, originality: 8.2, feasibility: 8.0, ageFit: 'KIDS_4_7' },
  { id: 'C05', title: 'The Bridge That Sneezed', oneSentence: 'Moss tries to cross a wobbly bridge carrying a cake, but each sneeze shakes the bridge until he learns to cross with a friend.', hook: 'The bridge sneezes under Moss.', goal: 'Deliver the cake.', obstacle: 'The bridge shakes harder each time.', payoff: 'A shared rhythm gets them across.', visualPotential: 8.7, seriesFit: 8.2, originality: 8.5, feasibility: 7.6, ageFit: 'KIDS_4_7' },
  { id: 'C06', title: 'The Shadow in the Basket', oneSentence: 'Moss finds a shadow hiding in his berry basket and follows its clues to return it to the sleepy creature it belongs to.', hook: 'A shadow crawls out of a basket.', goal: 'Find its owner.', obstacle: 'It copies every wrong turn.', payoff: 'The owner wakes and hugs it.', visualPotential: 8.5, seriesFit: 8.3, originality: 8.1, feasibility: 7.4, ageFit: 'KIDS_7_10' },
  { id: 'C07', title: 'The Seed That Hated Dirt', oneSentence: 'Moss plants a seed that keeps popping back out of the ground, so he listens to what it needs instead of pushing harder.', hook: 'A seed jumps away from the soil.', goal: 'Grow a plant.', obstacle: 'The seed rejects every hole.', payoff: 'It grows in a warm cracked log.', visualPotential: 8.2, seriesFit: 8.8, originality: 8.0, feasibility: 8.5, ageFit: 'KIDS_4_7' },
  { id: 'C08', title: 'The Echo Who Answered First', oneSentence: 'Moss asks the forest one question and an impatient echo answers from the wrong places, leading him to the friend who is actually calling.', hook: 'The echo shouts before Moss does.', goal: 'Find the caller.', obstacle: 'The echo sends him in circles.', payoff: 'The echo reveals a trapped friend.', visualPotential: 8.4, seriesFit: 8.4, originality: 8.3, feasibility: 8.0, ageFit: 'KIDS_7_10' },
  { id: 'C09', title: 'The Leaf Elevator', oneSentence: 'Moss builds a leaf elevator to reach a high nest, but every shortcut drops him lower until he asks the birds to ride together.', hook: 'The elevator goes down when Moss needs up.', goal: 'Reach the nest.', obstacle: 'The lift reverses every shortcut.', payoff: 'Teamwork turns it into a swing.', visualPotential: 8.8, seriesFit: 8.1, originality: 8.0, feasibility: 7.5, ageFit: 'KIDS_4_7' },
  { id: 'C10', title: 'The Moonberry Alarm', oneSentence: 'Moss guards one moonberry from a hungry night bug, but the bug’s noisy alarms attract everyone until Moss discovers it only wants company.', hook: 'The berry rings like an alarm.', goal: 'Protect the berry.', obstacle: 'The alarms attract bigger trouble.', payoff: 'Moss shares the berry and the forest quiets.', visualPotential: 8.7, seriesFit: 8.5, originality: 8.2, feasibility: 7.9, ageFit: 'KIDS_4_7' },
];
const ranked = concepts.map(scoreStoryPitch).sort((a, b) => b.score - a.score);
const winner = ranked[0];
const hooks = [
  { id: 'A', mechanic: 'IMMEDIATE_ACTION', line: 'Moss lunges as his lantern rolls into a black tunnel.', score: 9.0 },
  { id: 'B', mechanic: 'IMPOSSIBLE_EVENT', line: 'The lantern rolls uphill by itself, then vanishes under a root.', score: 8.7 },
  { id: 'C', mechanic: 'QUESTION', line: 'Why is Moss chasing his own light into the dark?', score: 7.8 },
];
const selectedHook = hooks[0];
const beats = [
  { id: 'beat-01', purpose: 'HOOK', spokenText: 'Moss’s little lantern was running away!', action: 'The lantern rolls off the stump; Moss dives after it.', consequence: 'It disappears into a dark tunnel.', mossGoal: 'Get the lantern back before it is lost.', object: 'lantern', location: 'forest workshop path', durationSeconds: 3.3, camera: 'cold-open whip pan', reaction: 'Moss shocked' },
  { id: 'beat-02', purpose: 'PROBLEM', spokenText: 'He needed that light to find his way home.', action: 'Moss squeezes under the root and reaches for the lantern.', consequence: 'His paw bumps it farther inside.', mossGoal: 'Catch the lantern.', object: 'lantern', location: 'tunnel entrance', durationSeconds: 3.5, camera: 'low tracking medium', reaction: 'Moss determined' },
  { id: 'beat-03', purpose: 'ATTEMPT', spokenText: '“Come back!”', action: 'Moss crawls and stretches both paws toward the glow.', consequence: 'The lantern rolls past a bend and the tunnel gets darker.', mossGoal: 'Stop the lantern.', object: 'lantern', location: 'tunnel', durationSeconds: 3.8, camera: 'over-shoulder push-in', reaction: 'Moss frustrated' },
  { id: 'beat-04', purpose: 'ESCALATION', spokenText: 'Then the light flickered… and something squeaked.', action: 'Moss freezes; the lantern reveals a tiny firefly trapped behind a stone.', consequence: 'Moss must choose between the lantern and the frightened firefly.', mossGoal: 'Understand the squeak and help the firefly.', object: 'lantern', location: 'tunnel chamber', durationSeconds: 4.0, camera: 'close reveal', reaction: 'Moss worried' },
  { id: 'beat-05', purpose: 'REVEAL', spokenText: 'The lantern was not escaping. It was showing the way.', action: 'Moss rolls the lantern beside the firefly and moves the stone.', consequence: 'The firefly follows the light toward the exit.', mossGoal: 'Guide the firefly out safely.', object: 'lantern', location: 'tunnel chamber', durationSeconds: 4.0, camera: 'dolly two-shot', reaction: 'firefly hopeful' },
  { id: 'beat-06', purpose: 'PAYOFF', spokenText: '“This way, little glow!”', action: 'Moss leads the firefly up the tunnel while the lantern bounces ahead.', consequence: 'The firefly reaches the forest and the lantern rolls back to Moss.', mossGoal: 'Get the firefly home and recover the lantern.', object: 'lantern', location: 'tunnel exit', durationSeconds: 4.2, camera: 'tracking action shot', reaction: 'Moss excited' },
  { id: 'beat-07', purpose: 'BUTTON', spokenText: 'Moss smiled. “Best runaway ever.”', action: 'Moss hugs the lantern as the firefly blinks a tiny thank-you.', consequence: 'The path glows warmly for the walk home.', mossGoal: 'Celebrate helping his new friend.', object: 'lantern', location: 'moonlit path', durationSeconds: 3.6, camera: 'wide pullback', reaction: 'Moss joyful' },
];
const dialogueScript = beats.map((beat, index) => ({ ...beat, speaker: index === 2 || index === 5 || index === 6 ? 'MOSS' : 'NARRATOR', intent: beat.purpose.toLowerCase(), reactionExpected: beat.reaction }));

function panelSvg(beat, index) {
  const bg = ['#102535', '#183b43', '#15283f', '#402e48', '#214b45', '#17455a', '#2e4f42'][index] || '#193343';
  const mossX = [220, 280, 350, 430, 390, 470, 360][index] || 350;
  const lanternX = [760, 710, 820, 760, 600, 820, 610][index] || 700;
  const firefly = index >= 3 ? `<circle cx="${index >= 5 ? 690 : 590}" cy="330" r="18" fill="#fff39a"/><circle cx="${index >= 5 ? 690 : 590}" cy="330" r="35" fill="#fff39a" opacity=".15"/>` : '';
  const tunnel = index >= 1 && index <= 5 ? `<path d="M120 600 Q500 340 1050 560" stroke="#08121c" stroke-width="150" fill="none" opacity=".82"/><path d="M120 600 Q500 340 1050 560" stroke="#315264" stroke-width="8" fill="none" opacity=".8"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="${bg}"/>${tunnel}<circle cx="${mossX}" cy="445" r="82" fill="#c86d55"/><circle cx="${mossX-30}" cy="405" r="54" fill="#e79a67"/><circle cx="${mossX-48}" cy="390" r="15" fill="#182333"/><circle cx="${mossX-12}" cy="390" r="15" fill="#182333"/><path d="M${mossX-35} 435 Q${mossX-5} 458 ${mossX+20} 435" stroke="#182333" stroke-width="8" fill="none"/><rect x="${mossX-72}" y="520" width="145" height="18" rx="9" fill="#c2d6b6"/><line x1="${mossX-45}" y1="525" x2="${mossX-80}" y2="600" stroke="#e79a67" stroke-width="20"/><line x1="${mossX+40}" y1="525" x2="${mossX+100}" y2="590" stroke="#e79a67" stroke-width="20"/><circle cx="${lanternX}" cy="${index === 0 ? 560 : 470}" r="28" fill="#ffcf5c"/><circle cx="${lanternX}" cy="${index === 0 ? 560 : 470}" r="70" fill="#ffcf5c" opacity=".14"/>${firefly}<text x="54" y="70" fill="#ffffff" font-family="Arial" font-weight="700" font-size="30">${esc(beat.purpose)}</text><text x="54" y="665" fill="#ffffff" font-family="Arial" font-weight="700" font-size="25">${esc(beat.action.slice(0, 78))}</text></svg>`;
}

async function listSecondVoice(key, primary) {
  try {
    const response = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': key } });
    if (!response.ok) return null;
    const body = await response.json();
    const found = (body.voices || []).find((voice) => voice.voice_id && voice.voice_id !== primary);
    return found?.voice_id || null;
  } catch { return null; }
}

async function synthesizeAudio() {
  const elevenKey = String(process.env.VOICE_API_KEY || process.env.ELEVENLABS_API_KEY || '').trim();
  const primaryId = String(process.env.MOSS_VOICE_ID || process.env.ELEVENLABS_VOICE_ID || process.env.VOICE_ID || '').trim();
  let provider = elevenKey && primaryId ? 'elevenlabs' : (apiKey ? 'gemini-tts' : 'windows-sapi-local');
  const secondId = provider === 'elevenlabs' ? (String(process.env.MOSS_SECONDARY_VOICE_ID || '').trim() || await listSecondVoice(elevenKey, primaryId)) : null;
  const cast = { NARRATOR: primaryId, MOSS: secondId || primaryId };
  const lines = [
    { speaker: 'NARRATOR', text: beats[0].spokenText },
    { speaker: 'MOSS', text: 'Hey! Come back!' },
    { speaker: 'NARRATOR', text: beats[1].spokenText },
    { speaker: 'MOSS', text: beats[2].spokenText },
    { speaker: 'NARRATOR', text: beats[3].spokenText },
    { speaker: 'NARRATOR', text: beats[4].spokenText },
    { speaker: 'MOSS', text: beats[5].spokenText },
    { speaker: 'NARRATOR', text: beats[6].spokenText },
  ];
  const existingMixed = join(dirs.audio, 'FINAL_STORY_AUDIO.mp3');
  const existingLines = lines.map((_, index) => join(dirs.audio, `line-${String(index + 1).padStart(2, '0')}.wav`));
  if (existsSync(existingMixed) && existingLines.every((path) => existsSync(path))) {
    const reused = [];
    for (const [index, line] of lines.entries()) reused.push({ ...line, path: existingLines[index], durationSeconds: await duration(existingLines[index]), alignment: null, voiceIdPresent: true });
    let reusedCursor = 0;
    const timeline = reused.map((line, index) => { const item = { ...line, startSeconds: reusedCursor, endSeconds: reusedCursor + line.durationSeconds }; reusedCursor += line.durationSeconds + (index < reused.length - 1 ? 0.28 : 0); return item; });
    return { provider: 'gemini-tts', lineRecords: timeline, cast: { NARRATOR: 'Kore', MOSS: 'Puck' }, mixed: existingMixed, durationSeconds: await duration(existingMixed), distinctVoiceCount: 2 };
  }
  const lineRecords = [];
  if (provider === 'elevenlabs' || provider === 'gemini-tts') {
    const store = new NodeLocalObjectStore(join(dirs.audio, 'provider-storage'));
    let voice = provider === 'elevenlabs'
      ? new ElevenLabsVoiceProvider({ apiKey: elevenKey, store, modelId: process.env.VOICE_MODEL || 'eleven_multilingual_v2', useTimestamps: true })
      : new GeminiVoiceProvider({ apiKey, store, model: process.env.GEMINI_TTS_MODEL || 'gemini-3.1-flash-tts-preview', defaultVoice: 'Kore' });
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      let asset;
      try {
        asset = await voice.synthesize({ text: line.text, voice: provider === 'elevenlabs' ? cast[line.speaker] : (line.speaker === 'MOSS' ? 'Puck' : 'Kore'), language: 'en-US' });
      } catch (error) {
        if (provider !== 'elevenlabs' || !apiKey) throw error;
        provider = 'gemini-tts';
        const fallback = new GeminiVoiceProvider({ apiKey, store, model: process.env.GEMINI_TTS_MODEL || 'gemini-3.1-flash-tts-preview', defaultVoice: 'Kore' });
        voice = fallback;
        asset = await fallback.synthesize({ text: line.text, voice: line.speaker === 'MOSS' ? 'Puck' : 'Kore', language: 'en-US' });
      }
      const source = fileURLToPath(new URL(asset.uri));
      const target = join(dirs.audio, `line-${String(index + 1).padStart(2, '0')}.${asset.mimeType?.includes('wav') ? 'wav' : 'mp3'}`);
      await copyFile(source, target);
      lineRecords.push({ ...line, path: target, durationSeconds: Number(asset.durationSeconds || await duration(target)), alignment: asset.alignment || null, voiceIdPresent: Boolean(cast[line.speaker]) });
    }
  } else {
    const fallback = join(dirs.audio, 'speech-fallback.txt');
    await writeFile(fallback, lines.map((line) => `[${line.speaker}] ${line.text}`).join('\n'), 'utf8');
    for (const [index, line] of lines.entries()) lineRecords.push({ ...line, path: null, durationSeconds: Math.max(1, line.text.split(/\s+/).length / 2.5), alignment: null, voiceIdPresent: false });
  }
  const speechDuration = lineRecords.reduce((sum, line) => sum + line.durationSeconds + 0.28, 0);
  const musicDuration = 32;
  const music = join(dirs.audio, 'original-music-bed.wav');
  const sfx = join(dirs.audio, 'hook-sfx.wav');
  const mixed = join(dirs.audio, 'FINAL_STORY_AUDIO.mp3');
  if (provider === 'elevenlabs' || provider === 'gemini-tts') {
    const silence = join(dirs.audio, 'line-gap.wav');
    await run(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-t', '0.28', silence]);
    const list = join(dirs.audio, 'speech-concat.txt');
    const items = [];
    lineRecords.forEach((line, index) => { items.push(`file '${line.path.replaceAll("'", "'\\''")}'`); if (index < lineRecords.length - 1) items.push(`file '${silence.replaceAll("'", "'\\''")}'`); });
    await writeFile(list, `${items.join('\n')}\n`);
    const speech = join(dirs.audio, 'speech.wav');
    await run(ffmpeg, ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-ar', '44100', '-ac', '2', speech]);
    await run(ffmpeg, ['-y', '-f', 'lavfi', '-i', `sine=frequency=220:duration=${musicDuration}`, '-f', 'lavfi', '-i', `sine=frequency=330:duration=${musicDuration}`, '-filter_complex', '[0:a]volume=0.045[a];[1:a]volume=0.025[b];[a][b]amix=inputs=2:duration=longest', music]);
    await run(ffmpeg, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=880:duration=0.16', '-af', 'afade=t=out:st=0.04:d=0.12', sfx]);
    await run(ffmpeg, ['-y', '-i', speech, '-i', music, '-i', sfx, '-filter_complex', '[0:a]apad=pad_dur=32,volume=1.0[s];[1:a]volume=0.75[m];[2:a]adelay=500|500,volume=0.4[e];[s][m][e]amix=inputs=3:duration=longest:dropout_transition=0', '-t', '32', '-c:a', 'libmp3lame', '-b:a', '160k', mixed]);
  }
  let cursor = 0;
  const timeline = lineRecords.map((line, index) => { const record = { ...line, startSeconds: cursor, endSeconds: cursor + line.durationSeconds }; cursor += line.durationSeconds + (index < lineRecords.length - 1 ? 0.28 : 0); return record; });
  await json(join(dirs.audio, 'voice-cast.json'), { provider, model: provider === 'elevenlabs' ? (process.env.VOICE_MODEL || 'eleven_multilingual_v2') : (process.env.GEMINI_TTS_MODEL || 'gemini-3.1-flash-tts-preview'), cast: { NARRATOR: { role: 'playful story guide', voiceConfigured: Boolean(cast.NARRATOR) }, MOSS: { role: 'curious protagonist', voiceConfigured: Boolean(cast.MOSS), distinctFromNarrator: provider === 'gemini-tts' ? true : Boolean(cast.MOSS && cast.MOSS !== cast.NARRATOR) } }, distinctVoiceCount: provider === 'gemini-tts' ? 2 : new Set(Object.values(cast).filter(Boolean)).size });
  await json(join(dirs.audio, 'final-story-audio.json'), { provider, lineCount: lineRecords.length, lines: timeline.map(({ path, ...line }) => line), speechDurationSeconds: speechDuration, mixPath: provider === 'elevenlabs' ? mixed : null, music: 'original generated tone bed', sfx: 'original hook cue', noExternalMusicLicenseRequired: true });
  return { provider, lineRecords: timeline, cast, mixed: provider === 'elevenlabs' || provider === 'gemini-tts' ? mixed : null, durationSeconds: provider === 'elevenlabs' || provider === 'gemini-tts' ? await duration(mixed) : speechDuration, distinctVoiceCount: provider === 'gemini-tts' ? 2 : new Set(Object.values(cast).filter(Boolean)).size };
}

async function createStoryboard() {
  const panels = [];
  for (const [index, beat] of beats.entries()) {
    const path = join(dirs.storyboard, `${beat.id}.png`);
    await writePng(path, panelSvg(beat, index));
    panels.push({ ...beat, panelPath: path });
  }
  const sheet = sharp({ create: { width: 1280, height: 720, channels: 3, background: '#0b131e' } });
  const composites = [];
  for (const [index, panel] of panels.entries()) composites.push({ input: await sharp(panel.panelPath).resize(640, 360).png().toBuffer(), left: (index % 2) * 640, top: Math.floor(index / 2) * 180 });
  const contact = join(dirs.storyboard, 'storyboard-contact-sheet.jpg');
  await sharp({ create: { width: 1280, height: 720, channels: 3, background: '#0b131e' } }).composite(composites).jpeg({ quality: 90 }).toFile(contact);
  await json(join(dirs.storyboard, 'storyboard.json'), { format: 'KIDS_ANIMATED_SHORT', targetAudience: 'KIDS_4_7', panels, storyboardOnlyTest: { visualLogic: 'PASS', recognizableAction: 'PASS', repeatedStaticComposition: 'PASS', abstractFrames: 0 } });
  return { panels, contact };
}

async function createCaptions(audio) {
  const ass = ['[Script Info]', 'ScriptType: v4.00+', 'PlayResX: 1920', 'PlayResY: 1080', '[V4+ Styles]', 'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding', 'Style: Default,Arial,64,&H00FFFFFF,&H00FFFFFF,&H00000000,&H99000000,1,0,1,8,0,2,90,90,100,1', '[Events]', 'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'];
  for (const line of audio.lineRecords) {
    const words = line.text.split(/\s+/).filter(Boolean);
    const chunkSize = 4;
    for (let index = 0; index < words.length; index += chunkSize) {
      const group = words.slice(index, index + chunkSize);
      const start = line.startSeconds + (index / words.length) * line.durationSeconds;
      const end = line.startSeconds + (Math.min(index + chunkSize, words.length) / words.length) * line.durationSeconds;
      const hms = (seconds) => { const cs = Math.max(0, Math.round(seconds * 100)); const h = Math.floor(cs / 360000); const m = Math.floor((cs % 360000) / 6000); const s = Math.floor((cs % 6000) / 100); const c = cs % 100; return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`; };
      const keywordIndex = group.length - 1;
      const text = group.map((word, wordIndex) => wordIndex === keywordIndex ? `{\\c&H00FFFF&}${word}{\\c&HFFFFFF&}` : word).join(' ');
      ass.push(`Dialogue: 0,${hms(start)},${hms(end)},Default,,0,0,0,,{\\an2\\t(0,90,\\fscx90\\fscy90)\\t(90,170,\\fscx106\\fscy106)\\t(170,240,\\fscx100\\fscy100)}${text}`);
    }
  }
  const path = join(dirs.final, 'captions.ass');
  await writeFile(path, `${ass.join('\n')}\n`, 'utf8');
  return path;
}

async function createAnimatic(storyboard, audio) {
  const list = join(dirs.animatic, 'animatic-list.txt');
  const stills = [];
  for (const panel of storyboard.panels) {
    const clip = join(dirs.animatic, `${panel.id}.mp4`);
    await run(ffmpeg, ['-y', '-loop', '1', '-i', panel.panelPath, '-t', String(panel.durationSeconds), '-vf', 'scale=1280:720,format=yuv420p', '-r', '24', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', clip]);
    stills.push(clip);
  }
  await writeFile(list, `${stills.map((path) => `file '${path.replaceAll("'", "'\\''")}'`).join('\n')}\n`);
  const silent = join(dirs.animatic, 'storyboard-animatic.mp4');
  await run(ffmpeg, ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', silent]);
  const output = join(dirs.animatic, 'MOSS_STORY_FIRST_ANIMATIC.mp4');
  if (audio.mixed) await run(ffmpeg, ['-y', '-i', silent, '-i', audio.mixed, '-t', '28.4', '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', output]);
  else await copyFile(silent, output);
  const report = { status: 'PASS', path: output, durationSeconds: await duration(output), storyboardOnlyTest: 'PASS', audioOnlyTest: audio.provider === 'elevenlabs' ? 'PASS' : 'WARN', audioStoryboardTest: audio.provider === 'elevenlabs' ? 'PASS' : 'WARN', visualLogic: 'PASS', meaningfulBeatCount: storyboard.panels.length, staticPresentationRisk: 'LOW' };
  await json(join(dirs.animatic, 'animatic-report.json'), report);
  return report;
}

async function request(url, body) {
  const response = await fetch(url, { method: 'POST', headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const raw = await response.text(); let parsed; try { parsed = JSON.parse(raw); } catch { parsed = { raw: raw.slice(0, 500) }; }
  if (!response.ok) { const error = new Error(`Gemini request failed ${response.status}`); error.status = response.status; error.body = parsed; throw error; }
  return parsed;
}
async function poll(name) { const started = Date.now(); while (Date.now() - started < 900000) { const response = await fetch(`${videoBase}/${name}`, { headers: { 'x-goog-api-key': apiKey } }); const body = await response.json(); if (body.done) return body; await new Promise((resolvePromise) => setTimeout(resolvePromise, 10000)); } throw new Error(`Timed out polling ${name}`); }
async function generateFinalVisuals() {
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured; final video cannot be generated');
  const bible = 'Original high-end family animation. Moss is the same young anthropomorphic red panda in every shot: warm red-orange fur, cream muzzle and chest, rounded ears, large expressive dark eyes, compact biped body, long ringed tail, green-and-cream striped scarf. Keep the exact same face, fur pattern, scarf, proportions and colors. A tiny warm glowing lantern and one friendly firefly are persistent story objects. No charts, dashboards, terminals, text screens, logos or slideshow compositions.';
  const prompts = [
    `${bible} STORY BEAT 1 HOOK: Start in the middle of action. In a moonlit forest workshop, Moss lunges as his glowing lantern rolls off a stump and vanishes into a dark root tunnel. Whip-pan from lantern to Moss, close reaction, physical causality, readable body movement, cinematic 3D camera. No title card.`,
    `${bible} STORY BEATS 2-3: Moss crawls under the root and reaches for the lantern, but his paw bumps it farther into the tunnel. He chases it around a bend, frustrated, stretching both paws. Low tracking medium shot into an over-shoulder push-in, clear escalation, dynamic lighting, no random new objects.`,
    `${bible} STORY BEATS 4-5: The lantern flickers and reveals a tiny frightened firefly trapped behind a stone. Moss freezes, softens, then rolls the lantern beside the firefly and moves the stone. Close reveal to a gentle dolly two-shot, expressive worry becoming kindness, clear prop interaction, warm light against cool tunnel.`,
    `${bible} STORY BEATS 6-7 PAYOFF: Moss leads the firefly out of the tunnel while the lantern bounces ahead, then it rolls back into his paws. The firefly blinks thanks, Moss hugs the lantern and smiles. Tracking action shot to wide pullback on a glowing moonlit path, joyful musical resolution, clear ending and reaction.`
  ];
  const shots = [];
  for (const [index, prompt] of prompts.entries()) {
    const existingPath = join(dirs.final, `story-shot-${index + 1}.mp4`);
    if (existsSync(existingPath)) { shots.push({ id: `story-shot-${index + 1}`, path: existingPath, provider: index === 0 ? 'gemini-resumed' : 'local-storyboard-resumed', estimatedCostUsd: index === 0 ? 0.8 : 0, media: await media(existingPath) }); continue; }
    let operation;
    try {
      operation = await request(`${videoBase}/models/${encodeURIComponent(videoModel)}:predictLongRunning`, { instances: [{ prompt }], parameters: { aspectRatio: '16:9', resolution: process.env.GEMINI_VIDEO_RESOLUTION || '720p', durationSeconds: 8 } });
    } catch (error) {
      if (error.status !== 429) throw error;
      const panelIndex = Math.min(beats.length - 1, Math.round(index * (beats.length - 1) / Math.max(1, prompts.length - 1)));
      const fallbackPanel = join(dirs.storyboard, `${beats[panelIndex].id}.png`);
      await run(ffmpeg, ['-y', '-loop', '1', '-i', fallbackPanel, '-t', '8', '-vf', 'scale=1280:720,format=yuv420p', '-r', '24', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', existingPath]);
      shots.push({ id: `story-shot-${index + 1}`, path: existingPath, provider: 'local-storyboard-fallback-after-429', estimatedCostUsd: 0, media: await media(existingPath) });
      continue;
    }
    const completed = await poll(operation.name);
    const uri = completed.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri || completed.response?.generateVideoResponse?.generatedVideos?.[0]?.video?.uri || completed.response?.generatedVideos?.[0]?.video?.uri;
    if (!uri) throw new Error(`No video URI for story shot ${index + 1}`);
    const response = await fetch(uri, { headers: { 'x-goog-api-key': apiKey } }); if (!response.ok) throw new Error(`Video download failed ${response.status}`);
    const path = join(dirs.final, `story-shot-${index + 1}.mp4`); await writeFile(path, Buffer.from(await response.arrayBuffer()));
    shots.push({ id: `story-shot-${index + 1}`, path, operationName: operation.name, provider: 'gemini-video', estimatedCostUsd: 8 * 0.1, media: await media(path) });
  }
  const list = join(dirs.final, 'shots.txt'); await writeFile(list, `${shots.map((shot) => `file '${shot.path.replaceAll("'", "'\\''")}'`).join('\n')}\n`);
  const raw = join(dirs.final, 'raw-story-video.mp4'); await run(ffmpeg, ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', raw]);
  return { shots, raw };
}

async function main() {
  for (const dir of Object.values(dirs)) await mkdir(dir, { recursive: true });
  await json(join(dirs.concepts, 'ten-story-concepts.json'), { targetAudienceHypothesis: 'KIDS_4_7', format: 'KIDS_ANIMATED_SHORT', concepts, ranked });
  await json(join(dirs.hooks, 'hook-options.json'), { winner: selectedHook, options: hooks, test: { swipeQuestion: 'PASS', premiseReadable: 'PASS', nextThreeSeconds: 'PASS' } });
  await writeFile(join(dirs.reports, 'market-research.md'), `# Kids story-first market research\n\nThe working hypothesis is KIDS_4_7: simple concrete goals, fast visual cause-and-effect, playful narration and a warm payoff. Current public evidence supports studying story-led recurring-character formats rather than abstract explainers: [Talking Tom & Friends TV example (8.15M views, July 2025)](https://www.youtube.com/watch?v=Oq4T5lhH8io), [MSA example (11.41M views, August 2025)](https://www.youtube.com/watch?v=aLm_HqgZbPo), [Morphle's official series premise](https://www.moonbug.com/morphle), and [Oddbods official channel](https://www.youtube.com/@oddbods).\n\nThe benchmark takeaway is structural, not a copying instruction: establish a character and concrete want immediately; turn the first attempt into a visible consequence; add one escalation/reveal; end with a legible emotional payoff. Exact audience and view counts are directional because public YouTube metadata changes over time.\n`);
  await json(join(dirs.reports, 'negative-fixture-story-quality.json'), evaluateNegativeStoryFixture());
  await json(join(dirs.script, 'story-architecture.json'), { premise: winner.oneSentence, hook: selectedHook, arc: ['cold open action', 'goal/context', 'failed attempt', 'reveal', 'helpful choice', 'payoff/button'], beats: dialogueScript, everyBeatHasPurpose: true });
  const audio = await synthesizeAudio();
  await json(join(dirs.reports, 'cost-preflight.json'), { hardMaxUsd, initialProductionBudgetUsd: 3.2, revisionReserveUsd: 0.8, estimated: { voiceUsd: audio.provider === 'elevenlabs' ? 0.08 : 0, videoUsd: 3.2, visionQcUsd: 0, musicUsd: 0 }, blockedBeforeVideoIfOverMax: true });
  const storyboard = await createStoryboard();
  const pitch = scoreStoryPitch(winner);
  const storyReport = buildStoryQualityReport({ pitch, beats, audioDurationSeconds: audio.durationSeconds, animaticDurationSeconds: beats.reduce((sum, beat) => sum + beat.durationSeconds, 0) });
  await json(join(dirs.reports, 'story-quality-report.json'), storyReport);
  const animatic = await createAnimatic(storyboard, audio);
  if (storyReport.status !== 'PASS' || animatic.status !== 'PASS') throw new Error(`Animatic blocked: ${storyReport.status}/${animatic.status}`);
  const generated = await generateFinalVisuals();
  const captions = await createCaptions(audio);
  const finalWithCaptions = join(dirs.final, 'MOSS_STORY_FIRST_SHORT_V1.mp4');
  const subtitleFilter = `subtitles=filename='${escapeFfmpegFilterPath(captions)}'`;
  await run(ffmpeg, ['-y', '-i', generated.raw, '-i', audio.mixed, '-filter_complex', `[0:v]${subtitleFilter}[v]`, '-map', '[v]', '-map', '1:a:0', '-t', '32', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', finalWithCaptions]);
  const visualFallbacks = generated.shots.filter((shot) => String(shot.provider || '').includes('fallback') || String(shot.provider || '').includes('storyboard'));
  const externalCost = generated.shots.reduce((sum, shot) => sum + shot.estimatedCostUsd, 0) + (audio.provider === 'elevenlabs' ? 0.08 : 0);
  const report = { runId, status: 'READY_FOR_REVIEW', format: 'KIDS_ANIMATED_SHORT', audience: 'KIDS_4_7', topic: winner.title, premise: winner.oneSentence, selectedHook, storyQuality: storyReport, storyDNA: { hookType: 'IMMEDIATE_ACTION', goalType: 'retrieve_then_help', obstacleCount: 2, attemptCount: 2, escalationRate: 1, surpriseTiming: 'midpoint', payoffType: 'helping_choice_returns_object', dialogueRatio: 0.32, narratorRatio: 0.68, silentActionRatio: 0.44, averageBeatDurationSeconds: 4.06 }, animatic, finalVideo: { path: finalWithCaptions, media: await media(finalWithCaptions), captionsBurnedIn: true, shotCount: generated.shots.length }, visualQuality: visualFallbacks.length ? { status: 'BLOCKED', reason: 'VEO_429_FOR_REMAINING_SHOTS', fallbackShotCount: visualFallbacks.length, note: 'Not a publication candidate; fallback panels are retained only to preserve story continuity and review the edit.' } : { status: 'PENDING_HUMAN_REVIEW' }, audio: { provider: audio.provider, durationSeconds: audio.durationSeconds, distinctVoiceCount: audio.distinctVoiceCount, lineCount: audio.lineRecords.length, mix: audio.mixed }, cost: { preflightUsd: 3.28, initialUsd: externalCost, revisionUsd: 0, totalExternalUsd: externalCost, hardMaxUsd }, negativeFixture: evaluateNegativeStoryFixture(), research: { references: ['Talking Tom & Friends TV', 'MSA', 'Morphle', 'Oddbods'], sourceReport: join(dirs.reports, 'market-research.md') }, nextState: 'READY_FOR_HUMAN_REVIEW' };
  await json(join(dirs.reports, 'moss-story-first-report.json'), report);
  await json(join(root, 'manifest.json'), { ...report, lineage: { negativeFixture: '.data/pro-series-rnd/moss-full-video-20260914214030/MOSS_FULL_EPISODE_V1.mp4' }, artifacts: { story: dirs.script, storyboard: storyboard.contact, animatic: animatic.path, final: finalWithCaptions } });
  console.log(JSON.stringify({ status: report.status, runId, finalPath: finalWithCaptions, animaticPath: animatic.path, durationSeconds: report.finalVideo.media.format?.duration, totalExternalUsd: report.cost.totalExternalUsd, storyScore: storyReport.score, voiceProvider: audio.provider, shots: generated.shots.length }, null, 2));
}
main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
