import assert from 'node:assert/strict';
import { appendFlowCreditEvent, chooseStoryFirstVideoPath, createFlowCreditLedger, summarizeFlowCreditLedger } from '../packages/production/dist/index.js';
import { ProviderRegistry, ProviderRouter } from '../packages/providers/dist/index.js';

assert.equal(chooseStoryFirstVideoPath({ storyApproved: true, visualGenerationNeeded: true, flowAvailable: true, geminiApiAvailable: true }).path, 'GOOGLE_FLOW');
assert.equal(chooseStoryFirstVideoPath({ storyApproved: true, visualGenerationNeeded: true, flowAvailable: false, geminiApiAvailable: true }).path, 'GEMINI_API');
assert.equal(chooseStoryFirstVideoPath({ storyApproved: false, visualGenerationNeeded: true, flowAvailable: true, geminiApiAvailable: true }).path, 'BLOCKED');
const flow = { provider: 'google-flow', model: 'Flow UI / Agent', capabilities: ['VIDEO'], qualityScore: 89, estimatedUnitCostUsd: 0, latencyClass: 'SLOW', reliability: 88, maxDurationSeconds: 8, resolutionSupport: ['720p'], aspectRatios: ['16:9'], referenceImageSupport: true, characterConsistencySupport: true, commercialUsageNotes: 'browser-operated', credentialStatus: 'LIVE', enabled: true };
const gemini = { provider: 'gemini', model: 'veo', capabilities: ['VIDEO'], qualityScore: 86, estimatedUnitCostUsd: 0.04, latencyClass: 'STANDARD', reliability: 90, maxDurationSeconds: 8, resolutionSupport: ['720p'], aspectRatios: ['16:9'], referenceImageSupport: true, characterConsistencySupport: true, commercialUsageNotes: 'api', credentialStatus: 'LIVE', enabled: true };
assert.equal(new ProviderRouter(new ProviderRegistry([gemini, flow])).route({ capability: 'VIDEO', storyApproved: true, flowAvailable: true, aspectRatio: '16:9' })?.provider, 'google-flow');
let ledger = createFlowCreditLedger({ accountTier: 'PRO', monthlyCredits: 1000, dailyCreditsRemaining: 50, balance: 893 });
ledger = appendFlowCreditEvent(ledger, { timestamp: '2026-09-15T00:00:00.000Z', projectId: 'fed489a3-b1c3-44cd-b45c-dd006b6b45b8', runId: 'moss-story-first-20260914225544', episode: 'The Little Light That Wouldn\'t Stop', assetType: 'VIDEO', modelOrTool: 'Flow Agent', purpose: 'replace missing story shot 2', expectedValue: 'real visual coverage without Gemini API quota', outcome: 'QUEUED', creditsSpent: 12, balanceBefore: 893, balanceAfter: 881, decision: 'PENDING' });
assert.deepEqual(summarizeFlowCreditLedger(ledger), { creditsSpent: 12, actions: 1, completed: 0, kept: 0, discarded: 0, keepRate: null });
console.log('flow primary tests passed');
