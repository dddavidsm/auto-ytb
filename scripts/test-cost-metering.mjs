import assert from 'node:assert/strict';
import { rm } from 'node:fs/promises';
import { ProviderUsageMeter, meterSearchProvider, meterTextModel, meterVoiceProvider, meterImageProvider, meterVideoProvider } from '../packages/runtime-node/metering.mjs';

const root='.data/test-cost-meter';
await rm(root,{recursive:true,force:true});
const meter=new ProviderUsageMeter({AUTO_YTB_METER_SESSION_ID:'cost-test',COST_METER_ROOT:root,TAVILY_CREDIT_USD:'0.008'});
const search=meterSearchProvider({name:'tavily',async search(){return [{id:'1',title:'x',url:'https://example.com',snippet:'x'}];}},meter);
await search.search('test');
const model=meterTextModel({name:'openai:gpt-5',async generateJson(){return {value:{ok:true},usage:{inputTokens:1000,outputTokens:500}};}},meter);
const modelResult=await model.generateJson({system:'s',prompt:'p',schemaName:'video_script'});
assert.equal(Math.round(modelResult.usage.costUsd*1e6)/1e6,0.00625);

const voice=meterVoiceProvider({name:'elevenlabs',async synthesize(){return {id:'v',uri:'mock://v',mimeType:'audio/mpeg',provider:'elevenlabs',model:'eleven_multilingual_v2',durationSeconds:50};}},meter,{model:'eleven_multilingual_v2'});
const voiceResult=await voice.synthesize({text:'a'.repeat(1000),voice:'voice-1',language:'en'});
assert.equal(voiceResult.costUsd,0.1);

const rawRunway={name:'runway',async generate(input){return {id:'a',uri:'mock://a',mimeType:'durationSeconds' in input?'video/mp4':'image/png',provider:'runway',model:'durationSeconds' in input?'gen4.5':'gen4_image'};}};
const image=meterImageProvider(rawRunway,meter,{model:'gen4_image'});
const imageResult=await image.generate({prompt:'documentary visual',aspectRatio:'16:9'});
assert.equal(imageResult.costUsd,0.08);
const thumbResult=await image.generate({prompt:'YouTube documentary thumbnail background',aspectRatio:'16:9'});
assert.equal(thumbResult.costUsd,0.08);
const video=meterVideoProvider(rawRunway,meter,{model:'gen4.5'});
const videoResult=await video.generate({prompt:'hero shot',durationSeconds:5,aspectRatio:'16:9'});
assert.equal(videoResult.costUsd,0.6);

const snapshot=meter.snapshot();
assert.equal(snapshot.events.length,6);
assert.equal(Math.round(snapshot.nonAssetCostUsd*1e6)/1e6,0.01425);
assert.equal(snapshot.events.find((event)=>event.stage==='thumbnail').costUsd,0.08);
assert.equal(snapshot.events.find((event)=>event.stage==='video').metadata.usdPerSecond,0.12);
assert.equal(snapshot.events.find((event)=>event.provider==='tavily').costUsd,0.008);
assert.equal(snapshot.events.find((event)=>event.provider==='openai').inputUnits,1000);
await rm(root,{recursive:true,force:true});
console.log('✓ Tavily basic-search credit cost');
console.log('✓ OpenAI token-based cost formula');
console.log('✓ ElevenLabs character-based TTS cost');
console.log('✓ Runway image/video credit cost');
console.log('✓ editorial non-asset cost remains separately auditable');
