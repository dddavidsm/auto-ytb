import 'server-only';
import { readdir, readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

const runsRoot = resolve(process.cwd(), '.data', 'production-runs');
const artifactsRoot = resolve(process.cwd(), '.data', 'production-artifacts', 'runs');
const safeId = (value: string) => /^[a-zA-Z0-9._-]+$/.test(value) ? value : '';
async function json<T>(path: string, fallback: T): Promise<T> { try { return JSON.parse(await readFile(path, 'utf8')) as T; } catch { return fallback; } }

export async function loadPilotRun(id: string) {
  const safe = safeId(id); if (!safe) return null;
  const root = resolve(runsRoot, safe);
  const run = await json<Record<string, any> | null>(resolve(root, 'run.json'), null);
  if (!run) return null;
  const subtasks = await json<any[]>(resolve(root, 'subtasks.json'), []);
  const providerCalls = await json<any[]>(resolve(root, 'provider-calls.json'), []);
  const costEntries = await json<any[]>(resolve(root, 'cost-entries.json'), []);
  const qualityGates = await json<any[]>(resolve(root, 'quality-gates.json'), []);
  const reports = await json<Record<string, any>>(resolve(root, 'reports.json'), {});
  const artifactDir = resolve(artifactsRoot, safe, 'metadata');
  const names = await readdir(artifactDir).catch(() => [] as string[]);
  const artifacts = await Promise.all(names.filter((name) => name.endsWith('.json')).map((name) => json<any | null>(resolve(artifactDir, name), null)));
  return { run, subtasks, providerCalls, costEntries, qualityGates, reports, artifacts: artifacts.filter(Boolean) };
}

export async function loadPilotRuns() {
  const names = await readdir(runsRoot, { withFileTypes: true }).catch(() => []);
  const runs = await Promise.all(names.filter((entry) => entry.isDirectory()).map((entry) => loadPilotRun(entry.name)));
  const valid = runs.filter((item): item is NonNullable<typeof item> => Boolean(item));
  return valid.sort((a, b) => String(b.run.createdAt).localeCompare(String(a.run.createdAt)));
}

export async function loadPilotArtifact(id: string, artifactId: string) {
  const pilot = await loadPilotRun(id); if (!pilot) return null;
  const artifact = pilot.artifacts.find((item: any) => item.artifactId === artifactId); if (!artifact) return null;
  const runRoot = resolve(artifactsRoot, safeId(id));
  const path = resolve(String(artifact.path));
  if (!path.startsWith(`${runRoot}${sep}`)) return null;
  return { artifact, path };
}
