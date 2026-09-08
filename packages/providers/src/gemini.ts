import type { TextModel, Usage } from './types.js';

const SCHEMAS:Record<string,Record<string,unknown>>={
  research_dossier:{type:'object',additionalProperties:false,required:['executiveSummary','claims','timeline','angles'],properties:{executiveSummary:{type:'string'},claims:{type:'array',items:{type:'object',additionalProperties:false,required:['id','text','importance','sourceIds','confidence','disputed'],properties:{id:{type:'string'},text:{type:'string'},importance:{type:'string',enum:['critical','supporting','context']},sourceIds:{type:'array',items:{type:'string'}},confidence:{type:'number'},disputed:{type:'boolean'},notes:{type:['string','null']}}}},timeline:{type:'array',items:{type:'object',additionalProperties:false,required:['date','event','sourceIds'],properties:{date:{type:'string'},event:{type:'string'},sourceIds:{type:'array',items:{type:'string'}}}}},angles:{type:'array',minItems:2,items:{type:'object',additionalProperties:false,required:['id','title','thesis','viewerPromise','hook','novelty','emotionalPull','retentionPotential','monetizationFit','evidenceFit','productionFit','risk'],properties:{id:{type:'string'},title:{type:'string'},thesis:{type:'string'},viewerPromise:{type:'string'},hook:{type:'string'},novelty:{type:'number'},emotionalPull:{type:'number'},retentionPotential:{type:'number'},monetizationFit:{type:'number'},evidenceFit:{type:'number'},productionFit:{type:'number'},risk:{type:'number'}}}}}},
  video_script:{type:'object',additionalProperties:false,required:['title','language','targetDurationSec','thesis','beats','outro'],properties:{title:{type:'string'},language:{type:'string'},targetDurationSec:{type:'number'},thesis:{type:'string'},outro:{type:'string'},beats:{type:'array',minItems:5,items:{type:'object',additionalProperties:false,required:['id','startSec','targetDurationSec','purpose','narration','visualIntent','sourceIds','retentionDevice'],properties:{id:{type:'string'},startSec:{type:'number'},targetDurationSec:{type:'number'},purpose:{type:'string',enum:['hook','setup','evidence','escalation','reveal','payoff','cta']},narration:{type:'string'},onScreenText:{type:['string','null']},visualIntent:{type:'string'},sourceIds:{type:'array',items:{type:'string'}},retentionDevice:{type:'string',enum:['open_loop','pattern_interrupt','question','contrast','reveal','none']}}}}}},
  packaging_variants:{type:'object',additionalProperties:false,required:['variants'],properties:{variants:{type:'array',minItems:3,maxItems:3,items:{type:'object',additionalProperties:false,required:['id','title','thumbnailConcept','promise','curiosity','clarity','credibility','differentiation'],properties:{id:{type:'string'},title:{type:'string'},thumbnailConcept:{type:'string'},thumbnailText:{type:['string','null']},promise:{type:'string'},curiosity:{type:'number'},clarity:{type:'number'},credibility:{type:'number'},differentiation:{type:'number'}}}}}}
};

function textFromResponse(json:any):string{
  for(const candidate of json?.candidates??[])for(const part of candidate?.content?.parts??[])if(typeof part?.text==='string')return part.text;
  throw new Error(`Gemini response contained no text${json?.promptFeedback?.blockReason?`: ${json.promptFeedback.blockReason}`:''}`);
}

export class GeminiGenerateContentTextModel implements TextModel{
  readonly name:string;
  constructor(private readonly options:{apiKey:string;model:string;endpoint?:string;fetchFn?:typeof fetch}){this.name=`gemini:${options.model}`;}
  async generateJson<T>(input:{system:string;prompt:string;schemaName:string;temperature?:number}):Promise<{value:T;usage?:Usage}>{
    const schema=SCHEMAS[input.schemaName];if(!schema)throw new Error(`No built-in JSON schema for ${input.schemaName}`);
    const fetchFn=this.options.fetchFn??fetch;
    const base=(this.options.endpoint??'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/,'');
    const response=await fetchFn(`${base}/models/${encodeURIComponent(this.options.model)}:generateContent`,{
      method:'POST',
      headers:{'x-goog-api-key':this.options.apiKey,'content-type':'application/json'},
      body:JSON.stringify({
        systemInstruction:{parts:[{text:input.system}]},
        contents:[{role:'user',parts:[{text:input.prompt}]}],
        generationConfig:{responseMimeType:'application/json',responseJsonSchema:schema,...(Number.isFinite(input.temperature)?{temperature:input.temperature}:{})}
      })
    });
    if(!response.ok)throw new Error(`Gemini generateContent failed ${response.status}: ${(await response.text()).slice(0,800)}`);
    const json=await response.json() as any;
    const parsed=JSON.parse(textFromResponse(json));
    const value=input.schemaName==='packaging_variants'?parsed.variants:parsed;
    return{value:value as T,usage:{inputTokens:Number(json?.usageMetadata?.promptTokenCount)||undefined,outputTokens:Number(json?.usageMetadata?.candidatesTokenCount)||undefined}};
  }
}
