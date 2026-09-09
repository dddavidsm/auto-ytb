import type { BinaryAsset, ImageProvider, ObjectStore, SearchProvider, SearchResult, VideoProvider, VoiceAsset, VoiceProvider } from './types.js';

function sleep(ms:number){return new Promise((resolve)=>setTimeout(resolve,ms));}
function baseUrl(value?:string){return String(value||'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/,'');}
function inferSourceType(url:string):SearchResult['sourceType']{
  try{const host=new URL(url).hostname.replace(/^www\./,'');if(/\.gov$|\.gov\.|\.edu$|\.edu\./.test(host))return 'official';if(/reuters\.com$|apnews\.com$|bbc\.|nytimes\.com$|ft\.com$|wsj\.com$|theguardian\.com$/.test(host))return 'news';if(/reddit\.com$|news\.ycombinator\.com$/.test(host))return 'community';return 'reference';}catch{return 'unknown';}
}
async function request(fetchFn:typeof fetch,url:string,apiKey:string,init:RequestInit={},attempts=4){
  let last='';for(let i=0;i<attempts;i+=1){const response=await fetchFn(url,{...init,headers:{'x-goog-api-key':apiKey,...(init.headers??{})}});if(response.ok)return response;last=`${response.status}: ${(await response.text()).slice(0,800)}`;if(![429,500,502,503,504].includes(response.status))break;await sleep(Math.min(8000,500*2**i));}throw new Error(`Gemini API request failed ${last}`);
}
function findBlocks(json:any,type:string):any[]{const out:any[]=[];const visit=(value:any)=>{if(!value||typeof value!=='object')return;if(value.type===type)out.push(value);if(Array.isArray(value)){for(const item of value)visit(item);return;}for(const child of Object.values(value))visit(child);};visit(json);return out;}
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
    for(const block of findBlocks(json,'text')){const blockText=String(block.text??'');for(const annotation of block.annotations??[]){if(annotation?.type!=='url_citation'||!annotation.url||seen.has(annotation.url))continue;seen.add(annotation.url);const start=Number(annotation.start_index??annotation.startIndex??0),end=Number(annotation.end_index??annotation.endIndex??blockText.length);results.push({id:`gemini-${results.length}-${encodeURIComponent(annotation.url).slice(-36)}`,title:String(annotation.title||new URL(annotation.url).hostname),url:String(annotation.url),snippet:blockText.slice(Math.max(0,start),Math.max(start,end)).trim()||blockText.slice(0,500),sourceType:inferSourceType(String(annotation.url))});if(results.length>=limit)return results;}}
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
    const imageConfig:any={aspectRatio:input.aspectRatio};if(model.startsWith('gemini-3.1-'))imageConfig.imageSize=this.options.imageSize??'1K';
    const response=await request(fetchFn,`${base}/models/${encodeURIComponent(model)}:generateContent`,this.options.apiKey,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:input.prompt}]}],generationConfig:{responseModalities:['IMAGE'],responseFormat:{image:imageConfig}}})});
    const json=await response.json() as any;let encoded:string|undefined;let mimeType='image/png';
    for(const candidate of json?.candidates??[])for(const part of candidate?.content?.parts??[]){const inline=part?.inlineData??part?.inline_data;if(inline?.data){encoded=String(inline.data);mimeType=String(inline.mimeType??inline.mime_type??'image/png');break;}if(part?.image?.data){encoded=String(part.image.data);mimeType=String(part.image.mimeType??part.image.mime_type??'image/png');break;}}
    if(!encoded)throw new Error('Gemini image response contained no image data');const bytes=new Uint8Array(Buffer.from(encoded,'base64'));const ext=mimeType.includes('jpeg')?'jpg':'png';const key=`gemini/image/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;const stored=await this.options.store.put({key,contentType:mimeType,data:bytes});return{id:key.replace(/[^a-z0-9]/gi,'-'),uri:stored.uri,mimeType,bytes:stored.bytes,provider:this.name,model,metadata:{aspectRatio:input.aspectRatio,referenceCount:input.referenceUris?.length??0,synthId:true}};
  }
}

type VideoOperation={name?:string;done?:boolean;error?:{message?:string};response?:{generateVideoResponse?:{generatedSamples?:Array<{video?:{uri?:string}}>}}};
export class GeminiVideoProvider implements VideoProvider{
  readonly name='gemini-video';
  constructor(private readonly options:{apiKey:string;store:ObjectStore;model?:string;resolution?:string;endpoint?:string;pollMs?:number;timeoutMs?:number;fetchFn?:typeof fetch}){}
  async generate(input:{prompt:string;durationSeconds:number;aspectRatio:string;referenceUris?:string[]}):Promise<BinaryAsset>{
    const fetchFn=this.options.fetchFn??fetch;const model=this.options.model??'veo-3.1-fast-generate-preview';const base=baseUrl(this.options.endpoint);const resolution=this.options.resolution??'720p';const duration=veoDuration(input.durationSeconds,resolution,Boolean(input.referenceUris?.length));
    const create=await request(fetchFn,`${base}/models/${encodeURIComponent(model)}:predictLongRunning`,this.options.apiKey,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({instances:[{prompt:input.prompt}],parameters:{aspectRatio:input.aspectRatio,resolution,durationSeconds:String(duration)}})});
    let op=await create.json() as VideoOperation;if(!op.name)throw new Error('Gemini Veo did not return an operation name');const started=Date.now();while(!op.done){if(Date.now()-started>(this.options.timeoutMs??900000))throw new Error(`Gemini Veo operation ${op.name} timed out`);await sleep(this.options.pollMs??10000);const status=await request(fetchFn,`${base}/${op.name}`,this.options.apiKey);op=await status.json() as VideoOperation;}if(op.error)throw new Error(`Gemini Veo failed: ${op.error.message??'unknown error'}`);const uri=op.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;if(!uri)throw new Error('Gemini Veo completed without a video URI');const download=await request(fetchFn,uri,this.options.apiKey);const bytes=new Uint8Array(await download.arrayBuffer());const key=`gemini/video/${Date.now()}-${Math.random().toString(36).slice(2)}.mp4`;const stored=await this.options.store.put({key,contentType:'video/mp4',data:bytes});return{id:key.replace(/[^a-z0-9]/gi,'-'),uri:stored.uri,mimeType:'video/mp4',bytes:stored.bytes,provider:this.name,model,metadata:{aspectRatio:input.aspectRatio,requestedDurationSeconds:input.durationSeconds,generatedDurationSeconds:duration,resolution,referenceCount:input.referenceUris?.length??0,synthId:true}};
  }
}
