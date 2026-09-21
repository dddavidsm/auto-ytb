import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  buildTemporalSemanticPrompt,
  evaluateGeneratedClipSemanticQc,
  extractTemporalContactSheet,
  mapVisionEvaluationToGeneratedClipQuality,
} from './generated-clip-semantic-qc.mjs';

const execFileAsync = promisify(execFile);
const shot = {
  shotId:'shot-1', scene:'scene-1', narrativePurpose:'rescue climax', desiredDurationSeconds:4,
  visualDescription:'The orange cat pulls a soaked baby bird away from rushing drain water onto safe pavement.',
  primarySubject:'orange-cat-v1', characterIds:['orange-cat-v1'], worldId:'storm-street-v1',
  action:'pulls the baby bird away from the drain', emotion:'urgent and protective', framing:'stable medium', camera:'subtle handheld', motion:'readable real-time motion',
  realismTarget:'STYLIZED_REAL', styleTarget:'consistent cinematic animal rescue series', qualityFloor:75,
  semanticContract:{ subject:'orange-cat-v1', action:'pulls the baby bird away from the drain', object:'baby bird', cause:'rising storm runoff', result:'bird reaches safe pavement', emotion:'protective', storyBeat:'rescue' },
};
const character = { characterId:'orange-cat-v1', visualDescription:'orange cat with white chest and red collar', immutableTraits:['orange fur','white chest','green eyes','red collar'], proportions:'small athletic cat', eyes:'green', accessories:['red collar'] };
const world = { worldId:'storm-street-v1', visualIdentity:'rainy residential street', architecture:'low brick houses', layout:'street slopes toward a curb drain', lighting:'overcast storm daylight' };

{
  const prompt = buildTemporalSemanticPrompt({ shot, characters:[character], world });
  assert.match(prompt,/chronological contact sheet/i);
  assert.match(prompt,/pulls the baby bird away from the drain/i);
  assert.match(prompt,/orange fur, white chest, green eyes, red collar/i);
  assert.match(prompt,/street slopes toward a curb drain/i);
  assert.match(prompt,/Do not infer an action merely because the subject is present/i);
  console.log('✓ semantic prompt carries exact action, character and world constraints');
}

{
  const quality = mapVisionEvaluationToGeneratedClipQuality({
    evaluation:{ observedMeaning:'The cat visibly pulls the bird to dry pavement.', relevanceScore:95, continuityScore:94, artifactQualityScore:92, issues:[] },
    shot, world,
  });
  assert.equal(quality.accepted,true);
  assert.equal(quality.subjectCorrectness,'STRONG');
  assert.equal(quality.actionCorrectness,'STRONG');
  assert.equal(quality.characterIdentity,'STRONG');
  assert.equal(quality.worldIdentity,'STRONG');
  assert.equal(quality.method,'temporal-contact-sheet-vision');
  console.log('✓ strong visual evidence becomes an accepted generated clip quality result');
}

{
  const quality = mapVisionEvaluationToGeneratedClipQuality({
    evaluation:{ observedMeaning:'The cat stands beside a bird but never rescues it.', relevanceScore:82, continuityScore:94, artifactQualityScore:92, issues:['ACTION_MISMATCH: requested rescue is not visibly demonstrated'] },
    shot, world,
  });
  assert.equal(quality.accepted,false);
  assert.equal(quality.actionCorrectness,'WEAK');
  assert.ok(quality.rejectionReasons.some((reason)=>reason.includes('ACTION_MISMATCH')));
  console.log('✓ an attractive but semantically wrong clip is rejected instead of being marked STRONG');
}

{
  const quality = mapVisionEvaluationToGeneratedClipQuality({
    evaluation:{ observedMeaning:'The action occurs, but the cat changes face and grows an extra paw.', relevanceScore:96, continuityScore:55, artifactQualityScore:58, issues:['CHARACTER_DRIFT: face changes between panels','ANATOMY: extra foreleg appears'] },
    shot, world,
  });
  assert.equal(quality.accepted,false);
  assert.equal(quality.characterIdentity,'WEAK');
  assert.equal(quality.physics,'WEAK');
  assert.equal(quality.temporalCoherence,'WEAK');
  console.log('✓ character drift/anatomy/temporal defects fail the hard visual gate');
}

{
  const root = await mkdtemp(join(tmpdir(),'auto-ytb-semantic-qc-'));
  const video = join(root,'moving.mp4');
  const contact = join(root,'contact.jpg');
  await execFileAsync('ffmpeg',['-y','-f','lavfi','-i','testsrc2=size=320x180:rate=24:duration=4','-c:v','libx264','-pix_fmt','yuv420p',video]);
  const extracted = await extractTemporalContactSheet({ videoUri:pathToFileURL(video).href, durationSeconds:4, outputPath:contact, frameCount:4 });
  assert.equal(extracted.frameCount,4);
  assert.ok(extracted.imageData.byteLength>1000);
  const bytes = await readFile(contact);
  assert.ok(bytes.byteLength>1000);
  console.log('✓ ffmpeg extracts a real four-panel temporal contact sheet from a moving MP4');
}

{
  let seenPrompt='';
  const fakeVision = {
    name:'fixture-vision',
    async evaluate(input){
      seenPrompt=input.prompt;
      assert.equal(input.mimeType,'image/jpeg');
      assert.ok(input.imageData.byteLength>0);
      return { observedMeaning:'Exact rescue action is visible across the sequence.', relevanceScore:93, continuityScore:91, artifactQualityScore:90, issues:[] };
    },
  };
  const result = await evaluateGeneratedClipSemanticQc({
    asset:{ uri:'file:///unused.mp4', mimeType:'video/mp4', metadata:{generatedDurationSeconds:4} },
    shot, characters:[character], world, visionProvider:fakeVision, workDir:'/tmp',
    extractContactSheet: async ()=>({ imageData:new Uint8Array([1,2,3]), mimeType:'image/jpeg', outputPath:'/tmp/fixture-contact.jpg', frameCount:4 }),
  });
  assert.equal(result.quality.accepted,true);
  assert.equal(result.evidence.provider,'fixture-vision');
  assert.equal(result.evidence.sampledFrames,4);
  assert.match(seenPrompt,/baby bird/);
  console.log('✓ temporal semantic QC integrates a VisionProvider without paid calls in tests');
}

{
  const quality = mapVisionEvaluationToGeneratedClipQuality({
    evaluation:{ observedMeaning:'Looks fine', relevanceScore:99, continuityScore:99, artifactQualityScore:99, issues:['minor stylistic observation'] },
    shot, world, technicalValidity:false, technicalIssues:['FREEZE_DETECTED'],
  });
  assert.equal(quality.accepted,false);
  assert.ok(quality.rejectionReasons.includes('FREEZE_DETECTED'));
  assert.ok(quality.rejectionReasons.includes('TECHNICAL_INVALID'));
  assert.equal(quality.artifactIssues.includes('minor stylistic observation'),false,'non-blocking prose must not become a hard failure');
  console.log('✓ temporal vision evidence augments rather than weakens VIDEO_ONLY/freeze technical QC');
}

console.log('Generated clip semantic QC regression suite passed.');
