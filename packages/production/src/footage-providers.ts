import type { MovingVideoCandidate } from './footage-first.js';

export type FootageSearchResult = { query: string; provider: string; fetchedAt: string; candidates: MovingVideoCandidate[]; totalResults?: number; capability: 'FULL' | 'DISABLED' | 'MISSING_CREDENTIALS' };

const now = () => new Date().toISOString();
async function fetchWithTimeout(fetchFn: typeof fetch, input: URL, init: RequestInit, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetchFn(input, { ...init, signal: controller.signal }); } finally { clearTimeout(timeout); }
}
const pexelsTitle = (url: string | undefined) => {
  try {
    const slug = decodeURIComponent(new URL(String(url ?? '')).pathname.split('/').filter(Boolean).at(-1) ?? '');
    return slug.replace(/-\d+$/, '').replaceAll('-', ' ').trim();
  } catch { return ''; }
};

export async function searchPexelsVideo(query: string, options: { apiKey?: string; fetchFn?: typeof fetch; orientation?: 'landscape' | 'portrait' | 'square'; perPage?: number } = {}): Promise<FootageSearchResult> {
  const apiKey = String(options.apiKey ?? process.env.PEXELS_API_KEY ?? '').trim();
  if (!apiKey) return { query, provider: 'Pexels', fetchedAt: now(), candidates: [], capability: 'MISSING_CREDENTIALS' };
  const fetchFn = options.fetchFn ?? fetch;
  const url = new URL('https://api.pexels.com/v1/videos/search');
  url.searchParams.set('query', query); url.searchParams.set('per_page', String(options.perPage ?? 20));
  if (options.orientation) url.searchParams.set('orientation', options.orientation);
  const response = await fetchWithTimeout(fetchFn, url, { headers: { Authorization: apiKey } });
  if (!response.ok) throw new Error(`Pexels video search failed: ${response.status}`);
  const json = await response.json() as { total_results?: number; videos?: Array<{ id: number; url?: string; duration?: number; width?: number; height?: number; user?: { name?: string; url?: string }; video_files?: Array<{ link?: string; file_type?: string; width?: number; height?: number }> }> };
  const candidates = (json.videos ?? []).flatMap((video) => {
    const file = (video.video_files ?? []).filter((item) => item.file_type === 'video/mp4' && item.link).sort((a, b) => Number(b.width ?? 0) * Number(b.height ?? 0) - Number(a.width ?? 0) * Number(a.height ?? 0))[0];
    if (!file?.link) return [];
    const title = pexelsTitle(video.url);
    return [{ id: `pexels-${video.id}`, sourceUrl: video.url, provider: 'Pexels', rightsTier: 'PUBLISHABLE_WITH_ATTRIBUTION' as const, durationSeconds: Number(video.duration ?? 0), usableDurationSeconds: Number(video.duration ?? 0), width: Number(file.width ?? video.width ?? 0), height: Number(file.height ?? video.height ?? 0), sourceAudio: false, sourceKey: `pexels:${video.id}`, visualFingerprint: `pexels:${video.id}`, metadata: { downloadUrl: file.link, creator: video.user?.name ?? null, creatorUrl: video.user?.url ?? null, title, description: title } } satisfies MovingVideoCandidate & { metadata: Record<string, unknown> }];
  });
  return { query, provider: 'Pexels', fetchedAt: now(), candidates, totalResults: json.total_results, capability: 'FULL' };
}

export async function searchPixabayVideo(query: string, options: { apiKey?: string; fetchFn?: typeof fetch; perPage?: number } = {}): Promise<FootageSearchResult> {
  const apiKey = String(options.apiKey ?? process.env.PIXABAY_API_KEY ?? '').trim();
  if (!apiKey) return { query, provider: 'Pixabay', fetchedAt: now(), candidates: [], capability: 'MISSING_CREDENTIALS' };
  const fetchFn = options.fetchFn ?? fetch;
  const url = new URL('https://pixabay.com/api/videos/');
  url.searchParams.set('key', apiKey); url.searchParams.set('q', query); url.searchParams.set('per_page', String(options.perPage ?? 20));
  const response = await fetchWithTimeout(fetchFn, url, {});
  if (!response.ok) throw new Error(`Pixabay video search failed: ${response.status}`);
  const json = await response.json() as { totalHits?: number; hits?: Array<{ id: number; pageURL?: string; duration?: number; tags?: string; user?: string; videos?: Record<string, { url?: string; width?: number; height?: number; size?: number }> }> };
  const candidates = (json.hits ?? []).flatMap((video) => {
    const file = Object.values(video.videos ?? {}).filter((item) => item.url).sort((a, b) => Number(b.width ?? 0) * Number(b.height ?? 0) - Number(a.width ?? 0) * Number(a.height ?? 0))[0];
    if (!file?.url) return [];
    return [{ id: `pixabay-${video.id}`, sourceUrl: video.pageURL, provider: 'Pixabay', rightsTier: 'PUBLISHABLE_WITH_ATTRIBUTION' as const, durationSeconds: Number(video.duration ?? 0), usableDurationSeconds: Number(video.duration ?? 0), width: Number(file.width ?? 0), height: Number(file.height ?? 0), sourceAudio: false, sourceKey: `pixabay:${video.id}`, visualFingerprint: `pixabay:${video.id}`, metadata: { downloadUrl: file.url, creator: video.user ?? null, tags: video.tags ?? '' } } satisfies MovingVideoCandidate & { metadata: Record<string, unknown> }];
  });
  return { query, provider: 'Pixabay', fetchedAt: now(), candidates, totalResults: json.totalHits, capability: 'FULL' };
}

export async function searchWikimediaVideo(query: string, options: { fetchFn?: typeof fetch; limit?: number; timeoutMs?: number; retries?: number } = {}): Promise<FootageSearchResult> {
  const fetchFn = options.fetchFn ?? fetch;
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.search = new URLSearchParams({ action: 'query', generator: 'search', gsrsearch: `${query} filetype:video`, gsrnamespace: '6', gsrlimit: String(Math.min(20, options.limit ?? 12)), prop: 'imageinfo', iiprop: 'url|mime|size|extmetadata', format: 'json', origin: '*', maxlag: '5' }).toString();
  let response: Response | undefined;
  for (let attempt = 0; attempt < (options.retries ?? 4); attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 12000);
    try { response = await fetchFn(url, { headers: { 'user-agent': 'AUTO-YTB FootageAgent (rights-aware research client)' }, signal: controller.signal }); } catch { response = undefined; }
    clearTimeout(timeout);
    if (!response) continue;
    if (response.ok) break;
    if (![429, 500, 502, 503].includes(response.status)) break;
    const retryAfter = Number(response.headers.get('retry-after') ?? 0);
    await new Promise((resolve) => setTimeout(resolve, Math.max(1200, retryAfter * 1000, 1200 * (attempt + 1))));
  }
  if (!response?.ok) throw new Error(`Wikimedia video search failed: ${response?.status ?? 'unknown'}`);
  const json = await response.json() as { query?: { pages?: Record<string, { pageid?: number; title?: string; imageinfo?: Array<{ url?: string; mime?: string; size?: number; width?: number; height?: number; extmetadata?: Record<string, { value?: string }> }> }> } };
  const candidates = Object.values(json.query?.pages ?? []).flatMap((page) => {
    const info = page.imageinfo?.[0];
    if (!info?.url || !String(info.mime ?? '').startsWith('video/')) return [];
    const meta = info.extmetadata ?? {};
    const license = String(meta.LicenseShortName?.value ?? meta.UsageTerms?.value ?? '').replace(/<[^>]*>/g, '').trim();
    const blocked = !license || /NC|ND|unknown|all rights reserved/i.test(license);
    const rawDuration = String(meta.Duration?.value ?? meta.Length?.value ?? '').trim();
    const durationSeconds = rawDuration ? rawDuration.split(':').reduce((total, part) => total * 60 + Number(part || 0), 0) : 0;
    const title = String(page.title ?? '').replace(/^File:/i, '').replaceAll('_', ' ');
    return [{ id: `commons-video-${page.pageid}`, sourceUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(String(page.title ?? '').replaceAll(' ', '_'))}`, provider: 'Wikimedia Commons', rightsTier: blocked ? 'BLOCKED' as const : 'PUBLISHABLE_WITH_ATTRIBUTION' as const, durationSeconds, usableDurationSeconds: durationSeconds, width: Number(info.width ?? 0), height: Number(info.height ?? 0), sourceAudio: true, sourceKey: `commons:${page.pageid}`, visualFingerprint: `commons:${page.pageid}`, metadata: { downloadUrl: info.url, mime: info.mime, license, creator: String(meta.Artist?.value ?? meta.Credit?.value ?? '').replace(/<[^>]*>/g, '').trim(), title, description: String(meta.ImageDescription?.value ?? '').replace(/<[^>]*>/g, '').trim(), attributionRequired: String(meta.AttributionRequired?.value ?? '').toLowerCase() === 'true' } } satisfies MovingVideoCandidate & { metadata: Record<string, unknown> }];
  });
  return { query, provider: 'Wikimedia Commons', fetchedAt: now(), candidates, totalResults: candidates.length, capability: 'FULL' };
}
