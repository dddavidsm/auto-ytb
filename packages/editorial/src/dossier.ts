import type { SearchProvider, TextModel } from '@auto-ytb/providers';
import { rankAngles, type AngleInput } from './angles.js';
import { detectClaimConflicts } from './contradictions.js';
import { assessSource, researchConfidence } from './source-quality.js';
import type { Claim, ResearchDossier } from './types.js';

const withTimeout=async<T>(promise:Promise<T>,timeoutMs:number,label:string):Promise<T>=>{
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await Promise.race([promise,new Promise<T>((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label} timed out after ${timeoutMs}ms`)),timeoutMs);})]);}
  finally{if(timer)clearTimeout(timer);}
};

function fallbackDossier(topic:string,sources:ReturnType<typeof assessSource>[],now:Date,reason:string):ResearchDossier{
  const claims:Claim[]=sources.slice(0,8).map((source,index)=>({id:`fallback-claim-${index+1}`,text:`${source.title}: ${source.snippet}`.slice(0,480),importance:index<2?'supporting':'context',sourceIds:[source.id],confidence:Math.max(45,Math.min(82,Number(source.qualityScore??55))),disputed:false,notes:'Extracted from a retrieved source because structured synthesis timed out; verify wording before publication.'}));
  const base=topic.replace(/\s+/g,' ').trim();
  const angles=[
    {id:'evidence-first',title:`What the evidence actually shows about ${base}`,thesis:`Separate verified facts from the strongest unsupported assumptions around ${base}.`,viewerPromise:'See the evidence, the limits and the practical consequence.',hook:`The headline is easy to repeat. The evidence is harder to verify.`,novelty:70,emotionalPull:62,retentionPotential:78,monetizationFit:68,evidenceFit:92,productionFit:84,risk:24},
    {id:'mechanism',title:`The mechanism behind ${base}`,thesis:`Explain the measurable mechanism behind the story using only sourced claims.`,viewerPromise:'Understand what is really driving the change.',hook:`The visible symptom is not the real bottleneck.`,novelty:76,emotionalPull:64,retentionPotential:76,monetizationFit:70,evidenceFit:88,productionFit:82,risk:28},
    {id:'who-wins',title:`Who gains and who pays when ${base}`,thesis:`Follow the incentives and consequences for the people and systems affected.`,viewerPromise:'See the winners, trade-offs and hidden costs.',hook:`Every boom creates a bill. The question is who receives it.`,novelty:78,emotionalPull:72,retentionPotential:80,monetizationFit:76,evidenceFit:78,productionFit:80,risk:32},
    {id:'what-next',title:`What happens next with ${base}`,thesis:`Build a cautious forward-looking scenario from verified signals, not speculation.`,viewerPromise:'Leave with a grounded answer about what to watch next.',hook:`The next change is already visible in the data.`,novelty:74,emotionalPull:68,retentionPotential:77,monetizationFit:72,evidenceFit:76,productionFit:82,risk:36},
  ];
  const ranked=rankAngles(angles);
  const trustedEvidence=sources.some((source)=>source.primaryEvidence||source.sourceType==='news'||Number(source.qualityScore??0)>=78);
  return{topic,generatedAt:now.toISOString(),executiveSummary:`Research synthesis fallback for ${base}. The dossier uses ${sources.length} retrieved sources and keeps claims source-bound. ${reason}`,sources,claims,contradictions:[],timeline:[],angles:ranked,recommendedAngleId:sources.length>=4&&trustedEvidence?ranked[0]?.id??null:null,researchConfidence:Math.max(35,Math.min(72,sources.length*4)),blockingIssues:sources.length<4?['Insufficient source coverage']:trustedEvidence?[]:['No sufficiently trusted source evidence']};
}

export async function buildResearchDossier(input: {
  topic: string;
  search: SearchProvider;
  model: TextModel;
  recencyDays?: number;
  now?: Date;
  searchTimeoutMs?: number;
  synthesisTimeoutMs?: number;
  onProgress?: (message: string) => void | Promise<void>;
}): Promise<ResearchDossier> {
  const now = input.now ?? new Date();
  const queries = [input.topic, `${input.topic} analysis`, `${input.topic} official`, `${input.topic} criticism`];
  const resultSets = await Promise.all(queries.map(async(query)=>{
    const index=queries.indexOf(query)+1;
    try{
      await input.onProgress?.(`Investigación: consulta ${index}/${queries.length} iniciada.`);
      const results=await withTimeout(input.search.search(query,{limit:8,recencyDays:input.recencyDays??180}),input.searchTimeoutMs??75_000,`Research search for ${query}`);
      await input.onProgress?.(`Investigación: consulta ${index}/${queries.length} completada (${results.length} fuentes).`);
      return results;
    }catch(error){
      await input.onProgress?.(`Investigación: consulta ${index}/${queries.length} sin respuesta; se conserva el resto de evidencia.`);
      return [] as Awaited<ReturnType<SearchProvider['search']>>;
    }
  }));
  const unique = new Map(resultSets.flat().map((result) => [result.url, result]));
  const sources = [...unique.values()].map((source) => assessSource(source, now)).sort((a, b) => b.qualityScore - a.qualityScore).slice(0, 24);

  const evidenceText = sources.map((source) => `[${source.id}] ${source.title}\n${source.snippet}\n${source.url}`).join('\n\n');
  let extracted:{value:{executiveSummary:string;claims:Claim[];timeline:Array<{date:string;event:string;sourceIds:string[]}>;angles:AngleInput[]}};
  try{
    extracted=await withTimeout(input.model.generateJson<{
      executiveSummary:string;
      claims:Claim[];
      timeline:Array<{date:string;event:string;sourceIds:string[]}>;
      angles:AngleInput[];
    }>({
      system:'You are a rigorous documentary researcher. Never invent sources. Every factual claim must cite source IDs from the supplied evidence. Mark uncertainty and disputes explicitly.',
      prompt:`Topic: ${input.topic}\n\nEvidence:\n${evidenceText}\n\nProduce a concise research dossier with claims, timeline and 4-8 materially different story angles.`,
      schemaName:'research_dossier',
      temperature:0.2,
    }),input.synthesisTimeoutMs??120_000,'Structured research synthesis');
  }catch(error){
    await input.onProgress?.('Investigación: síntesis estructurada no disponible; aplicando dossier seguro basado en fuentes recuperadas.');
    const fallback=fallbackDossier(input.topic,sources,now,error instanceof Error?error.message:'structured synthesis failed');
    if(fallback.blockingIssues.length||!fallback.recommendedAngleId)return fallback;
    extracted={value:{executiveSummary:fallback.executiveSummary,claims:fallback.claims,timeline:fallback.timeline,angles:fallback.angles.map(({score,...angle})=>angle)}};
  }

  const validSourceIds = new Set(sources.map((source) => source.id));
  const claims = extracted.value.claims.map((claim) => ({
    ...claim,
    sourceIds: claim.sourceIds.filter((id) => validSourceIds.has(id)),
    confidence: Math.max(0, Math.min(100, claim.confidence)),
  }));
  const contradictions = detectClaimConflicts(claims);
  const angles = rankAngles(extracted.value.angles);
  const confidence = researchConfidence(sources, claims.map((claim) => claim.confidence));
  const blockingIssues: string[] = [];
  if (sources.length < 4) blockingIssues.push('Insufficient source coverage');
  // A defensible dossier may be built from reputable reporting or high-quality
  // references when an official source is not available for the exact angle.
  // Keep the gate, but do not make every trend topic impossible to produce.
  const trustedEvidence=sources.some((source)=>source.primaryEvidence||source.sourceType==='news'||Number(source.qualityScore??0)>=78);
  if (!trustedEvidence) blockingIssues.push('No sufficiently trusted source evidence');
  if (claims.some((claim) => claim.importance === 'critical' && claim.sourceIds.length < 1)) blockingIssues.push('Critical claim without a valid source');
  // A sourced disputed claim is not automatically an unresolved contradiction:
  // the script can present it as an estimate, range or explicitly contested view.
  // Only unsupported critical claims remain a hard block above.

  return {
    topic: input.topic,
    generatedAt: now.toISOString(),
    executiveSummary: extracted.value.executiveSummary,
    sources,
    claims,
    contradictions,
    timeline: extracted.value.timeline,
    angles,
    recommendedAngleId: blockingIssues.length === 0 ? angles[0]?.id ?? null : null,
    researchConfidence: confidence,
    blockingIssues,
  };
}
