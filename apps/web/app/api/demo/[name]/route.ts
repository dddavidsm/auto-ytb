import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const allowed = new Set(['idea-lab-demo-01.mp4', 'idea-lab-demo-02.mp4']);

export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!allowed.has(name)) return NextResponse.json({ error: 'Demo not found.' }, { status: 404 });
  const candidates = [join(process.cwd(), 'apps/web/public/demo', name), join(process.cwd(), 'public/demo', name)];
  for (const path of candidates) {
    try {
      const file = await readFile(path);
      return new Response(file, { headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(file.byteLength), 'Cache-Control': 'public, max-age=3600' } });
    } catch {}
  }
  return NextResponse.json({ error: 'Demo media is not available in this deployment.' }, { status: 404 });
}
