import assert from 'node:assert/strict';
import { summarizePortfolio, summarizeChannels, recentVideoEconomics, buildPipelineStages, summarizeProviderCosts } from '../apps/dashboard/data.mjs';

const data={
  jobs:{queued:2,retry:1,running:1,dead:0},
  channels:[
    {id:'c1',channel_key:'future-tech-business-en',title:'Future Tech',language:'en',lifecycle_state:'ready',automation_enabled:true,credentials_ref:'PRIMARY',identity:{characterMode:'none'},autonomy_policy:{autonomyMode:'FULL_AUTONOMOUS'}},
    {id:'c2',channel_key:'old-owl-stories-en',title:'Old Owl',language:'en',lifecycle_state:'awaiting_channel',automation_enabled:false,credentials_ref:'OWL',identity:{characterMode:'persistent-character',characterName:'Old Owl'},autonomy_policy:{autonomyMode:'FULL_AUTONOMOUS'}},
  ],
  candidates:[{id:'candidate',status:'brand_ready'}],
  economics:[
    {production_run_id:'r1',publication_id:'p1',captured_at:'2026-09-08T09:00:00Z',channel_id:'c1',channel_key:'future-tech-business-en',working_title:'New snapshot',content_format:'LONG_HORIZONTAL',state:'public',research_cost_usd:0.05,llm_cost_usd:0.10,voice_cost_usd:0.25,image_cost_usd:0.50,video_cost_usd:8,thumbnail_cost_usd:0.24,total_cost_usd:10,total_revenue_usd:35,watch_minutes_per_dollar:120},
    {production_run_id:'r1',publication_id:'p1',captured_at:'2026-09-07T09:00:00Z',channel_id:'c1',channel_key:'future-tech-business-en',working_title:'Old snapshot',content_format:'LONG_HORIZONTAL',state:'public',total_cost_usd:10,total_revenue_usd:20,watch_minutes_per_dollar:80},
    {production_run_id:'r2',publication_id:'p2',captured_at:'2026-09-08T08:00:00Z',channel_id:'c1',channel_key:'future-tech-business-en',working_title:'Second video',content_format:'SHORT_VERTICAL',state:'public',total_cost_usd:5,total_revenue_usd:0,watch_minutes_per_dollar:60},
  ],
  providerCosts:[
    {provider:'runway',model:'gen4.5',stage:'video',events:3,unpriced_events:0,cost_usd:4.8,all_estimated:true},
    {provider:'runway',model:'gen4_image',stage:'image',events:4,unpriced_events:0,cost_usd:0.32,all_estimated:true},
    {provider:'openai',model:'gpt-5',stage:'llm',events:2,unpriced_events:0,cost_usd:0.1,all_estimated:true},
    {provider:'unknown',model:'future-model',stage:'llm',events:1,unpriced_events:1,cost_usd:0,all_estimated:true},
  ],
  library:[{channel_key:'future-tech-business-en',stage:'render',items:2,bytes:1000},{channel_key:'future-tech-business-en',stage:'analytics',items:2,bytes:500}],
  rightsReview:[],
  recentRuns:[{id:'r1'},{id:'r2'}],
  brandAssets:[{channel_id:'c1',asset_type:'banner',count:1,latest_version:1},{channel_id:'c1',asset_type:'profile',count:1,latest_version:1},{channel_id:'c1',asset_type:'watermark',count:1,latest_version:1}],
  routingDecisions:[{opportunity_id:'o1',channel_id:'c1',channel_key:'future-tech-business-en',route_score:91,route_mode:'EXISTING_CHANNEL'}],
  budget:[{channel_key:'future-tech-business-en',spend_date:'2026-09-08',reserved_usd:4,actual_usd:15,jobs_scheduled:2}],
};

const portfolio=summarizePortfolio(data);
assert.equal(portfolio.videos,2,'duplicate economics snapshots must count as one video');
assert.equal(portfolio.totalCostUsd,15);
assert.equal(portfolio.totalRevenueUsd,35,'latest economics snapshot must win');
assert.equal(portfolio.profitUsd,20);
assert.equal(portfolio.activeChannels,1);
assert.equal(portfolio.channelCandidates,1);
assert.equal(portfolio.queuedJobs,3);
assert.equal(portfolio.unpricedProviderEvents,1);
assert.deepEqual(portfolio.channelStates,{ready:1,awaiting_channel:1});

const providers=summarizeProviderCosts(data);
assert.equal(providers.unpricedEvents,1);
assert.equal(providers.providers[0].provider,'runway');
assert.equal(providers.providers[0].model,'gen4.5');
assert.equal(providers.providers[0].costUsd,4.8);

const channels=summarizeChannels(data);
const tech=channels.find((channel)=>channel.id==='c1');
assert.equal(tech.videos,2);
assert.equal(tech.costUsd,15);
assert.equal(tech.revenueUsd,35);
assert.equal(tech.brandReady,3);
assert.equal(tech.library.items,4);
assert.equal(tech.autonomyMode,'FULL_AUTONOMOUS');
const owl=channels.find((channel)=>channel.id==='c2');
assert.equal(owl.characterName,'Old Owl');
assert.equal(owl.lifecycleState,'awaiting_channel');

const videos=recentVideoEconomics(data);
assert.equal(videos.length,2);
assert.equal(videos[0].title,'New snapshot');
assert.equal(videos[0].revenueUsd,35);
assert.equal(videos[0].costBreakdown.video,8);
assert.equal(videos[0].costBreakdown.voice,0.25);

const pipeline=buildPipelineStages(data);
assert.equal(pipeline.length,10);
assert.equal(pipeline.find((stage)=>stage.id==='routing').state,'ok');
assert.equal(pipeline.find((stage)=>stage.id==='library').state,'ok');
assert.equal(pipeline.find((stage)=>stage.id==='analytics').state,'ok');
assert.equal(pipeline.find((stage)=>stage.id==='ops').state,'active');

console.log('✓ dashboard deduplicates economics snapshots');
console.log('✓ portfolio and per-channel profit aggregation');
console.log('✓ channel lifecycle, brand and Drive visibility');
console.log('✓ provider/model cost breakdown and unpriced-event warning');
console.log('✓ autonomous pipeline health visualization');
