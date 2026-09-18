import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { NextResponse } from 'next/server';
import { createUniversalProductionGraph } from '@auto-ytb/production';
import { currentSession } from '../../../../lib/auth';

export const runtime = 'nodejs';

function inferFormat(prompt: string) {
  const text = prompt.toLowerCase();
  if (/documentary|explain|why|news|report|history|facts|research/.test(text)) return 'SOURCED_NARRATIVE';
  if (/episode|character|monkey|farm|cartoon|animated|comedy short/.test(text)) return 'GENERATIVE_IP_SERIES';
  return 'HYBRID';
}

export async function POST(request: Request) {
  if (!(await currentSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
  if (prompt.length < 8) return NextResponse.json({ error: 'Describe the video you want to create.' }, { status: 400 });
  const format = typeof body?.format === 'string' ? body.format : inferFormat(prompt);
  const durationSec = Number.isFinite(Number(body?.durationSec)) ? Number(body?.durationSec) : 180;
  const qualityMode = typeof body?.qualityMode === 'string' ? body.qualityMode : 'MAX_QUALITY';
  const briefId = `brief-${Date.now()}`;
  const brief = {
    briefId,
    prompt,
    format,
    channelId: typeof body?.channelId === 'string' ? body.channelId : null,
    platformId: typeof body?.platformId === 'string' ? body.platformId : 'youtube-long',
    durationSec,
    qualityMode,
    budgetUsd: Number.isFinite(Number(body?.budgetUsd)) ? Number(body?.budgetUsd) : null,
    mode: 'REVIEW',
    status: 'BRIEF_ACCEPTED',
    createdAt: new Date().toISOString(),
  };
  const graph = createUniversalProductionGraph([format, 'PACKAGING', 'ANALYTICS']);
  const directory = resolve(process.cwd(), '.data', 'universal-briefs');
  await mkdir(directory, { recursive: true });
  await writeFile(resolve(directory, `${briefId}.json`), `${JSON.stringify({ brief, graph }, null, 2)}\n`);
  const repoRoot = existsSync(resolve(process.cwd(), 'scripts', 'run-autonomous-studio.mjs')) ? process.cwd() : resolve(process.cwd(), '..', '..');
  const runId = `ui-${briefId}`;
  const child = spawn(process.execPath, ['--env-file-if-exists=.env.local', 'scripts/run-autonomous-studio.mjs', '--mode', 'sourced', '--prompt', prompt, '--duration', String(durationSec), '--run-id', runId], { cwd: repoRoot, detached: true, stdio: 'ignore' });
  child.unref();
  return NextResponse.json({
    ok: true,
    runId,
    pipeline: 'SOURCED_AUTOPRODUCTION_CANONICAL',
    artifactRoot: resolve(repoRoot, '.data', 'autonomous-production', runId),
    brief,
    graph,
    quote: { qualityMode, durationSec, format, knownPaidCostUsd: 0, note: 'Final provider costs are quoted after research and media reconnaissance.' },
    progress: ['BRIEF_ACCEPTED', 'FORMAT_INFERRED', 'GRAPH_READY', 'RUN_STARTED', 'RESEARCH_PENDING'],
  });
}
