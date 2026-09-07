import assert from 'node:assert/strict';
import { computeRetryDelayMs, shouldRetry, rankProductionCandidates } from '../packages/os/dist/index.js';

assert.equal(computeRetryDelayMs(1,{baseDelayMs:1000,maxDelayMs:16000,jitterRatio:0}),1000);
assert.equal(computeRetryDelayMs(2,{baseDelayMs:1000,maxDelayMs:16000,jitterRatio:0}),2000);
assert.equal(computeRetryDelayMs(5,{baseDelayMs:1000,maxDelayMs:16000,jitterRatio:0}),16000);
assert.equal(shouldRetry(1,4),true);
assert.equal(shouldRetry(4,4),false);

const now=new Date('2026-09-07T12:00:00Z');
const ranked=rankProductionCandidates([
  {id:'fresh',score:88,detectedAt:'2026-09-07T11:00:00Z',expiresAt:'2026-09-07T20:00:00Z',riskPenalty:5,expectedCostUsd:12},
  {id:'old',score:90,detectedAt:'2026-09-04T12:00:00Z',expiresAt:null,riskPenalty:10,expectedCostUsd:20},
  {id:'risky',score:94,detectedAt:'2026-09-07T10:00:00Z',expiresAt:null,riskPenalty:85,expectedCostUsd:30},
],now);
assert.equal(ranked[0].id,'fresh');
assert.ok(ranked[0].productionPriority>ranked.find((candidate)=>candidate.id==='risky').productionPriority);
assert.ok(ranked.every((candidate)=>candidate.productionPriority>=0&&candidate.productionPriority<=100));

console.log('✓ exponential retry/backoff policy');
console.log('✓ retry exhaustion gate');
console.log('✓ freshness/risk/cost-aware production candidate ranking');
