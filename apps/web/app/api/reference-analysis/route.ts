import { NextResponse } from 'next/server';
import { currentSession } from '../../../lib/auth';
import { query } from '../../../lib/db';

export const runtime = 'nodejs';

type YouTubeMeta = { id: string; title: string; channelTitle?: string; channelId?: string; publishedAt?: string; description?: string; thumbnailUrl?: string; durationSeconds?: number; views?: number; likes?: number; comments?: number };
type ChannelVideo = { id: string; title: string; publishedAt?: string; url: string; thumbnailUrl?: string; description?: string };

function youtubeUrl(value: string) { try { return new URL(value.trim()); } catch { return null; } }
function videoIdFromUrl(value: string) {
  const url = youtubeUrl(value); if (!url) return null;
  if (!['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtu.be'].includes(url.hostname.toLowerCase())) return null;
  if (url.hostname.toLowerCase().endsWith('youtu.be')) return url.pathname.split('/').filter(Boolean)[0] || null;
  if (url.pathname === '/watch') return url.searchParams.get('v');
  const parts = url.pathname.split('/').filter(Boolean); return parts[0] === 'shorts' || parts[0] === 'embed' ? parts[1] || null : null;
}
function channelHint(value: string) {
  const url = youtubeUrl(value); if (!url || !url.hostname.toLowerCase().includes('youtube.com')) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[0] === 'channel' && parts[1]) return { channelId: parts[1], handle: null };
  if (parts[0]?.startsWith('@')) return { channelId: null, handle: parts[0].slice(1) };
  if (parts[0] === 'c' || parts[0] === 'user') return { channelId: null, handle: parts[1] || null };
  return null;
}
function isoDuration(value: string) { const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.exec(value); return match ? Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0) : undefined; }
function decodeXml(value: string) { return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim(); }
function xmlValue(block: string, tag: string) { const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i').exec(block); return match ? decodeXml(match[1]) : ''; }
async function textFetch(url: string, accept = 'text/html,application/xhtml+xml') {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 10000);
  try { const response = await fetch(url, { signal: controller.signal, headers: { accept, 'user-agent': 'AUTO-YTB reference intelligence/1.0' } }); if (!response.ok) throw new Error(`HTTP ${response.status}`); return await response.text(); }
  finally { clearTimeout(timer); }
}
async function fetchJson(url: string) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 9000);
  try { const response = await fetch(url, { signal: controller.signal, headers: { accept: 'application/json' } }); if (!response.ok) throw new Error(`HTTP ${response.status}`); return await response.json() as Record<string, any>; }
  finally { clearTimeout(timer); }
}
function titleStructure(title: string) {
  const clean = title.trim(); const words = clean.split(/\s+/).filter(Boolean); const lower = clean.toLowerCase();
  const numbers = /\b\d+(?:\.\d+)?%?\b/.test(clean); const question = /\?$/.test(clean); const contradiction = /\b(pero|aunque|sin embargo|actually|but|despite|wrong|not)\b/i.test(clean); const mystery = /\b(secreto|secret|oculto|hidden|nadie|nobody|verdad|truth|realmente|actually)\b/i.test(clean); const stakes = /\b(guerra|war|crisis|amenaza|threat|riesgo|risk|colapso|collapse|muerte|muerto)\b/i.test(lower);
  return { wordCount: words.length, grammar: numbers ? 'NUMBER_LED' : question ? 'OPEN_QUESTION' : contradiction ? 'CONTRADICTION' : mystery ? 'MYSTERY_REVEAL' : 'DIRECT_CLAIM', curiositySignals: [...(numbers ? ['escala concreta'] : []), ...(question ? ['pregunta abierta'] : []), ...(contradiction ? ['contraste'] : []), ...(mystery ? ['información retenida'] : []), ...(stakes ? ['consecuencia'] : [])], hookHypothesis: question ? 'La pregunta abre un bucle que debe resolverse pronto.' : contradiction ? 'El contraste promete corregir una creencia previa.' : mystery ? 'La información retenida promete un descubrimiento.' : numbers ? 'La cifra concreta hace visible la escala.' : 'La afirmación necesita una consecuencia visual en los primeros segundos.' };
}
function channelDNA(videos: ChannelVideo[]) {
  const structures = videos.map((video) => titleStructure(video.title)); const count = (name: string) => structures.filter((item) => item.grammar === name).length; const names = ['NUMBER_LED', 'OPEN_QUESTION', 'MYSTERY_REVEAL', 'CONTRADICTION', 'DIRECT_CLAIM']; const dominant = [...names].sort((a, b) => count(b) - count(a))[0];
  return { sampleSize: videos.length, dominantTitleGrammar: dominant, grammarMix: Object.fromEntries(names.map((name) => [name, count(name)])), formatHypothesis: 'Historias breves de curiosidad con promesa clara, explicación compacta y cierre que deja una nueva pregunta.', visualHypothesis: 'B-roll o material de archivo contextual, cortes frecuentes, texto legible y énfasis visual en el dato que se está narrando.', narrationHypothesis: 'Narración informativa y directa; el hook entra antes de la explicación y cada bloque responde una parte de la curiosidad.' };
}
async function resolveChannel(sourceUrl: string) {
  const hint = channelHint(sourceUrl); if (!hint) return null;
  let channelId = hint.channelId; let pageTitle = hint.handle ? `@${hint.handle}` : channelId || 'Canal de YouTube'; const limitations: string[] = [];
  if (!channelId) {
    try { const html = await textFetch(sourceUrl); const idMatch = /(?:channelId|externalId)"\s*:\s*"(UC[\w-]{20,})"|"(?:channelId|externalId)"\s*:\s*"(UC[\w-]{20,})"/i.exec(html); channelId = idMatch?.[1] || idMatch?.[2] || null; const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html); if (titleMatch) pageTitle = decodeXml(titleMatch[1]).replace(/\s*-\s*YouTube\s*$/i, '').trim() || pageTitle; } catch { limitations.push('YouTube no permitió resolver el identificador del canal desde su página pública.'); }
  }
  if (!channelId) return { channel: { id: null, handle: hint.handle, title: pageTitle }, videos: [] as ChannelVideo[], limitations: [...limitations, 'Se necesita el identificador público del canal para leer su feed de vídeos.'], channelDNA: channelDNA([]) };
  try {
    const xml = await textFetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`, 'application/atom+xml,text/xml');
    const videos = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/gi)].slice(0, 24).map((match) => { const block = match[1]; const id = xmlValue(block, 'yt:videoId'); const title = xmlValue(block, 'title'); return { id, title, publishedAt: xmlValue(block, 'published'), url: `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`, thumbnailUrl: id ? `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg` : undefined, description: xmlValue(block, 'media:description') }; }).filter((video) => video.id && video.title);
    return { channel: { id: channelId, handle: hint.handle ? `@${hint.handle}` : null, title: pageTitle }, videos, limitations: [...limitations, ...(videos.length ? [] : ['El feed público no devolvió vídeos recientes.'])], channelDNA: channelDNA(videos) };
  } catch (error) { return { channel: { id: channelId, handle: hint.handle ? `@${hint.handle}` : null, title: pageTitle }, videos: [] as ChannelVideo[], limitations: [...limitations, `No se pudo leer el feed público del canal (${error instanceof Error ? error.message : 'error de red'}).`], channelDNA: channelDNA([]) }; }
}

export async function POST(request: Request) {
  if (!(await currentSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>; const sourceUrl = String(body.url || '').trim(); const channel = await resolveChannel(sourceUrl);
  if (channel) {
    if (!channel.channel.id && !channel.videos.length) return NextResponse.json({ error: 'No pude resolver ese canal. Usa la URL completa del canal o una URL /channel/… pública.' }, { status: 400 });
    const analysis = { version: 2, kind: 'channel', source: { url: sourceUrl, observedAt: new Date().toISOString(), method: 'public-channel-html+youtube-rss' }, channel: channel.channel, videos: channel.videos, channelDNA: channel.channelDNA, availability: { channelMetadata: Boolean(channel.channel.id), recentPublicVideos: channel.videos.length > 0, transcript: false, retention: false, frameByFrameResources: false, licensing: false }, limitations: [...channel.limitations, 'La muestra describe patrones observables; no afirma causalidad ni copia guiones, audio o recursos.'], safeUse: 'Usar formatos, ritmo y principios de hook como inspiración original; cambiar tema, guion, escenas, audio, miniatura y recursos.' };
    const rows = await query<{ id: string }>(`insert into video_reference_analyses(source_url,title,status,analysis) values($1,$2,'completed',$3::jsonb) returning id`, [sourceUrl, channel.channel.title, JSON.stringify(analysis)]);
    return NextResponse.json({ ok: true, analysisId: rows[0]?.id || null, analysis });
  }
  const id = videoIdFromUrl(sourceUrl); if (!id) return NextResponse.json({ error: 'Introduce una URL pública de YouTube de vídeo o canal.' }, { status: 400 });
  const canonicalUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`; let meta: YouTubeMeta = { id, title: id }; const limitations: string[] = [];
  try { const oembed = await fetchJson(`https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalUrl)}&format=json`); meta = { ...meta, title: String(oembed.title || id), channelTitle: String(oembed.author_name || ''), thumbnailUrl: String(oembed.thumbnail_url || '') }; } catch { limitations.push('YouTube no devolvió oEmbed; se conserva el identificador sin inventar metadatos.'); }
  const key = String(process.env.YOUTUBE_API_KEY || '').trim();
  if (key) { try { const api = await fetchJson(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${encodeURIComponent(id)}&key=${encodeURIComponent(key)}`); const item = api.items?.[0]; if (item) meta = { ...meta, title: String(item.snippet?.title || meta.title), channelTitle: String(item.snippet?.channelTitle || meta.channelTitle || ''), channelId: String(item.snippet?.channelId || ''), publishedAt: item.snippet?.publishedAt, description: String(item.snippet?.description || ''), thumbnailUrl: String(item.snippet?.thumbnails?.maxres?.url || item.snippet?.thumbnails?.high?.url || meta.thumbnailUrl || ''), durationSeconds: isoDuration(String(item.contentDetails?.duration || '')), views: Number(item.statistics?.viewCount || 0), likes: Number(item.statistics?.likeCount || 0), comments: Number(item.statistics?.commentCount || 0) }; } catch { limitations.push('La YouTube Data API no está disponible; no se muestran métricas de rendimiento.'); } } else limitations.push('No hay YOUTUBE_API_KEY configurada: título y autor provienen de oEmbed, sin métricas de rendimiento.');
  limitations.push('El guion íntegro, la retención, los recursos fotograma a fotograma y las licencias no se pueden afirmar solo con una URL pública.');
  const analysis = { version: 2, kind: 'video', source: { url: canonicalUrl, youtubeVideoId: id, observedAt: new Date().toISOString(), method: key ? 'oembed+youtubedataapi' : 'oembed' }, metadata: meta, titleDNA: titleStructure(meta.title), availability: { metadata: Boolean(meta.title && meta.title !== id), transcript: false, frameByFrameResources: false, retention: false, licensing: false }, limitations, safeUse: 'Usar estructura, ritmo e hipótesis de hook como inspiración; no copiar guion, frases distintivas, miniatura, escenas, audio ni assets.', confidence: key && meta.title !== id ? 85 : meta.title !== id ? 65 : 25 };
  const rows = await query<{ id: string }>(`insert into video_reference_analyses(source_url,youtube_video_id,title,status,analysis) values($1,$2,$3,'completed',$4::jsonb) returning id`, [canonicalUrl, id, meta.title, JSON.stringify(analysis)]);
  return NextResponse.json({ ok: true, analysisId: rows[0]?.id || null, analysis });
}
