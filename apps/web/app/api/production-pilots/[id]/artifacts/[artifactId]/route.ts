import { readFile } from 'node:fs/promises';
import { NextResponse } from 'next/server';
import { requireSession } from '../../../../../../lib/auth';
import { loadPilotArtifact } from '../../../../../../lib/pilot-data';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; artifactId: string }> }) {
  await requireSession();
  const { id, artifactId } = await params;
  const item = await loadPilotArtifact(id, artifactId);
  if (!item) return NextResponse.json({ error: 'Unknown artifact' }, { status: 404 });
  const body = await readFile(item.path);
  return new NextResponse(body, { headers: { 'Content-Type': item.artifact.mimeType, 'Content-Length': String(body.byteLength), 'Cache-Control': 'private, max-age=60' } });
}
