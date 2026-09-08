import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const n=(value,fallback)=>{const parsed=Number(value);return Number.isFinite(parsed)?parsed:fallback;};
const round=(value)=>Math.round(Number(value||0)*1_000_000)/1_000_000;
const safe=(value)=>String(value??'unknown').replace(/[^a-zA-Z0-9_.-]+/g,'-').slice(0,96)||'unknown';

const OPENAI_RATES={
  'gpt-5':{input:1.25,output:10},
  'gpt-5-mini':{input:0.25,output:2},
  'gpt-5-nano':{input:0.05,output:0.40},
};
const RUNWAY_VIDEO_CREDITS_PER_SECOND={'gen4.5':12,'gen4_turbo':5};
const RUNWAY_IMAGE_CREDITS={'gen4_image':8,'gen4_image_turbo':2};

function pricing(env){
  return {
    tavilyCreditUsd:n(env.TAVILY_CREDIT_USD,0.008),
    openaiInputPerMillion:n(env.TEXT_MODEL_INPUT_USD_PER_MILLION,NaN),
    openaiOutputPerMillion:n(env.TEXT_MODEL_OUTPUT_USD_PER_MILLION,NaN),
    elevenMultilingualPerThousand:n(env.ELEVENLABS_MULTILINGUAL_USD_PER_1K_CHARS,0.10),
    elevenFlashPerThousand:n(env.ELEVENLABS_FLASH_USD_PER_1K_CHARS,0.05),
    runwayCreditUsd:n(env.RUNWAY_CREDIT_USD,0.01),
    runwayVideoCreditsPerSecond:n(env.RUNWAY_VIDEO_CREDITS_PER_SECOND,NaN),
    runwayImageCreditsPerImage:n(env.RUNWAY_IMAGE_CREDITS_PER_IMAGE,NaN),
  };
}

export class ProviderUsageMeter{
  constructor(env=process.env){
    this.env=env;
    this.rates=pricing(env);
    this.events=[];
    this.sequence=0;
    const session=safe(env.AUTO_YTB_METER_SESSION_ID||`${Date.now()}-${process.pid}`);
    this.sessionId=session;
    this.journalPath=resolve(env.COST_METER_ROOT||'.data/cost-meter',`${session}.jsonl`);
  }
  async record(event){
    const normalized={
      eventKey:event.eventKey||`${String(++this.sequence).padStart(4,'0')}:${safe(event.provider)}:${safe(event.operation)}`,
      stage:event.stage||'other',provider:event.provider||'unknown',model:event.model??null,operation:event.operation||'unknown',
      inputUnits:event.inputUnits??null,outputUnits:event.outputUnits??null,unitName:event.unitName??null,durationSeconds:event.durationSeconds??null,quantity:event.quantity??null,
      costUsd:event.costUsd==null?null:round(event.costUsd),estimated:event.estimated!==false,pricingSource:event.pricingSource??null,metadata:event.metadata??{},recordedAt:new Date().toISOString(),
    };
    this.events.push(normalized);
    await mkdir(dirname(this.journalPath),{recursive:true});
    await appendFile(this.journalPath,`${JSON.stringify(normalized)}\n`,'utf8');
    return normalized;
  }
  get nonAssetCostUsd(){return round(this.events.filter((event)=>['research','llm'].includes(event.stage)).reduce((sum,event)=>sum+Number(event.costUsd??0),0));}
  get totalCostUsd(){return round(this.events.reduce((sum,event)=>sum+Number(event.costUsd??0),0));}
  snapshot(){return {sessionId:this.sessionId,journalPath:this.journalPath,nonAssetCostUsd:this.nonAssetCostUsd,totalCostUsd:this.totalCostUsd,events:[...this.events]};}
}

function openAiRates(model,meter){
  const builtIn=OPENAI_RATES[model]??null;
  const input=Number.isFinite(meter.rates.openaiInputPerMillion)?meter.rates.openaiInputPerMillion:builtIn?.input;
  const output=Number.isFinite(meter.rates.openaiOutputPerMillion)?meter.rates.openaiOutputPerMillion:builtIn?.output;
  return input!=null&&output!=null?{input,output}:null;
}
function textStage(schemaName){return schemaName==='research_dossier'?'research':'llm';}
function voiceRate(model,meter){return /flash|turbo|conversational/i.test(model)?meter.rates.elevenFlashPerThousand:meter.rates.elevenMultilingualPerThousand;}
function runwayVideoRate(model,meter){const credits=Number.isFinite(meter.rates.runwayVideoCreditsPerSecond)?meter.rates.runwayVideoCreditsPerSecond:RUNWAY_VIDEO_CREDITS_PER_SECOND[model];return credits==null?null:credits*meter.rates.runwayCreditUsd;}
function runwayImageRate(model,meter){const credits=Number.isFinite(meter.rates.runwayImageCreditsPerImage)?meter.rates.runwayImageCreditsPerImage:RUNWAY_IMAGE_CREDITS[model];return credits==null?null:credits*meter.rates.runwayCreditUsd;}

export function meterSearchProvider(provider,meter){
  return {name:provider.name||'tavily',async search(query,options){
    const result=await provider.search(query,options);
    const credits=1;
    await meter.record({stage:'research',provider:provider.name||'tavily',model:'basic-search',operation:'search',inputUnits:credits,unitName:'credit',quantity:1,costUsd:credits*meter.rates.tavilyCreditUsd,estimated:true,pricingSource:'tavily-paygo-2026-09-08',metadata:{query,resultCount:result.length,searchDepth:'basic'}});
    return result;
  }};
}

export function meterTextModel(model,meter){
  return {name:model.name,async generateJson(input){
    const result=await model.generateJson(input);
    const modelId=String(model.name||'').replace(/^openai:/,'');
    const rates=openAiRates(modelId,meter);
    const inputTokens=Number(result.usage?.inputTokens??0),outputTokens=Number(result.usage?.outputTokens??0);
    const cost=rates?(inputTokens/1_000_000*rates.input+outputTokens/1_000_000*rates.output):null;
    await meter.record({stage:textStage(input.schemaName),provider:'openai',model:modelId,operation:`responses:${input.schemaName}`,inputUnits:inputTokens,outputUnits:outputTokens,unitName:'token',quantity:1,costUsd:cost,estimated:true,pricingSource:rates?'openai-api-pricing-2026-09-08':'unpriced-model',metadata:{schemaName:input.schemaName,inputUsdPerMillion:rates?.input??null,outputUsdPerMillion:rates?.output??null}});
    return {...result,usage:{...(result.usage??{}),costUsd:cost??result.usage?.costUsd}};
  }};
}

export function meterVoiceProvider(provider,meter,options={}){
  return {name:provider.name||'elevenlabs',async synthesize(input){
    const asset=await provider.synthesize(input);
    const modelId=String(asset.model||options.model||'eleven_multilingual_v2');
    const chars=[...String(input.text||'')].length;
    const rate=voiceRate(modelId,meter);
    const cost=chars/1000*rate;
    await meter.record({stage:'voice',provider:provider.name||'elevenlabs',model:modelId,operation:'text-to-speech',inputUnits:chars,unitName:'character',durationSeconds:asset.durationSeconds??null,quantity:1,costUsd:cost,estimated:true,pricingSource:'elevenlabs-api-pricing-2026-09-08',metadata:{usdPerThousandCharacters:rate,language:input.language,voiceId:input.voice}});
    return {...asset,costUsd:round(cost)};
  }};
}

export function meterImageProvider(provider,meter,options={}){
  return {name:provider.name||'runway',async generate(input){
    const asset=await provider.generate(input);
    const modelId=String(asset.model||options.model||'gen4_image');
    const cost=runwayImageRate(modelId,meter);
    const isThumbnail=/thumbnail/i.test(String(input.prompt||''));
    await meter.record({stage:isThumbnail?'thumbnail':'image',provider:provider.name||'runway',model:modelId,operation:'image-generation',inputUnits:1,unitName:'image',quantity:1,costUsd:cost,estimated:true,pricingSource:cost==null?'unpriced-model':'runway-dev-pricing-2026-09-08',metadata:{aspectRatio:input.aspectRatio,referenceCount:input.referenceUris?.length??0,usdPerImage:cost}});
    return {...asset,costUsd:cost==null?asset.costUsd:round(cost)};
  }};
}

export function meterVideoProvider(provider,meter,options={}){
  return {name:provider.name||'runway',async generate(input){
    const asset=await provider.generate(input);
    const modelId=String(asset.model||options.model||'gen4.5');
    const seconds=Math.max(0,Number(input.durationSeconds||0));
    const perSecond=runwayVideoRate(modelId,meter);
    const cost=perSecond==null?null:seconds*perSecond;
    await meter.record({stage:'video',provider:provider.name||'runway',model:modelId,operation:'video-generation',durationSeconds:seconds,inputUnits:seconds,unitName:'second',quantity:1,costUsd:cost,estimated:true,pricingSource:cost==null?'unpriced-model':'runway-dev-pricing-2026-09-08',metadata:{aspectRatio:input.aspectRatio,referenceCount:input.referenceUris?.length??0,usdPerSecond:perSecond}});
    return {...asset,costUsd:cost==null?asset.costUsd:round(cost)};
  }};
}
