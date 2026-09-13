import { YouTubeClient } from '../packages/youtube/dist/index.js';
import { discoverBenchmark, YouTubeBenchmarkProvider } from '../packages/intelligence/dist/index.js';
import { SEED_BENCHMARK_CHANNELS } from '../packages/core/dist/index.js';

const apiKey = process.env.YOUTUBE_API_KEY?.trim();
const accessToken = process.env.YOUTUBE_ACCESS_TOKEN?.trim();
if (!apiKey && !accessToken) {
  console.log(JSON.stringify({ mode: 'REAL', state: 'NO_CREDENTIALS', paidOperations: 0, note: 'Set YOUTUBE_API_KEY or YOUTUBE_ACCESS_TOKEN to run the low-quota live benchmark smoke.' }, null, 2));
  process.exit(0);
}
try {
  const client = new YouTubeClient({ apiKey, accessToken });
  const report = await discoverBenchmark({ request: { niche: 'English-language documentary / explainer', language: 'en', country: 'US', format: 'LONG_FORM', productionBudgetUsd: 5 }, provider: new YouTubeBenchmarkProvider(client), seeds: SEED_BENCHMARK_CHANNELS.map((seed) => seed.handle), includeSeedChannels: true, maxChannels: 12, uploadsPerChannel: 12 });
  console.log(JSON.stringify({ mode: 'REAL', state: 'LIVE', channels: report.channels.length, videos: report.videos.length, topOutliers: report.videos.sort((a, b) => b.likelyOutlier.score - a.likelyOutlier.score).slice(0, 10).map((video) => ({ id: video.id, title: video.title, score: video.likelyOutlier.score, classification: video.likelyOutlier.classification, views: video.views, viewsPerDay: video.viewsPerDay })), limitations: report.limitations, note: 'Only official public metadata/statistics were requested; no paid LLM or media generation was executed.' }, null, 2));
} catch (error) {
  console.error(JSON.stringify({ mode: 'REAL', state: 'PROVIDER_ERROR', message: error instanceof Error ? error.message : String(error) }, null, 2));
  process.exitCode = 1;
}
