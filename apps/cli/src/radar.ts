import { YouTubeClient } from '@auto-ytb/youtube';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const query = arg('query');
if (!query) {
  console.error('Usage: npm run radar -- --query "AI agents" [--days 7]');
  process.exit(1);
}

const apiKey = process.env.YOUTUBE_API_KEY;
if (!apiKey) {
  console.error('YOUTUBE_API_KEY is not set. Copy .env.example to .env and export it before running.');
  process.exit(1);
}

const days = Number(arg('days') ?? 7);
const client = new YouTubeClient(apiKey);
const publishedAfter = new Date(Date.now() - Math.max(days, 1) * 86_400_000);
const candidates = await client.searchVideos({
  query,
  regionCode: process.env.YOUTUBE_REGION ?? 'US',
  relevanceLanguage: process.env.YOUTUBE_RELEVANCE_LANGUAGE ?? 'en',
  publishedAfter,
  maxResults: 50,
  order: 'viewCount',
});
const videos = await client.enrichVideos(candidates);

const rows = videos
  .map((v) => {
    const ageHours = Math.max((Date.now() - new Date(v.publishedAt).getTime()) / 3_600_000, 1);
    return { ...v, viewsPerHour: Math.round(v.viewCount / ageHours) };
  })
  .sort((a, b) => b.viewsPerHour - a.viewsPerHour)
  .slice(0, 20);

console.table(rows.map(({ id, title, channelTitle, viewCount, viewsPerHour, publishedAt }) => ({
  id,
  title: title.slice(0, 70),
  channel: channelTitle.slice(0, 28),
  views: viewCount,
  viewsPerHour,
  publishedAt: publishedAt.slice(0, 10),
})));
console.log('Search budget:', client.searchBudget.snapshot());
