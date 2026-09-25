import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const allowed = new Set(['idea-lab-demo-01.mp4', 'idea-lab-demo-02.mp4']);

async function serve(request: Request, path: string) {
  const info = await stat(path).catch(() => null);
  if (!info?.isFile()) return null;
  const size = info.size;
  const range = request.headers.get('range');
  let start = 0;
  let end = size - 1;
  let status = 200;

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/i.exec(range.trim());
    if (!match) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    if (match[1] === '' && match[2] !== '') {
      const suffix = Number(match[2]);
      start = Number.isFinite(suffix) ? Math.max(size - suffix, 0) : size;
    } else {
      start = match[1] === '' ? 0 : Number(match[1]);
      end = match[2] === '' ? size - 1 : Number(match[2]);
    }
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= size) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    }
    end = Math.min(end, size - 1);
    status = 206;
  }

  const headers = new Headers({
    'Content-Type': 'video/mp4',
    'Accept-Ranges': 'bytes',
    'Content-Length': String(end - start + 1),
    'Cache-Control': 'public, max-age=3600',
  });
  if (status === 206) headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  if (request.method === 'HEAD') return new Response(null, { status, headers });
  const stream = createReadStream(path, { start, end });
  return new Response(Readable.toWeb(stream) as ReadableStream, { status, headers });
}

export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!allowed.has(name)) return NextResponse.json({ error: 'Demo not found.' }, { status: 404 });
  const candidates = [join(process.cwd(), 'apps/web/public/demo', name), join(process.cwd(), 'public/demo', name)];
  for (const path of candidates) {
    const response = await serve(request, path);
    if (response) return response;
  }
  return NextResponse.json({ error: 'Demo media is not available in this deployment.' }, { status: 404 });
}

export async function HEAD(request: Request, context: { params: Promise<{ name: string }> }) {
  return GET(new Request(request, { method: 'HEAD' }), context);
}
