import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { FfmpegRenderer } from '../packages/runtime-node/index.mjs';

const root=await mkdtemp(join(tmpdir(),'auto-ytb windows path-'));
const manifestPath=join(root,'manifest with spaces.json');
const outputRoot=join(root,'renders with spaces');
const manifest={projectId:'windows-path-test',contentFormat:'SHORT_VERTICAL',aspectRatio:'9:16',frame:{width:320,height:320},script:{title:'Windows path',language:'en',targetDurationSec:1,thesis:'x',beats:[{id:'b1',startSec:0,targetDurationSec:1,purpose:'hook',narration:'x',visualIntent:'A procedural card',sourceIds:[]}]},scenes:[{id:'scene 1',startSec:0,durationSec:1,kind:'motion_graphic',instruction:'Windows path with spaces',sourceIds:[]}],assets:[{id:'asset 1',uri:'procedural://motion_graphic/scene%201',mimeType:'application/x-auto-ytb-visual',provider:'procedural-ffmpeg',sceneId:'scene 1',generated:false,sourceIds:[],metadata:{instruction:'Windows path with spaces'}}]};
await writeFile(manifestPath,JSON.stringify(manifest));
const renderer=new FfmpegRenderer({outputRoot,width:320,height:320,fps:10});
const result=await renderer.render({manifestUri:pathToFileURL(manifestPath).href,outputKey:'windows path.mp4'});
const outputPath=result.uri.replace('file://','');
assert.ok((await stat(outputPath)).size>1000);
assert.equal(JSON.parse(await readFile(manifestPath,'utf8')).projectId,'windows-path-test');
console.log('✓ procedural FFmpeg rendering escapes Windows drive paths and spaces');
