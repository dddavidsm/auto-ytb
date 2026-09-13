import { NextResponse } from 'next/server';
import { requireSession } from '../../../../lib/auth';
import { loadPilotRun } from '../../../../lib/pilot-data';
import { FileDurableProductionStore } from '@auto-ytb/persistence';

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const item = await loadPilotRun(id);
  if (!item) return NextResponse.json({ error: 'Unknown production run' }, { status: 404 });
  const form = await request.formData();
  const action = String(form.get('action') || '');
  if (action !== 'cancel') return NextResponse.json({ error: 'This control is intentionally unavailable without the durable runner executor.' }, { status: 409 });
  if (['COMPLETED', 'CANCELLED'].includes(item.run.status)) return NextResponse.redirect(new URL(`/production-pilots/${id}`, request.url), 303);
  const store = new FileDurableProductionStore();
  item.run.status = 'CANCELLED';
  item.run.failureStage = item.run.currentStage;
  item.run.failureReason = 'Cancelled from production review.';
  await store.saveRun(item.run as any);
  return NextResponse.redirect(new URL(`/production-pilots/${id}`, request.url), 303);
}
