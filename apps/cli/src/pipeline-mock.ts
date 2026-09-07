import { mkdir, writeFile } from 'node:fs/promises';
import { runContentPipeline } from '@auto-ytb/orchestrator';
import { MockImageProvider, MockObjectStore, MockPublisher, MockRenderer, MockSearchProvider, MockTextModel, MockVideoProvider, MockVoiceProvider } from '@auto-ytb/providers';

const source = { id: 'official-1', title: 'Official technical report', url: 'https://example.com/report', snippet: 'The system increased adoption and changed browser workflows.', publishedAt: '2026-09-01T00:00:00Z', sourceType: 'official' as const };
const search = new MockSearchProvider({
  'AI browser agents': [source],
  'AI browser agents analysis': [{ ...source, id: 'news-1', url: 'https://news.example.com/analysis', title: 'Independent analysis', sourceType: 'news' as const }],
  'AI browser agents official': [{ ...source, id: 'primary-1', url: 'https://vendor.example.com/launch', title: 'Product launch documentation', sourceType: 'primary' as const }],
  'AI browser agents criticism': [{ ...source, id: 'crit-1', url: 'https://research.example.com/risks', title: 'Researcher criticism', sourceType: 'reference' as const }],
});

const model = new MockTextModel((schema) => {
  if (schema === 'research_dossier') return {
    executiveSummary: 'AI browser agents are moving from demos into real workflows, creating a race around distribution, trust and control of the browser.',
    claims: [
      { id: 'c1', text: 'Browser agents are being integrated into real product workflows.', importance: 'critical', sourceIds: ['primary-1','official-1'], confidence: 92, disputed: false },
      { id: 'c2', text: 'The competitive advantage may shift toward distribution and trust.', importance: 'supporting', sourceIds: ['news-1','crit-1'], confidence: 76, disputed: false }
    ],
    timeline: [{ date: '2026-09-01', event: 'New browser-agent capabilities documented', sourceIds: ['primary-1'] }],
    angles: [
      { id: 'a1', title: 'The Race to Replace the Browser', thesis: 'AI agents are turning the browser from a destination into an execution layer.', viewerPromise: 'Understand the business and technology shift before it becomes obvious.', hook: 'The browser may be disappearing without actually going away.', novelty: 90, emotionalPull: 82, retentionPotential: 94, monetizationFit: 88, evidenceFit: 91, productionFit: 86, risk: 12 },
      { id: 'a2', title: 'Why Browser Agents Could Fail', thesis: 'Trust and reliability may stop agents before capability does.', viewerPromise: 'See the hidden constraint behind the hype.', hook: 'The biggest problem is not intelligence.', novelty: 85, emotionalPull: 80, retentionPotential: 90, monetizationFit: 84, evidenceFit: 78, productionFit: 90, risk: 16 }
    ]
  };
  if (schema === 'video_script') return {
    title: 'The Race to Replace the Browser', language: 'en', targetDurationSec: 600, thesis: 'AI agents are turning the browser into an execution layer.',
    beats: [
      { id:'b1', startSec:0, targetDurationSec:35, purpose:'hook', narration:'For thirty years, the browser has been where the internet happens. AI agents are trying to make it disappear without closing a single tab.', visualIntent:'Fast conceptual reconstruction of a browser turning into an autonomous agent interface', sourceIds:['primary-1'], retentionDevice:'open_loop' },
      { id:'b2', startSec:35, targetDurationSec:100, purpose:'setup', narration:'The shift starts with a simple change: instead of navigating pages yourself, software can increasingly execute the workflow for you.', visualIntent:'Product UI screenshots and motion graphic explaining the workflow', sourceIds:['official-1','primary-1'], retentionDevice:'contrast' },
      { id:'b3', startSec:135, targetDurationSec:150, purpose:'evidence', narration:'That changes where value sits. Distribution, permission and user trust become as important as the model itself.', visualIntent:'Charts and browser market diagram', sourceIds:['news-1','crit-1'], retentionDevice:'question' },
      { id:'b4', startSec:285, targetDurationSec:150, purpose:'escalation', narration:'But autonomy creates a new failure mode: a browser that can act can also make the wrong action.', visualIntent:'Conceptual future reconstruction of an agent making a risky action', sourceIds:['crit-1'], retentionDevice:'open_loop' },
      { id:'b5', startSec:435, targetDurationSec:130, purpose:'reveal', narration:'The winning company may not be the one with the smartest agent. It may be the one users trust to control the interface between intention and action.', visualIntent:'Competitive landscape motion graphic', sourceIds:['news-1','crit-1'], retentionDevice:'reveal' },
      { id:'b6', startSec:565, targetDurationSec:35, purpose:'payoff', narration:'The browser is not dying. It is becoming infrastructure, and that may be an even bigger change.', visualIntent:'Clean visual callback to opening browser image', sourceIds:['primary-1'], retentionDevice:'reveal' }
    ], outro:'Subscribe for documentary explainers on the technologies changing how the internet works.'
  };
  if (schema === 'packaging_variants') return [
    { id:'p1', title:'The Race to Replace Your Browser', thumbnailConcept:'A browser window being swallowed by a single AI cursor', thumbnailText:'THE BROWSER IS CHANGING', promise:'Why AI agents could remake the browser', curiosity:92, clarity:90, credibility:88, differentiation:87 },
    { id:'p2', title:'Why Every AI Company Wants Your Browser', thumbnailConcept:'Major AI logos reaching toward a browser frame', thumbnailText:'THE NEW BATTLEFIELD', promise:'The business battle around browser agents', curiosity:89, clarity:94, credibility:90, differentiation:82 },
    { id:'p3', title:'The Browser Might Become Invisible', thumbnailConcept:'Empty desktop with an agent command box replacing browser chrome', promise:'How agents could turn browsers into invisible infrastructure', curiosity:95, clarity:82, credibility:84, differentiation:94 }
  ];
  throw new Error(`Unknown mock schema ${schema}`);
});

const result = await runContentPipeline({
  projectId: `mock-${Date.now()}`,
  topic: 'AI browser agents', language: 'en', targetDurationSec: 600, voice: 'narrator-01', maxCostUsd: 25,
  search, model, voiceProvider: new MockVoiceProvider(), imageProvider: new MockImageProvider(), videoProvider: new MockVideoProvider(),
  store: new MockObjectStore(), renderer: new MockRenderer(), publisher: new MockPublisher(), autoUploadPrivate: true,
});
await mkdir(`${process.cwd()}/.data`, { recursive: true });
await writeFile(`${process.cwd()}/.data/pipeline-mock-latest.json`, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ state: result.state, qa: result.qa?.score, externalId: result.externalId, estimatedCost: result.manifest?.estimatedCostUsd, events: result.events }, null, 2));
