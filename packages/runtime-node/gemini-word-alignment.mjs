import { readFile } from 'node:fs/promises';

const sleep=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
const round6=(value)=>Math.round(Number(value||0)*1_000_000)/1_000_000;
const normalizeWord=(value)=>String(value??'').normalize('NFKD').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');
const parseOffset=(value)=>{const n=Number(String(value??'').replace(/s$/i,''));return Number.isFinite(n)?Math.max(0,n):null;};

async function request(fetchFn,url,apiKey,init={},attempts=4){
  let last;
  for(let attempt=0;attempt<attempts;attempt+=1){
    try{
      const response=await fetchFn(url,{...init,headers:{'x-goog-api-key':apiKey,...(init.headers??{})}});
      if(response.ok)return response;
      const body=(await response.text()).slice(0,800);
      last=new Error(`Gemini alignment request failed ${response.status}: ${body}`);
      if(![408,429,500,502,503,504].includes(response.status))break;
    }catch(error){last=error instanceof Error?error:new Error(String(error));}
    if(attempt<attempts-1)await sleep(Math.min(8000,500*2**attempt));
  }
  throw last??new Error('Gemini alignment request failed');
}

async function loadAssetBytes(uri,fetchFn){
  if(String(uri).startsWith('file://'))return new Uint8Array(await readFile(new URL(uri)));
  if(/^https?:\/\//i.test(String(uri))){const response=await fetchFn(uri);if(!response.ok)throw new Error(`Cannot load synthesized voice for alignment: HTTP ${response.status}`);return new Uint8Array(await response.arrayBuffer());}
  return new Uint8Array(await readFile(String(uri)));
}

function sourceTokens(text){
  const tokens=[];const regex=/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;let match;
  while((match=regex.exec(text))!==null)tokens.push({text:match[0],normalized:normalizeWord(match[0]),start:match.index,end:match.index+match[0].length});
  return tokens;
}

function extractWords(interaction){
  const words=[];
  for(const step of interaction?.steps??[])for(const content of step?.content??[])for(const annotation of content?.annotations??[]){
    if(annotation?.type!=='word_info')continue;
    const start=parseOffset(annotation.start_offset??annotation.startOffset),end=parseOffset(annotation.end_offset??annotation.endOffset),text=String(annotation.text??'').trim();
    if(text&&start!=null&&end!=null&&end>start)words.push({text,normalized:normalizeWord(text),start,end});
  }
  return words;
}

export function wordTimestampsToCharacterAlignment(text,words,durationSeconds){
  // RegExp match.index and String.length use UTF-16 code-unit offsets. Keep the alignment arrays
  // in the same coordinate system so emoji/non-BMP characters cannot shift every later timestamp.
  const characters=String(text).split('');
  const starts=Array(characters.length).fill(Number.NaN),ends=Array(characters.length).fill(Number.NaN);
  const tokens=sourceTokens(String(text));let tokenCursor=0,matchedCharacters=0;
  for(const word of words){
    if(!word.normalized)continue;
    let matchIndex=-1;
    for(let i=tokenCursor;i<Math.min(tokens.length,tokenCursor+7);i+=1){if(tokens[i].normalized===word.normalized){matchIndex=i;break;}}
    if(matchIndex<0)continue;
    const token=tokens[matchIndex];tokenCursor=matchIndex+1;
    const span=Math.max(1,token.end-token.start),step=Math.max(0.001,(word.end-word.start)/span);
    for(let i=token.start;i<token.end&&i<characters.length;i+=1){starts[i]=word.start+(i-token.start)*step;ends[i]=Math.min(word.end,word.start+(i-token.start+1)*step);matchedCharacters+=1;}
  }
  const duration=Math.max(0.1,Number(durationSeconds??words.at(-1)?.end??0.1));
  let lastKnownEnd=0;
  for(let i=0;i<characters.length;i+=1){
    if(Number.isFinite(starts[i])&&Number.isFinite(ends[i])){lastKnownEnd=ends[i];continue;}
    let next=i+1;while(next<characters.length&&!Number.isFinite(starts[next]))next+=1;
    const nextStart=next<characters.length?starts[next]:duration;
    let gapEnd=i;while(gapEnd+1<characters.length&&!Number.isFinite(starts[gapEnd+1]))gapEnd+=1;
    const count=Math.max(1,gapEnd-i+1),step=Math.max(0,(nextStart-lastKnownEnd)/count);
    for(let j=i;j<=gapEnd;j+=1){starts[j]=Math.min(duration,lastKnownEnd+(j-i)*step);ends[j]=Math.min(duration,lastKnownEnd+(j-i+1)*step);}
    lastKnownEnd=ends[gapEnd];i=gapEnd;
  }
  const coverage=matchedCharacters/Math.max(1,tokens.reduce((sum,token)=>sum+(token.end-token.start),0));
  return{alignment:{characters,characterStartTimesSeconds:starts,characterEndTimesSeconds:ends},coverage};
}

export function withGeminiWordAlignment(provider,options={}){
  const fetchFn=options.fetchFn??fetch;const apiKey=String(options.apiKey||'').trim();const model=options.model??'gemini-3.5-transcribe';const strict=options.strict!==false;const minCoverage=Number.isFinite(Number(options.minCoverage))?Number(options.minCoverage):0.88;
  if(!apiKey)throw new Error('Gemini word alignment requires GEMINI_API_KEY');
  return{name:provider.name,async synthesize(input){
    const asset=await provider.synthesize(input);const bytes=await loadAssetBytes(asset.uri,fetchFn);const mimeType=asset.mimeType||'audio/wav';let fileName=null;
    try{
      const start=await request(fetchFn,'https://generativelanguage.googleapis.com/upload/v1beta/files',apiKey,{method:'POST',headers:{'X-Goog-Upload-Protocol':'resumable','X-Goog-Upload-Command':'start','X-Goog-Upload-Header-Content-Length':String(bytes.byteLength),'X-Goog-Upload-Header-Content-Type':mimeType,'Content-Type':'application/json'},body:JSON.stringify({file:{display_name:`auto-ytb-voice-${Date.now()}`}})});
      const uploadUrl=start.headers.get('x-goog-upload-url');if(!uploadUrl)throw new Error('Gemini Files API did not return x-goog-upload-url');
      const uploaded=await request(fetchFn,uploadUrl,apiKey,{method:'POST',headers:{'Content-Length':String(bytes.byteLength),'X-Goog-Upload-Offset':'0','X-Goog-Upload-Command':'upload, finalize','Content-Type':mimeType},body:bytes});
      const fileInfo=await uploaded.json();const fileUri=fileInfo?.file?.uri;fileName=fileInfo?.file?.name??null;if(!fileUri)throw new Error('Gemini Files API finalized without file.uri');
      const interaction=await request(fetchFn,'https://generativelanguage.googleapis.com/v1beta/interactions',apiKey,{method:'POST',headers:{'Content-Type':'application/json','Api-Revision':'2026-05-20'},body:JSON.stringify({model,input:[{type:'audio',uri:fileUri,mime_type:mimeType}],generation_config:{transcription_config:{language_codes:input.language?[input.language]:[],mode:{type:'verbatim',timestamp_granularities:['word']}}}})});
      const json=await interaction.json();const words=extractWords(json);if(!words.length)throw new Error('Gemini Transcribe returned no word_info timestamps');
      const converted=wordTimestampsToCharacterAlignment(input.text,words,asset.durationSeconds??words.at(-1)?.end);
      if(converted.coverage<minCoverage)throw new Error(`Gemini word alignment coverage ${Math.round(converted.coverage*100)}% is below required ${Math.round(minCoverage*100)}%`);
      const duration=Math.max(Number(asset.durationSeconds??0),Number(words.at(-1)?.end??0));const transcriptionCostUsd=round6(duration/60*0.005);
      return{...asset,durationSeconds:duration,alignment:converted.alignment,metadata:{...(asset.metadata??{}),alignmentSource:'gemini-word-timestamps',alignmentCoverage:round6(converted.coverage),transcriptionModel:model,transcriptionWordCount:words.length,transcriptionCostUsd}};
    }catch(error){
      if(strict)throw error;
      return{...asset,metadata:{...(asset.metadata??{}),alignmentSource:'approximate-fallback',alignmentError:error instanceof Error?error.message:String(error)}};
    }finally{
      if(fileName){try{await fetchFn(`https://generativelanguage.googleapis.com/v1beta/${fileName}`,{method:'DELETE',headers:{'x-goog-api-key':apiKey}});}catch{/* best-effort cleanup */}}
    }
  }};
}

export function withGeminiAlignmentMeter(provider,meter){
  return{name:provider.name,async synthesize(input){const asset=await provider.synthesize(input);const transcriptionCostUsd=Number(asset.metadata?.transcriptionCostUsd??0);if(transcriptionCostUsd>0){await meter.record({stage:'voice',provider:'gemini',model:String(asset.metadata?.transcriptionModel??'gemini-3.5-transcribe'),operation:'word-timestamp-transcription',durationSeconds:asset.durationSeconds??null,inputUnits:asset.durationSeconds??null,unitName:'audio-second',quantity:1,costUsd:transcriptionCostUsd,estimated:true,pricingSource:'gemini-api-pricing-2026-09-09',metadata:{alignmentCoverage:asset.metadata?.alignmentCoverage??null,wordCount:asset.metadata?.transcriptionWordCount??null,usdPerMinute:0.005}});}return{...asset,costUsd:round6(Number(asset.costUsd??0)+transcriptionCostUsd)};}};
}
