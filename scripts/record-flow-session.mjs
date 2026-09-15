import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { appendFlowCreditEvent, createFlowCreditLedger, summarizeFlowCreditLedger } from '../packages/production/dist/index.js';

const root = resolve(process.env.STORY_FIRST_RUN_ROOT || '.data/pro-series-rnd/moss-story-first-20260914225544');
const path = resolve(root, 'flow-credit-ledger.json');
const projectId = 'fed489a3-b1c3-44cd-b45c-dd006b6b45b8';
const projectUrl = `https://flow.google.com/project/${projectId}`;
let ledger = createFlowCreditLedger({ accountTier: 'PRO', monthlyCredits: 1000, dailyCreditsRemaining: 26, balance: 869 });
for (const [shotId, purpose] of [[2, 'replace missing story shot 2 after Gemini API HTTP 429'], [3, 'replace missing story shot 3 after Gemini API HTTP 429'], [4, 'replace missing story shot 4 after Gemini API HTTP 429']]) {
  ledger = appendFlowCreditEvent(ledger, {
    timestamp: new Date().toISOString(), projectId, projectUrl,
    runId: 'moss-story-first-20260914225544', episode: "The Little Light That Wouldn't Stop", assetType: 'VIDEO',
    modelOrTool: 'Flow Agent (editor reports Omni 1.1 Flash)', purpose,
    expectedValue: 'real visual coverage without a Gemini API video quota retry', outcome: 'KEPT',
    creditsSpent: 12, balanceBefore: shotId === 2 ? 893 : null, balanceAfter: shotId === 4 ? 869 : null,
    decision: 'KEEP', notes: 'Text-only continuity prompt; local reference upload was unavailable in the browser connector. Selected for the real final assembly; human review remains pending.'
  });
}
const output = { ...ledger, summary: summarizeFlowCreditLedger(ledger), policy: { generationPriority: ['google-flow', 'gemini-api', 'other'], hardRules: ['story gate before credits', 'one generation per missing shot', 'no placeholder promotion', 'no auto-publish'] } };
await mkdir(dirname(path), { recursive: true });
await writeFile(path, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ path, ...output.summary }, null, 2));
