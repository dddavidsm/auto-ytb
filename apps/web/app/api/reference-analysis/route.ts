import { NextResponse } from 'next/server';
import { currentSession } from '../../../lib/auth';
import { query } from '../../../lib/db';

export const runtime = 'nodejs';

type YouTubeMeta = { id: string; title: string; channelTitle?: string; channelId?: string; publishedAt?: string; description?: string; thumbnailUrl?: string; durationSeconds?: number; views?: number; likes?: number; comments?: number };

function videoIdFromUrl(value: string) {
  try {
    const url = new URL(value.trim());
    if (!['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtu.be'].includes(url.hostname.toLowerCase())) return null;
    if (url.hostname.toLowerCase().endsWith('youtu.be')) return url.pathname.split('/').filter(Boolean)[0] || null;
    if (url.pathname === '/watch') return url.searchParams.get('v');
    const parts = url.pathname.split('/').filter(Boolean);
    return parts[0] === 'shorts' || parts[0] === 'embed' ? parts[1] || null : null;
  } catch { return null; }
}

function isoDuration(value: string) {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.exec(value);
  if (!match) return undefined;
  return Number(match[1] || 0) * 3600 + Number(match[2] || 0) * 60 + Number(match[3] || 0);
}

function titleStructure(title: string) {
  const clean = title.trim();
  const words = clean.split(/\s+/).filter(Boolean);
  const lower = clean.toLowerCase();
  const numbers = /\b\d+(?:\.\d+)?%?\b/.test(clean);
  const question = /\?$/.test(clean);
  const contradiction = /\b(pero|aunque|sin embargo|actually|but|despite|wrong|not)\b/i.test(clean);
  const mystery = /\b(secreto|secret|oculto|hidden|nadie|nobody|verdad|truth|realmente|actually)\b/i.test(clean);
  const danger = /\b(guerra|war|crisis|amenaza|threat|riesgo|risk|colapso|collapse)\b/i.test(lower);
  return {
    wordCount: words.length,
    grammar: numbers ? 'NUMBER_LED' : question ? 'OPEN_QUESTION' : contradiction ? 'CONTRADICTION' : mystery ? 'MYSTERY_REVEAL' : 'DIRECT_CLAIM',
    curiositySignals: [...(numbers ? ['specific scale'] : []), ...(question ? ['open question'] : []), ...(contradiction ? ['contrast'] : []), ...(mystery ? ['information withheld'] : []), ...(danger ? ['stakes'] : [])],
    hookHypothesis: question ? 'La pregunta abre un bucle que el vídeo debe resolver pronto.' : contradiction ? 'El contraste promete corregir una creencia previa.' : mystery ? 'La información retenida promete un descubrimiento.' : numbers ? 'La cifra concreta hace comprensible la escala del tema.' : 'La afirmación directa necesita una consecuencia visual en los primeros segundos.',
  };
}

async function fetchJson(url: string, init?: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, headers: { accept: 'application/json', ...(init?.headers || {}) } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json() as Record<string, any>;
  } finally { clearTimeout(timer); }
}

export async function POST(request: Request) {
  if (!(await currentSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const sourceUrl = String(body.url || '').trim();
  const id = videoIdFromUrl(sourceUrl);
  if (!id) return NextResponse.json({ error: 'Introduce una URL pública de YouTube válida.' }, { status: 400 });
  const canonicalUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
  let meta: YouTubeMeta = { id, title: id };
  const limitations: string[] = [];
  try {
    const oembed = await fetchJson(`https://www.youtube.com/oembed?url=${encodeURIComponent(canonicalUrl)}&format=json`);
    meta = { ...meta, title: String(oembed.title || id), channelTitle: String(oembed.author_name || ''), thumbnailUrl: String(oembed.thumbnail_url || '') };
  } catch { limitations.push('YouTube no devolvió oEmbed; se conserva el identificador sin inventar metadatos.'); }
  const key = String(process.env.YOUTUBE_API_KEY || '').trim();
  if (key) {
    try {
      const api = await fetchJson(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics,contentDetails&id=${encodeURIComponent(id)}&key=${encodeURIComponent(key)}`);
      const item = api.items?.[0];
      if (item) meta = { ...meta, title: String(item.snippet?.title || meta.title), channelTitle: String(item.snippet?.channelTitle || meta.channelTitle || ''), channelId: String(item.snippet?.channelId || ''), publishedAt: item.snippet?.publishedAt, description: String(item.snippet?.description || ''), thumbnailUrl: String(item.snippet?.thumbnails?.maxres?.url || item.snippet?.thumbnails?.high?.url || meta.thumbnailUrl || ''), durationSeconds: isoDuration(String(item.contentDetails?.duration || '')), views: Number(item.statistics?.viewCount || 0), likes: Number(item.statistics?.likeCount || 0), comments: Number(item.statistics?.commentCount || 0) };
    } catch { limitations.push('La YouTube Data API no está disponible para esta cuenta o clave; no se muestran métricas de rendimiento.'); }
  } else limitations.push('No hay YOUTUBE_API_KEY configurada: título y autor provienen de oEmbed, sin métricas privadas ni de rendimiento.');
  limitations.push('El guion íntegro, la retención, los recursos fotograma a fotograma y las licencias no se pueden afirmar solo con una URL pública. Se marcarán como no disponibles hasta aportar una transcripción o un análisis autorizado.');
  const analysis = {
    version: 1,
    source: { url: canonicalUrl, youtubeVideoId: id, observedAt: new Date().toISOString(), method: key ? 'oembed+youtubedataapi' : 'oembed' },
    metadata: meta,
    titleDNA: titleStructure(meta.title),
    availability: { metadata: Boolean(meta.title && meta.title !== id), transcript: false, frameByFrameResources: false, retention: false, licensing: false },
    limitations,
    safeUse: 'Usar estructura, ritmo e hipótesis de hook como inspiración; no copiar guion, frases distintivas, miniatura, escenas, audio ni assets.',
    confidence: key && meta.title !== id ? 85 : meta.title !== id ? 65 : 25,
  };
  const rows = await query<{ id: string }>(`insert into video_reference_analyses(source_url,youtube_video_id,title,status,analysis) values($1,$2,$3,'completed',$4::jsonb) returning id`, [canonicalUrl, id, meta.title, JSON.stringify(analysis)]);
  return NextResponse.json({ ok: true, analysisId: rows[0]?.id || null, analysis });
}
