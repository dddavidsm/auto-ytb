import assert from 'node:assert/strict';
import { TavilySearchProvider, OpenAIResponsesTextModel } from '@auto-ytb/providers';

const tavilyFetch = async (_url, init) => {
  const body = JSON.parse(init.body);
  assert.equal(body.query, 'AI agents');
  return new Response(JSON.stringify({results:[{title:'Official release',url:'https://example.gov/release',content:'Primary source'}]}),{status:200,headers:{'content-type':'application/json'}});
};
const search = new TavilySearchProvider({apiKey:'test',fetchFn:tavilyFetch});
const results = await search.search('AI agents',{limit:3,recencyDays:7});
assert.equal(results.length,1);
assert.equal(results[0].sourceType,'official');
console.log('✓ Tavily adapter contract');

const llmFetch = async (_url, init) => {
  const body = JSON.parse(init.body);
  assert.equal(body.text.format.type,'json_schema');
  const value={executiveSummary:'summary',claims:[],timeline:[],angles:[
    {id:'a',title:'A',thesis:'t',viewerPromise:'p',hook:'h',novelty:80,emotionalPull:80,retentionPotential:80,monetizationFit:80,evidenceFit:80,productionFit:80,risk:10},
    {id:'b',title:'B',thesis:'t',viewerPromise:'p',hook:'h',novelty:70,emotionalPull:70,retentionPotential:70,monetizationFit:70,evidenceFit:70,productionFit:70,risk:10}
  ]};
  return new Response(JSON.stringify({output_text:JSON.stringify(value),usage:{input_tokens:100,output_tokens:50}}),{status:200,headers:{'content-type':'application/json'}});
};
const model = new OpenAIResponsesTextModel({apiKey:'test',model:'test-model',fetchFn:llmFetch});
const generated=await model.generateJson({system:'system',prompt:'prompt',schemaName:'research_dossier'});
assert.equal(generated.value.executiveSummary,'summary');
assert.equal(generated.usage.inputTokens,100);
console.log('✓ OpenAI Responses adapter contract');
