import type { BinaryAsset, ImageProvider, ObjectStore, SearchProvider, SearchResult, TextModel, Usage, VideoProvider, VoiceProvider } from './types.js';

function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function fetchWithRetry(fetchFn: typeof fetch, url: string, init: RequestInit, attempts = 4): Promise<Response> {
  let last: Error | undefined;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchFn(url, init);
      if (response.ok || ![429, 500, 502, 503, 504].includes(response.status)) return response;
      last = new Error(`HTTP ${response.status}: ${(await response.clone().text()).slice(0, 500)}`);
    } catch (error) { last = error instanceof Error ? error : new Error(String(error)); }
    if (attempt < attempts - 1) await sleep(Math.min(8000, 500 * 2 ** attempt + Math.random() * 250));
  }
  throw last ?? new Error('Request failed');
}

function inferSourceType(url: string): SearchResult['sourceType'] {
  const host = new URL(url).hostname.replace(/^www\./, '');
  if (/\.gov$|\.gov\.|\.edu$|\.edu\./.test(host)) return 'official';
  if (/reuters\.com$|apnews\.com$|bbc\.|nytimes\.com$|ft\.com$|wsj\.com$|theguardian\.com$/.test(host)) return 'news';
  if (/reddit\.com$|news\.ycombinator\.com$/.test(host)) return 'community';
  return 'reference';
}

export class TavilySearchProvider implements SearchProvider {
  constructor(private readonly options: { apiKey: string; endpoint?: string; projectId?: string; fetchFn?: typeof fetch }) {}
  async search(query: string, options?: { limit?: number; recencyDays?: number; domains?: string[] }): Promise<SearchResult[]> {
    const fetchFn = this.options.fetchFn ?? fetch;
    const body: Record<string, unknown> = {
      query,
      search_depth: 'basic',
      max_results: Math.max(1, Math.min(20, options?.limit ?? 8)),
      include_answer: false,
      include_raw_content: false,
    };
    if (options?.domains?.length) body.include_domains = options.domains.slice(0, 50);
    if (options?.recencyDays) {
      const start = new Date(Date.now() - Math.max(1, options.recencyDays) * 86_400_000);
      body.start_date = start.toISOString().slice(0, 10);
    }
    const response = await fetchWithRetry(fetchFn, this.options.endpoint ?? 'https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.options.apiKey}`,
        'content-type': 'application/json',
        ...(this.options.projectId ? { 'x-project-id': this.options.projectId } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`Tavily search failed ${response.status}: ${(await response.text()).slice(0, 500)}`);
    const json = await response.json() as { results?: Array<{ title?: string; url?: string; content?: string; published_date?: string }> };
    return (json.results ?? []).filter((item) => item.url).map((item, index) => ({
      id: `tavily-${index}-${encodeURIComponent(item.url!).slice(-40)}`,
      title: item.title ?? item.url!,
      url: item.url!,
      snippet: item.content ?? '',
      publishedAt: item.published_date,
      sourceType: inferSourceType(item.url!),
    }));
  }
}

const SCHEMAS: Record<string, Record<string, unknown>> = {
  research_dossier: {
    type: 'object', additionalProperties: false,
    required: ['executiveSummary','claims','timeline','angles'],
    properties: {
      executiveSummary: { type: 'string' },
      claims: { type: 'array', items: { type:'object', additionalProperties:false, required:['id','text','importance','sourceIds','confidence','disputed'], properties:{ id:{type:'string'}, text:{type:'string'}, importance:{type:'string',enum:['critical','supporting','context']}, sourceIds:{type:'array',items:{type:'string'}}, confidence:{type:'number'}, disputed:{type:'boolean'}, notes:{type:['string','null']} } } },
      timeline: { type:'array', items:{ type:'object', additionalProperties:false, required:['date','event','sourceIds'], properties:{ date:{type:'string'}, event:{type:'string'}, sourceIds:{type:'array',items:{type:'string'}} } } },
      angles: { type:'array', minItems:2, items:{ type:'object', additionalProperties:false, required:['id','title','thesis','viewerPromise','hook','novelty','emotionalPull','retentionPotential','monetizationFit','evidenceFit','productionFit','risk'], properties:{ id:{type:'string'}, title:{type:'string'}, thesis:{type:'string'}, viewerPromise:{type:'string'}, hook:{type:'string'}, novelty:{type:'number'}, emotionalPull:{type:'number'}, retentionPotential:{type:'number'}, monetizationFit:{type:'number'}, evidenceFit:{type:'number'}, productionFit:{type:'number'}, risk:{type:'number'} } } }
    }
  },
  video_script: {
    type:'object', additionalProperties:false, required:['title','language','targetDurationSec','thesis','beats','outro'], properties:{
      title:{type:'string'}, language:{type:'string'}, targetDurationSec:{type:'number'}, thesis:{type:'string'}, outro:{type:'string'},
      beats:{type:'array',minItems:5,items:{type:'object',additionalProperties:false,required:['id','startSec','targetDurationSec','purpose','narration','visualIntent','sourceIds','retentionDevice'],properties:{ id:{type:'string'},startSec:{type:'number'},targetDurationSec:{type:'number'},purpose:{type:'string',enum:['hook','setup','evidence','escalation','reveal','payoff','cta']},narration:{type:'string'},onScreenText:{type:['string','null']},visualIntent:{type:'string'},sourceIds:{type:'array',items:{type:'string'}},retentionDevice:{type:'string',enum:['open_loop','pattern_interrupt','question','contrast','reveal','none']} }} }
    }
  },
  packaging_variants: {
    type:'object', additionalProperties:false, required:['variants'], properties:{ variants:{ type:'array', minItems:3, maxItems:3, items:{type:'object',additionalProperties:false,required:['id','title','thumbnailConcept','promise','curiosity','clarity','credibility','differentiation'],properties:{id:{type:'string'},title:{type:'string'},thumbnailConcept:{type:'string'},thumbnailText:{type:['string','null']},promise:{type:'string'},curiosity:{type:'number'},clarity:{type:'number'},credibility:{type:'number'},differentiation:{type:'number'}}} } }
  }
};

function responseText(json: Record<string, unknown>): string {
  if (typeof json.output_text === 'string') return json.output_text;
  const output = Array.isArray(json.output) ? json.output : [];
  for (const item of output as Array<Record<string, unknown>>) {
    const content = Array.isArray(item.content) ? item.content : [];
    for (const part of content as Array<Record<string, unknown>>) if (typeof part.text === 'string') return part.text;
  }
  throw new Error('OpenAI response contained no output text');
}

export class OpenAIResponsesTextModel implements TextModel {
  readonly name: string;
  constructor(private readonly options: { apiKey: string; model: string; endpoint?: string; fetchFn?: typeof fetch }) { this.name = `openai:${options.model}`; }
  async generateJson<T>(input: { system: string; prompt: string; schemaName: string; temperature?: number }): Promise<{ value: T; usage?: Usage }> {
    const schema = SCHEMAS[input.schemaName];
    if (!schema) throw new Error(`No built-in JSON schema for ${input.schemaName}`);
    const fetchFn = this.options.fetchFn ?? fetch;
    const response = await fetchWithRetry(fetchFn, this.options.endpoint ?? 'https://api.openai.com/v1/responses', {
      method:'POST',
      headers:{ authorization:`Bearer ${this.options.apiKey}`, 'content-type':'application/json' },
      body: JSON.stringify({
        model:this.options.model,
        instructions:input.system,
        input:input.prompt,
        store:false,
        text:{ format:{ type:'json_schema', name:input.schemaName, strict:true, schema } },
      }),
    }, 3);
    if (!response.ok) throw new Error(`OpenAI Responses failed ${response.status}: ${(await response.text()).slice(0, 800)}`);
    const json = await response.json() as Record<string, unknown> & { usage?: { input_tokens?: number; output_tokens?: number } };
    const parsed = JSON.parse(responseText(json)) as unknown;
    const value = input.schemaName === 'packaging_variants' ? (parsed as { variants: unknown }).variants : parsed;
    return { value: value as T, usage: { inputTokens: json.usage?.input_tokens, outputTokens: json.usage?.output_tokens } };
  }
}

export class ElevenLabsVoiceProvider implements VoiceProvider {
  readonly name = 'elevenlabs';
  constructor(private readonly options: { apiKey: string; store: ObjectStore; modelId?: string; outputFormat?: string; endpoint?: string; fetchFn?: typeof fetch; useTimestamps?: boolean }) {}
  async synthesize(input: { text: string; voice: string; language: string }) {
    const fetchFn = this.options.fetchFn ?? fetch;
    const outputFormat = this.options.outputFormat ?? 'mp3_44100_128';
    const base = this.options.endpoint ?? 'https://api.elevenlabs.io/v1/text-to-speech';
    const withTimestamps=this.options.useTimestamps!==false;
    const suffix=withTimestamps?'/with-timestamps':'';
    const response = await fetchWithRetry(fetchFn, `${base}/${encodeURIComponent(input.voice)}${suffix}?output_format=${encodeURIComponent(outputFormat)}`, {
      method:'POST', headers:{ 'xi-api-key':this.options.apiKey, 'content-type':'application/json' },
      body:JSON.stringify({ text:input.text, model_id:this.options.modelId ?? 'eleven_multilingual_v2', language_code:input.language.slice(0,2) }),
    }, 4);
    if (!response.ok) throw new Error(`ElevenLabs TTS failed ${response.status}: ${(await response.text()).slice(0,500)}`);
    let bytes:Uint8Array;
    let alignment: { characters:string[]; characterStartTimesSeconds:number[]; characterEndTimesSeconds:number[] } | undefined;
    let durationSeconds:number|undefined;
    if(withTimestamps){
      const json=await response.json() as {audio_base64:string;alignment?:{characters?:string[];character_start_times_seconds?:number[];character_end_times_seconds?:number[]};normalized_alignment?:{characters?:string[];character_start_times_seconds?:number[];character_end_times_seconds?:number[]}};
      bytes=new Uint8Array(Buffer.from(json.audio_base64,'base64'));
      const raw=json.normalized_alignment ?? json.alignment;
      if(raw?.characters?.length && raw.character_start_times_seconds?.length && raw.character_end_times_seconds?.length){
        alignment={characters:raw.characters,characterStartTimesSeconds:raw.character_start_times_seconds,characterEndTimesSeconds:raw.character_end_times_seconds};
        durationSeconds=alignment.characterEndTimesSeconds.at(-1);
      }
    } else bytes=new Uint8Array(await response.arrayBuffer());
    const key = `voice/${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`;
    const stored = await this.options.store.put({ key, contentType:'audio/mpeg', data:bytes });
    return { id:key.replace(/[^a-z0-9]/gi,'-'), uri:stored.uri, mimeType:'audio/mpeg', bytes:stored.bytes, provider:this.name, model:this.options.modelId ?? 'eleven_multilingual_v2', durationSeconds:durationSeconds ?? Math.max(1,Math.round(input.text.split(/\s+/).length/2.5)), alignment, language:input.language, voiceId:input.voice };
  }
}

type RunwayTask = { id:string; status?:string; output?:string[]; failure?:string; failureCode?:string };
export class RunwayMediaProvider implements ImageProvider, VideoProvider {
  readonly name = 'runway';
  constructor(private readonly options: { apiKey:string; store:ObjectStore; imageModel?:string; videoModel?:string; apiVersion?:string; endpoint?:string; pollMs?:number; timeoutMs?:number; fetchFn?:typeof fetch }) {}
  private async headers() { return { authorization:`Bearer ${this.options.apiKey}`, 'content-type':'application/json', 'x-runway-version':this.options.apiVersion ?? '2024-11-06' }; }
  private async create(path:string, body:Record<string,unknown>):Promise<RunwayTask> {
    const fetchFn=this.options.fetchFn ?? fetch; const base=this.options.endpoint ?? 'https://api.dev.runwayml.com';
    const response=await fetchWithRetry(fetchFn,`${base}${path}`,{method:'POST',headers:await this.headers(),body:JSON.stringify(body)},4);
    if(!response.ok) throw new Error(`Runway create failed ${response.status}: ${(await response.text()).slice(0,500)}`);
    return response.json() as Promise<RunwayTask>;
  }
  private async wait(id:string):Promise<RunwayTask> {
    const fetchFn=this.options.fetchFn ?? fetch; const base=this.options.endpoint ?? 'https://api.dev.runwayml.com'; const started=Date.now();
    while(Date.now()-started < (this.options.timeoutMs ?? 600_000)) {
      const response=await fetchWithRetry(fetchFn,`${base}/v1/tasks/${encodeURIComponent(id)}`,{headers:await this.headers()},4);
      if(!response.ok) throw new Error(`Runway task failed ${response.status}: ${(await response.text()).slice(0,500)}`);
      const task=await response.json() as RunwayTask;
      if(task.status==='SUCCEEDED') return task;
      if(task.status==='FAILED'||task.status==='CANCELED') throw new Error(`Runway task ${task.status}: ${task.failureCode ?? ''} ${task.failure ?? ''}`.trim());
      await sleep(this.options.pollMs ?? 3000);
    }
    throw new Error(`Runway task ${id} timed out`);
  }
  private async persist(task:RunwayTask, kind:'image'|'video'):Promise<BinaryAsset> {
    const url=task.output?.[0]; if(!url) throw new Error('Runway task succeeded without output URL');
    const fetchFn=this.options.fetchFn ?? fetch; const response=await fetchWithRetry(fetchFn,url,{},3); if(!response.ok) throw new Error(`Runway output download failed ${response.status}`);
    const bytes=new Uint8Array(await response.arrayBuffer()); const mime=kind==='image'?'image/png':'video/mp4'; const ext=kind==='image'?'png':'mp4';
    const stored=await this.options.store.put({key:`runway/${task.id}.${ext}`,contentType:mime,data:bytes});
    return {id:task.id,uri:stored.uri,mimeType:mime,bytes:stored.bytes,provider:this.name,model:kind==='image'?(this.options.imageModel??'gen4_image'):(this.options.videoModel??'gen4.5')};
  }
  async generate(input: { prompt:string; aspectRatio:string; referenceUris?:string[] } | { prompt:string; durationSeconds:number; aspectRatio:string; referenceUris?:string[] }):Promise<BinaryAsset> {
    if('durationSeconds' in input) {
      const task=await this.create('/v1/image_to_video',{ model:this.options.videoModel??'gen4.5', promptText:input.prompt, ratio:input.aspectRatio==='9:16'?'720:1280':'1280:720', duration:Math.max(2,Math.min(10,Math.round(input.durationSeconds))), ...(input.referenceUris?.[0]?{promptImage:input.referenceUris[0]}:{}) });
      return this.persist(await this.wait(task.id),'video');
    }
    const refs=(input.referenceUris??[]).slice(0,3).map((uri,index)=>({uri,tag:`ref${index+1}`}));
    const task=await this.create('/v1/text_to_image',{model:this.options.imageModel??'gen4_image',promptText:input.prompt,ratio:input.aspectRatio==='9:16'?'1080:1920':'1920:1080',...(refs.length?{referenceImages:refs}:{})});
    return this.persist(await this.wait(task.id),'image');
  }
}
