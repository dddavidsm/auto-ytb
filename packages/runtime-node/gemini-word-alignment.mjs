import { readFile } from 'node:fs/promises';

const sleep=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
const round6=(value)=>Math.round(Number(value||0)*1_000_000)/1_000_000;
const normalizeWord=(value)=>{
  const normalized=String(value??'').normalize('NFKD').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');
  const aliases={metre:'m',metres:'m',meter:'m',meters:'m',kilometre:'km',kilometres:'km',kilometer:'km',kilometers:'km'};
  return aliases[normalized]??normalized;
};
const numberTens={twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90};
const numberUnits={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9};
function numberValueAt(items,index){
  const current=items[index]?.normalized??'';
  if(/^\d+$/.test(current))return{value:Number(current),span:1};
  if(numberTens[current]!=null){const next=items[index+1]?.normalized;return numberUnits[next]!=null?{value:numberTens[current]+numberUnits[next],span:2}:{value:numberTens[current],span:1};}
  if(numberUnits[current]!=null){const next=items[index+1]?.normalized;
    if(next==='thousand'||next==='hundred'){
      const multiplier=next==='thousand'?1000:100;let value=numberUnits[current]*multiplier;let span=2;const after=items[index+2]?.normalized;
      if(numberUnits[after]!=null){value+=numberUnits[after];span+=1;}
      return{value,span};
    }
    return{value:numberUnits[current],span:1};
  }
  return null;
}
const parseOffset=(value)=>{const n=Number(String(value??'').replace(/s$/i,''));return Number.isFinite(n)?Math.max(0,n):null;};

async function request(fetchFn,url,apiKey,init={},attempts=4){
  let last;
  for(let attempt=0;attempt<attempts;attempt+=1){
    try{
      const response=await fetchFn(url,{...init,headers:{...(apiKey?{'x-goog-api-key':apiKey}:{}),...(init.headers??{})}});
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
  const visit=(value)=>{
    if(!value||typeof value!=='object')return;
    if(Array.isArray(value)){for(const item of value)visit(item);return;}
    if(value.type==='word_info'){
      const start=parseOffset(value.start_offset??value.startOffset),end=parseOffset(value.end_offset??value.endOffset),text=String(value.text??value.word??'').trim();
      if(text&&start!=null&&end!=null&&end>start)words.push({text,normalized:normalizeWord(text),start,end});
    }
    for(const child of Object.values(value))visit(child);
  };
  visit(interaction);
  words.sort((a,b)=>a.start-b.start||a.end-b.end);
  return words;
}

export function wordTimestampsToCharacterAlignment(text,words,durationSeconds){
  // RegExp match.index and String.length use UTF-16 code-unit offsets. Keep the alignment arrays
  // in the same coordinate system so emoji/non-BMP characters cannot shift every later timestamp.
  const characters=String(text).split('');
  const starts=Array(characters.length).fill(Number.NaN),ends=Array(characters.length).fill(Number.NaN);
  const tokens=sourceTokens(String(text));let tokenCursor=0,matchedCharacters=0;const matchedTokenIndexes=new Set();
  for(let wordIndex=0;wordIndex<words.length;wordIndex+=1){
    const word=words[wordIndex];
    if(!word.normalized)continue;
    let matchIndex=-1;let sourceSpan=1;let providerSpan=1;
    for(let i=tokenCursor;i<Math.min(tokens.length,tokenCursor+7);i+=1){
      const exact=tokens[i].normalized===word.normalized;
      const sourceNumber=numberValueAt(tokens,i),providerNumber=numberValueAt(words,wordIndex);
      const numeric=Boolean(sourceNumber&&providerNumber&&sourceNumber.value===providerNumber.value);
      if(exact||numeric){matchIndex=i;sourceSpan=numeric?sourceNumber.span:1;providerSpan=numeric?providerNumber.span:1;break;}
    }
    if(matchIndex<0)continue;
    const matchedTokens=tokens.slice(matchIndex,matchIndex+sourceSpan);tokenCursor=matchIndex+sourceSpan;
    for(let i=matchIndex;i<matchIndex+sourceSpan;i+=1)matchedTokenIndexes.add(i);
    const wordEnd=words[Math.min(words.length-1,wordIndex+providerSpan-1)].end;
    const totalSpan=Math.max(1,matchedTokens.reduce((sum,item)=>sum+item.end-item.start,0));
    let tokenOffset=0;
    for(const matchedToken of matchedTokens){
      const span=Math.max(1,matchedToken.end-matchedToken.start),step=Math.max(0.001,(wordEnd-word.start)/totalSpan);
      for(let i=matchedToken.start;i<matchedToken.end&&i<characters.length;i+=1){starts[i]=word.start+tokenOffset*step;ends[i]=Math.min(wordEnd,word.start+(tokenOffset+1)*step);matchedCharacters+=1;tokenOffset+=1;}
    }
    wordIndex+=providerSpan-1;
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
  return{alignment:{characters,characterStartTimesSeconds:starts,characterEndTimesSeconds:ends},coverage,unmatchedSourceWords:tokens.filter((_,index)=>!matchedTokenIndexes.has(index)).map((token)=>token.text),providerWords:words.map((word)=>word.text)};
}

export function withGeminiWordAlignment(provider,options={}){
  const fetchFn=options.fetchFn??fetch;const apiKey=String(options.apiKey||'').trim();const model=options.model??'gemini-3.5-transcribe';const strict=options.strict!==false;const minCoverage=Number.isFinite(Number(options.minCoverage))?Number(options.minCoverage):0.88;const configuredRate=options.usdPerMinute??process.env.GEMINI_TRANSCRIBE_USD_PER_MINUTE;const usdPerMinute=Number.isFinite(Number(configuredRate))?Math.max(0,Number(configuredRate)):0.005;
  if(!apiKey)throw new Error('Gemini word alignment requires GEMINI_API_KEY');
  return{name:provider.name,async synthesize(input){
    const asset=await provider.synthesize(input);const bytes=await loadAssetBytes(asset.uri,fetchFn);const mimeType=asset.mimeType||'audio/wav';let fileName=null;
    try{
      const start=await request(fetchFn,'https://generativelanguage.googleapis.com/upload/v1beta/files',apiKey,{method:'POST',headers:{'X-Goog-Upload-Protocol':'resumable','X-Goog-Upload-Command':'start','X-Goog-Upload-Header-Content-Length':String(bytes.byteLength),'X-Goog-Upload-Header-Content-Type':mimeType,'Content-Type':'application/json'},body:JSON.stringify({file:{display_name:`auto-ytb-voice-${Date.now()}`}})});
      const uploadUrl=start.headers.get('x-goog-upload-url');if(!uploadUrl)throw new Error('Gemini Files API did not return x-goog-upload-url');
      // The resumable URL is already authorized by Google. Do not leak/re-attach the API key to it.
      const uploaded=await request(fetchFn,uploadUrl,'',{method:'POST',headers:{'Content-Length':String(bytes.byteLength),'X-Goog-Upload-Offset':'0','X-Goog-Upload-Command':'upload, finalize','Content-Type':mimeType},body:bytes});
      const fileInfo=await uploaded.json();const fileUri=fileInfo?.file?.uri;fileName=fileInfo?.file?.name??null;if(!fileUri)throw new Error('Gemini Files API finalized without file.uri');
      const interaction=await request(fetchFn,'https://generativelanguage.googleapis.com/v1beta/interactions',apiKey,{method:'POST',headers:{'Content-Type':'application/json','Api-Revision':'2026-05-20'},body:JSON.stringify({model,input:[{type:'audio',uri:fileUri,mime_type:mimeType}],generation_config:{transcription_config:{language_codes:input.language?[input.language]:[],mode:{type:'verbatim',timestamp_granularities:['word']}}}})});
      const json=await interaction.json();const words=extractWords(json);if(!words.length)throw new Error('Gemini Transcribe returned no word_info timestamps');
      const converted=wordTimestampsToCharacterAlignment(input.text,words,asset.durationSeconds??words.at(-1)?.end);
      // Coverage is computed from floating-point character spans; a result
      // reported as 88.0% can be a few ulps below the configured 0.88 floor.
      // Keep the real alignment strict while allowing that reporting-scale
      // rounding error, rather than falling back to estimated timing.
      if(converted.coverage+0.001<minCoverage){const detail=converted.unmatchedSourceWords.slice(0,12).join('|');throw new Error(`Gemini word alignment coverage ${Math.round(converted.coverage*100)}% is below required ${Math.round(minCoverage*100)}%; unmatched=${detail}`);}
      const duration=Math.max(Number(asset.durationSeconds??0),Number(words.at(-1)?.end??0));const transcriptionCostUsd=round6(duration/60*usdPerMinute);
      return{...asset,durationSeconds:duration,alignment:converted.alignment,metadata:{...(asset.metadata??{}),alignmentSource:'gemini-word-timestamps',alignmentCoverage:round6(converted.coverage),transcriptionModel:model,transcriptionWordCount:words.length,wordTimestamps:words.map(({text,start,end})=>({word:text,startTime:start,endTime:end,confidence:null})),transcriptionUsdPerMinute:usdPerMinute,transcriptionCostUsd}};
    }catch(error){
      if(strict)throw error;
      return{...asset,metadata:{...(asset.metadata??{}),alignmentSource:'approximate-fallback',alignmentError:error instanceof Error?error.message:String(error)}};
    }finally{
      if(fileName){try{await fetchFn(`https://generativelanguage.googleapis.com/v1beta/${fileName}`,{method:'DELETE',headers:{'x-goog-api-key':apiKey}});}catch{/* best-effort cleanup */}}
    }
  }};
}

export function withGeminiAlignmentMeter(provider,meter){
  return{name:provider.name,async synthesize(input){const asset=await provider.synthesize(input);const transcriptionCostUsd=Number(asset.metadata?.transcriptionCostUsd??0);if(transcriptionCostUsd>0){await meter.record({stage:'voice',provider:'gemini',model:String(asset.metadata?.transcriptionModel??'gemini-3.5-transcribe'),operation:'word-timestamp-transcription',durationSeconds:asset.durationSeconds??null,inputUnits:asset.durationSeconds??null,unitName:'audio-second',quantity:1,costUsd:transcriptionCostUsd,estimated:true,pricingSource:'gemini-api-pricing-configurable',metadata:{alignmentCoverage:asset.metadata?.alignmentCoverage??null,wordCount:asset.metadata?.transcriptionWordCount??null,usdPerMinute:asset.metadata?.transcriptionUsdPerMinute??null}});}return{...asset,costUsd:round6(Number(asset.costUsd??0)+transcriptionCostUsd)};}};
}
