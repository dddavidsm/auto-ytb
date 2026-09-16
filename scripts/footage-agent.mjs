import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { searchPexelsVideo, searchPixabayVideo, searchWikimediaVideo } from '../packages/production/dist/index.js';

const outIndex = process.argv.indexOf('--out');
const queries = process.argv.slice(2).filter((value, index, all) => value !== '--download' && value !== '--out' && !(outIndex >= 0 && index === outIndex + 1));
const output = resolve(outIndex >= 0 ? process.argv[outIndex + 1] : '.data/footage-first/discovery.json');
if (!queries.length) throw new Error('Usage: npm run build && node scripts/footage-agent.mjs --out <receipt.json> "query" "query"');

const results = await Promise.all(queries.map(async (query) => {
  const [pexels, pixabay, wikimedia] = await Promise.all([
    searchPexelsVideo(query),
    searchPixabayVideo(query),
    searchWikimediaVideo(query),
  ]);
  return { query, providers: [pexels, pixabay, wikimedia], retrievedAt: new Date().toISOString() };
}));
const candidates = results.flatMap((result) => result.providers.flatMap((provider) => provider.candidates.map((candidate) => ({ ...candidate, query: result.query }))));
if (process.argv.includes('--download')) {
  const mediaRoot = resolve(dirname(output), 'media');
  await mkdir(mediaRoot, { recursive: true });
  for (const candidate of candidates) {
    const downloadUrl = candidate.metadata?.downloadUrl;
    if (!downloadUrl) continue;
    const target = join(mediaRoot, `${candidate.id}.mp4`);
    if (!existsSync(target)) {
      const response = await fetch(downloadUrl);
      if (!response.ok) continue;
      await writeFile(target, Buffer.from(await response.arrayBuffer()));
    }
    candidate.localPath = target;
    candidate.acquisition = 'DOWNLOADED_FOR_RIGHTS_REVIEW';
  }
}
const receipt = { version: 1, mode: 'DISCOVERY_ONLY_UNTIL_RIGHTS_GATE', queries, results, candidates, providerCredentials: { pexels: Boolean(process.env.PEXELS_API_KEY), pixabay: Boolean(process.env.PIXABAY_API_KEY) }, generatedAt: new Date().toISOString() };
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ output, candidates: candidates.length, providers: [...new Set(results.flatMap((item) => item.providers.map((provider) => `${provider.provider}:${provider.capability}`)))] }));
