import type { AudioQualityEvaluation, AudioQualityProvider, BinaryAsset, ImageProvider, ObjectStore, SearchProvider, SearchResult, VideoProvider, VisionEvaluation, VisionProvider, VoiceAsset, VoiceProvider } from './types.js';

const BufferAny:any=Buffer;
function base64FromBytes(data:any):string{return BufferAny.from(data).toString('base64');}

function sleep(ms:number){return new Promise((resolve)=>setTimeout(resolve,ms));}
function baseUrl(value?:string){return String(value||'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/,'');}
const OFFICIAL_HOSTS=['cursor.com','openai.com','cloudflare.com','anthropic.com','google.com','github.com','microsoft.com','meta.com','apple.com','nvidia.com','samsung.com','intel.com','amd.com','mozilla.org','w3.org','ietf.org'];
function titleHost(value:string){const match=String(value).match(/(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?:[/:\s]|$)/i);return match?.[1]?.toLowerCase()??'';}
function officialHost(host:string){return /\.gov$|\.gov\.|\.edu$|\.edu\./.test(host)||OFFICIAL_HOSTS.some((domain)=>host===domain||host.endsWith(`.${domain}`));}
function inferSourceType(url:string,title=''):SearchResult['sourceType']{
  try{
    const urlHost=new URL(url).hostname.replace(/^www\./,'').toLowerCase();
    const redirect=urlHost==='vertexaisearch.cloud.google.com'||urlHost.endsWith('.vertexaisearch.cloud.google.com');
    const host=redirect?titleHost(title):urlHost;
    if(officialHost(host))return 'official';
    if(/reuters\.com$|apnews\.com$|bbc\.|nytimes\.com$|ft\.com$|wsj\.com$|theguardian\.com$/.test(host))return 'news';
    if(/reddit\.com$|news\.ycombinator\.com$/.test(host))return 'community';
    return 'reference';
  }catch{return 'unknown';}
}
function geminiImageAspectRatio(value:string){const map:Record<string,string>={'1:1':'ASPECT_RATIO_ONE_BY_ONE','2:3':'ASPECT_RATIO_TWO_BY_THREE','3:2':'ASPECT_RATIO_THREE_BY_TWO','3:4':'ASPECT_RATIO_THREE_BY_FOUR','4:3':'ASPECT_RATIO_FOUR_BY_THREE','4:5':'ASPECT_RATIO_FOUR_BY_FIVE','5:4':'ASPECT_RATIO_FIVE_BY_FOUR','9:16':'ASPECT_RATIO_NINE_BY_SIXTEEN','16:9':'ASPECT_RATIO_SIXTEEN_BY_NINE','9:21':'ASPECT_RATIO_NINE_BY_TWENTY_ONE','21:9':'ASPECT_RATIO_TWENTY_ONE_BY_NINE'};return map[value]??value;}
async function request(fetchFn:typeof fetch,url:string,apiKey:string,init:RequestInit={},attempts=4){
  let last='';for(let i=0;i<attempts;i+=1){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),120000);let response:Response;try{response=await fetchFn(url,{...init,signal:init.signal??controller.signal,headers:{'x-goog-api-key':apiKey,...(init.headers??{})}});}catch(error){if(controller.signal.aborted)throw new Error(`Gemini API request timed out after 120s: ${url}`);throw error;}finally{clearTimeout(timer);}if(response.ok)return response;last=`${response.status}: ${(await response.text()).slice(0,800)}`;if(![429,500,502,503,504].includes(response.status))break;await sleep(Math.min(8000,500*2**i));}throw new Error(`Gemini API request failed ${last}`);
}
function findBlocks(json:any,type:string):any[]{const out:any[]=[];const visit=(value:any)=>{if(!value||typeof value!=='object')return;if(value.type===type)out.push(value);if(Array.isArray(value)){for(const item of value)visit(item);return;}for(const child of Object.values(value))visit(child);};visit(json);return out;}
function textFromResponse(json:any):string{const typed=findBlocks(json,'text').map((block)=>String(block.text??'')).find(Boolean);if(typed)return typed;const values:string[]=[];const visit=(value:any)=>{if(!value||typeof value!=='object')return;if(typeof value.text==='string'&&value.text.trim())values.push(value.text);if(Array.isArray(value)){for(const item of value)visit(item);return;}for(const child of Object.values(value))visit(child);};visit(json);const text=values.find(Boolean);if(text)return text;throw new Error('Gemini quality response contained no text');}
function wavFromPcm(pcm:Uint8Array,sampleRate=24000,channels=1,bits=16){const out=new Uint8Array(44+pcm.byteLength);const view=new DataView(out.buffer);const text=(offset:number,value:string)=>{for(let i=0;i<value.length;i+=1)out[offset+i]=value.charCodeAt(i);};text(0,'RIFF');view.setUint32(4,36+pcm.byteLength,true);text(8,'WAVE');text(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,channels,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*channels*bits/8,true);view.setUint16(32,channels*bits/8,true);view.setUint16(34,bits,true);text(36,'data');view.setUint32(40,pcm.byteLength,true);out.set(pcm,44);return out;}
function approximateAlignment(text:string,duration:number){const characters=[...text];const step=duration/Math.max(1,characters.length);return{characters,characterStartTimesSeconds:characters.map((_,i)=>i*step),characterEndTimesSeconds:characters.map((_,i)=>(i+1)*step)};}
function veoDuration(value:number,resolution:string,hasReferences:boolean){if(resolution!=='720p'||hasReferences)return 8;const n=Number(value);if(n<=5)return 4;if(n<=7)return 6;return 8;}
export class GeminiGoogleSearchProvider implements SearchProvider{
  readonly name='gemini-search';
  constructor(private readonly options:{apiKey:string;model?:string;endpoint?:string;fetchFn?:typeof fetch}){}
  async search(query:string,options?:{limit?:number;recencyDays?:number;domains?:string[]}):Promise<SearchResult[]>{
    const fetchFn=this.options.fetchFn??fetch;const limit=Math.max(1,Math.min(20,options?.limit??8));const constraints=[options?.recencyDays?`Prefer sources published in the last ${options.recencyDays} days.`:'',options?.domains?.length?`Prefer these domains: ${options.domains.join(', ')}.`:''].filter(Boolean).join(' ');
    const response=await request(fetchFn,`${baseUrl(this.options.endpoint)}/interactions`,this.options.apiKey,{method:'POST',headers:{'content-type':'application/json','Api-Revision':'2026-05-20'},body:JSON.stringify({model:this.options.model??'gemini-3.7-flash',input:`Research this query for a factual video dossier: ${query}. ${constraints} Return a concise synthesis grounded in web sources.`,tools:[{type:'google_search'}]})});
    const json=await response.json() as any;const seen=new Set<string>();const results:SearchResult[]=[];
    for(const block of findBlocks(json,'text')){const blockText=String(block.text??'');for(const annotation of block.annotations??[]){if(annotation?.type!=='url_citation'||!annotation.url||seen.has(annotation.url))continue;seen.add(annotation.url);const title=String(annotation.title||new URL(annotation.url).hostname);const start=Number(annotation.start_index??annotation.startIndex??0),end=Number(annotation.end_index??annotation.endIndex??blockText.length);results.push({id:`gemini-${results.length}-${encodeURIComponent(annotation.url).slice(-36)}`,title,url:String(annotation.url),snippet:blockText.slice(Math.max(0,start),Math.max(start,end)).trim()||blockText.slice(0,500),sourceType:inferSourceType(String(annotation.url),title)});if(results.length>=limit)return results;}}
    return results;
  }
}

const GEMINI_VOICES=new Set(['Achernar','Achird','Algenib','Algieba','Alnilam','Aoede','Autonoe','Callirrhoe','Charon','Despina','Enceladus','Erinome','Fenrir','Gacrux','Iapetus','Kore','Laomedeia','Leda','Orus','Puck','Pulcherrima','Rasalgethi','Sadachbia','Sadaltager','Schedar','Sulafat','Umbriel','Vindemiatrix','Zephyr','Zubenelgenubi']);
export class GeminiVoiceProvider implements VoiceProvider{
  readonly name='gemini-tts';
  constructor(private readonly options:{apiKey:string;store:ObjectStore;model?:string;defaultVoice?:string;endpoint?:string;fetchFn?:typeof fetch}){}
  async synthesize(input:{text:string;voice:string;language:string}):Promise<VoiceAsset>{
    const fetchFn=this.options.fetchFn??fetch;const voice=GEMINI_VOICES.has(input.voice)?input.voice:(this.options.defaultVoice??'Kore');const model=this.options.model??'gemini-3.1-flash-tts-preview';
    const response=await request(fetchFn,`${baseUrl(this.options.endpoint)}/interactions`,this.options.apiKey,{method:'POST',headers:{'content-type':'application/json','Api-Revision':'2026-05-20'},body:JSON.stringify({model,input:`Synthesize speech only. Language: ${input.language}. Read the transcript exactly and naturally.\n\nTRANSCRIPT:\n${input.text}`,response_format:{type:'audio'},generation_config:{speech_config:[{voice,language:input.language}]}})});
    const json=await response.json() as any;const audio=json?.output_audio??findBlocks(json,'audio')[0];if(!audio?.data)throw new Error('Gemini TTS response contained no audio data');const pcm=new Uint8Array(Buffer.from(String(audio.data),'base64'));const wav=wavFromPcm(pcm);const duration=Math.max(0.1,pcm.byteLength/(24000*2));const key=`gemini/voice/${Date.now()}-${Math.random().toString(36).slice(2)}.wav`;const stored=await this.options.store.put({key,contentType:'audio/wav',data:wav});return{id:key.replace(/[^a-z0-9]/gi,'-'),uri:stored.uri,mimeType:'audio/wav',bytes:stored.bytes,provider:this.name,model,language:input.language,voiceId:voice,durationSeconds:duration,alignment:approximateAlignment(input.text,duration)};
  }
}

export class GeminiImageProvider implements ImageProvider{
  readonly name='gemini-image';
  constructor(private readonly options:{apiKey:string;store:ObjectStore;model?:string;imageSize?:string;endpoint?:string;fetchFn?:typeof fetch}){}
  async generate(input:{prompt:string;aspectRatio:string;referenceUris?:string[]}):Promise<BinaryAsset>{
    const fetchFn=this.options.fetchFn??fetch;const model=this.options.model??'gemini-2.5-flash-image';const base=baseUrl(this.options.endpoint);
    if(model.startsWith('gemini-3.1-')){
      const response=await request(fetchFn,`${base}/interactions`,this.options.apiKey,{method:'POST',headers:{'content-type':'application/json','Api-Revision':'2026-05-20'},body:JSON.stringify({model,input:input.prompt,response_format:{type:'image',aspect_ratio:input.aspectRatio,image_size:this.options.imageSize??'1K'}})});
      const json=await response.json() as any;const block=findBlocks(json,'image').find((candidate)=>candidate?.data||candidate?.image_data||candidate?.inlineData);const encoded=String(block?.data??block?.image_data??block?.inlineData?.data??'');const mimeType=String(block?.mime_type??block?.mimeType??block?.inlineData?.mimeType??'image/png');
      if(!encoded)throw new Error('Gemini image interaction contained no image data');const bytes=new Uint8Array(Buffer.from(encoded,'base64'));const ext=mimeType.includes('jpeg')?'jpg':'png';const key=`gemini/image/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;const stored=await this.options.store.put({key,contentType:mimeType,data:bytes});return{id:key.replace(/[^a-z0-9]/gi,'-'),uri:stored.uri,mimeType,bytes:stored.bytes,provider:this.name,model,metadata:{aspectRatio:input.aspectRatio,imageSize:this.options.imageSize??'1K',referenceCount:input.referenceUris?.length??0,synthId:true}};
    }
    const imageConfig:any={aspectRatio:geminiImageAspectRatio(input.aspectRatio)};if(model.startsWith('gemini-3.1-'))imageConfig.imageSize=this.options.imageSize??'1K';
    const response=await request(fetchFn,`${base}/models/${encodeURIComponent(model)}:generateContent`,this.options.apiKey,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:input.prompt}]}],generationConfig:{responseModalities:['IMAGE'],responseFormat:{image:imageConfig}}})});
    const json=await response.json() as any;let encoded:string|undefined;let mimeType='image/png';
    for(const candidate of json?.candidates??[])for(const part of candidate?.content?.parts??[]){const inline=part?.inlineData??part?.inline_data;if(inline?.data){encoded=String(inline.data);mimeType=String(inline.mimeType??inline.mime_type??'image/png');break;}if(part?.image?.data){encoded=String(part.image.data);mimeType=String(part.image.mimeType??part.image.mime_type??'image/png');break;}}
    if(!encoded)throw new Error('Gemini image response contained no image data');const bytes=new Uint8Array(Buffer.from(encoded,'base64'));const ext=mimeType.includes('jpeg')?'jpg':'png';const key=`gemini/image/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;const stored=await this.options.store.put({key,contentType:mimeType,data:bytes});return{id:key.replace(/[^a-z0-9]/gi,'-'),uri:stored.uri,mimeType,bytes:stored.bytes,provider:this.name,model,metadata:{aspectRatio:input.aspectRatio,referenceCount:input.referenceUris?.length??0,synthId:true}};
  }
}

const VISION_SCHEMA={type:'object',additionalProperties:false,required:['observedMeaning','relevanceScore','continuityScore','artifactQualityScore','issues'],properties:{observedMeaning:{type:'string'},relevanceScore:{type:'number'},continuityScore:{type:'number'},artifactQualityScore:{type:'number'},issues:{type:'array',items:{type:'string'}}}};
function qualityScore(value:any):number{const numeric=Number(value);const normalized=numeric>=0&&numeric<=10?numeric*10:numeric;return Math.max(0,Math.min(100,normalized));}
export class GeminiVisionProvider implements VisionProvider{
  readonly name='gemini-vision';
  constructor(private readonly options:{apiKey:string;model?:string;endpoint?:string;fetchFn?:typeof fetch}){}
  async evaluate(input:{prompt:string;imageData:any;mimeType:string}):Promise<VisionEvaluation>{
    const fetchFn=this.options.fetchFn??fetch;const model=this.options.model??'gemini-3.8-flash';const base=baseUrl(this.options.endpoint);const response=await request(fetchFn,`${base}/models/${encodeURIComponent(model)}:generateContent`,this.options.apiKey,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({contents:[{role:'user',parts:[{text:input.prompt},{inlineData:{mimeType:input.mimeType,data:base64FromBytes(input.imageData)}}]}],generationConfig:{responseMimeType:'application/json',responseJsonSchema:VISION_SCHEMA}})});const json=await response.json() as any;const parsed=JSON.parse(textFromResponse(json));return{observedMeaning:String(parsed.observedMeaning??''),relevanceScore:qualityScore(parsed.relevanceScore),continuityScore:qualityScore(parsed.continuityScore),artifactQualityScore:qualityScore(parsed.artifactQualityScore),issues:Array.isArray(parsed.issues)?parsed.issues.map((item:any)=>String(item)):[],usage:{inputTokens:Number(json?.usageMetadata?.promptTokenCount)||undefined,outputTokens:Number(json?.usageMetadata?.candidatesTokenCount)||undefined}};
  }
}

const AUDIO_QUALITY_SCHEMA={type:'object',additionalProperties:false,required:['pronunciation','naturalness','pace','energy','pauses','issues'],properties:{pronunciation:{type:'string',enum:['PASS','WARN']},naturalness:{type:'string',enum:['PASS','WARN']},pace:{type:'string',enum:['PASS','WARN']},energy:{type:'string',enum:['PASS','WARN']},pauses:{type:'string',enum:['PASS','WARN']},issues:{type:'array',items:{type:'string'}}}};
export class GeminiAudioQualityProvider implements AudioQualityProvider{
  readonly name='gemini-audio-qc';
  constructor(private readonly options:{apiKey:string;model?:string;endpoint?:string;fetchFn?:typeof fetch}){}
  async evaluate(input:{prompt:string;audioData:any;mimeType:string}):Promise<AudioQualityEvaluation>{
    const fetchFn=this.options.fetchFn??fetch;const model=this.options.model??'gemini-3.8-flash';const base=baseUrl(this.options.endpoint);const response=await request(fetchFn,`${base}/models/${encodeURIComponent(model)}:generateContent`,this.options.apiKey,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({contents:[{role:'user',parts:[{text:input.prompt},{inlineData:{mimeType:input.mimeType,data:base64FromBytes(input.audioData)}}]}],generationConfig:{responseMimeType:'application/json',responseJsonSchema:AUDIO_QUALITY_SCHEMA}})});const json=await response.json() as any;const parsed=JSON.parse(textFromResponse(json));return{pronunciation:parsed.pronunciation==='PASS'?'PASS':'WARN',naturalness:parsed.naturalness==='PASS'?'PASS':'WARN',pace:parsed.pace==='PASS'?'PASS':'WARN',energy:parsed.energy==='PASS'?'PASS':'WARN',pauses:parsed.pauses==='PASS'?'PASS':'WARN',issues:Array.isArray(parsed.issues)?parsed.issues.map((item:any)=>String(item)):[],usage:{inputTokens:Number(json?.usageMetadata?.promptTokenCount)||undefined,outputTokens:Number(json?.usageMetadata?.candidatesTokenCount)||undefined}};
  }
}

type VideoOperation={name?:string;done?:boolean;error?:{message?:string};response?:{generateVideoResponse?:{generatedSamples?:Array<{video?:{uri?:string}}>}}};
export class GeminiVideoProvider implements VideoProvider{
  readonly name='gemini-video';
  constructor(private readonly options:{apiKey:string;store:ObjectStore;model?:string;resolution?:string;endpoint?:string;pollMs?:number;timeoutMs?:number;fetchFn?:typeof fetch}){}
  async generate(input:{prompt:string;durationSeconds:number;aspectRatio:string;referenceUris?:string[]}):Promise<BinaryAsset>{
    const fetchFn=this.options.fetchFn??fetch;const model=this.options.model??'veo-3.1-fast-generate-preview';const base=baseUrl(this.options.endpoint);const resolution=this.options.resolution??'720p';const duration=veoDuration(input.durationSeconds,resolution,Boolean(input.referenceUris?.length));
    const create=await request(fetchFn,`${base}/models/${encodeURIComponent(model)}:predictLongRunning`,this.options.apiKey,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({instances:[{prompt:input.prompt}],parameters:{aspectRatio:input.aspectRatio,resolution,durationSeconds:duration}})});
    let op=await create.json() as VideoOperation;if(!op.name)throw new Error('Gemini Veo did not return an operation name');const started=Date.now();while(!op.done){if(Date.now()-started>(this.options.timeoutMs??900000))throw new Error(`Gemini Veo operation ${op.name} timed out`);await sleep(this.options.pollMs??10000);const status=await request(fetchFn,`${base}/${op.name}`,this.options.apiKey);op=await status.json() as VideoOperation;}if(op.error)throw new Error(`Gemini Veo failed: ${op.error.message??'unknown error'}`);const uri=op.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;if(!uri)throw new Error('Gemini Veo completed without a video URI');const download=await request(fetchFn,uri,this.options.apiKey);const bytes=new Uint8Array(await download.arrayBuffer());const key=`gemini/video/${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`;const stored=await this.options.store.put({key,contentType:'video/mp4',data:bytes});return{id:key.replace(/[^a-z0-9]/gi,'-'),uri:stored.uri,mimeType:'video/mp4',bytes:stored.bytes,provider:this.name,model,metadata:{aspectRatio:input.aspectRatio,requestedDurationSeconds:input.durationSeconds,generatedDurationSeconds:duration,resolution,referenceCount:input.referenceUris?.length??0,synthId:true}};
  }
}
