import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { NodeLocalObjectStore, NodeUploadAssetLoader } from '../packages/runtime-node/index.mjs';
import { buildCaptureAestheticFilter, captureAestheticEnabled, withCaptureAesthetic } from '../packages/runtime-node/capture-aesthetic.mjs';

const work=await mkdtemp(join(tmpdir(),'auto-ytb-capture-test-'));
try{
  const source=join(work,'source.mp4');
  const fixture=spawnSync('ffmpeg',['-y','-f','lavfi','-i','testsrc=size=720x1280:rate=30','-t','0.6','-pix_fmt','yuv420p','-c:v','libx264','-preset','ultrafast',source],{stdio:'ignore'});
  if(fixture.status!==0)throw new Error('ffmpeg capture fixture generation failed');
  const profile={id:'ANIMAL_REALISM',cameraProfile:'CONSUMER_MOBILE',captureAesthetic:{enabled:true,purpose:'social-native-naturalism',targetHeight:960,targetVideoBitrateKbps:900,frameRate:30,subtleSensorNoise:true,preserveSyntheticDisclosure:true}};
  assert.equal(captureAestheticEnabled(profile),true);
  assert.match(buildCaptureAestheticFilter(profile.captureAesthetic),/noise=/);
  const store=new NodeLocalObjectStore(join(work,'store'));
  const provider={name:'mock-video',async generate(){return{id:'source-video',uri:`file://${source}`,mimeType:'video/mp4',provider:'mock-video',model:'mock',costUsd:0.4,metadata:{syntheticSource:true}};}};
  const wrapped=withCaptureAesthetic(provider,profile,{store,ffmpeg:'ffmpeg'});
  const result=await wrapped.generate({prompt:'A dog notices a sock.',durationSeconds:1,aspectRatio:'9:16'});
  assert.notEqual(result.uri,`file://${source}`);
  assert.equal(result.costUsd,0.4);
  assert.equal(result.metadata.syntheticSource,true);
  assert.equal(result.metadata.captureAesthetic.applied,true);
  assert.equal(result.metadata.captureAesthetic.syntheticProvenancePreserved,true);
  assert.equal(result.metadata.captureAesthetic.targetVideoBitrateKbps,900);
  assert.ok(result.metadata.captureAesthetic.transformations.includes('h264-consumer-compression'));
  const loaded=await new NodeUploadAssetLoader().load(result.uri);
  assert.ok(loaded.size>0);

  const disabled=withCaptureAesthetic(provider,{id:'EXPLAINER_DOCUMENTARY',captureAesthetic:{enabled:false,preserveSyntheticDisclosure:true}},{store,ffmpeg:'ffmpeg'});
  const unchanged=await disabled.generate({prompt:'Chart',durationSeconds:1,aspectRatio:'16:9'});
  assert.equal(unchanged.uri,`file://${source}`);

  console.log('✓ naturalistic animal video receives a real FFmpeg mobile-capture postprocess');
  console.log('✓ postprocess preserves source metadata, cost and explicit synthetic provenance');
  console.log('✓ polished archetypes bypass mobile degradation entirely');
} finally {await rm(work,{recursive:true,force:true});}
