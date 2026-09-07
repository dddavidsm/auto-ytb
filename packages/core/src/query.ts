export type SeedQuery = {
  query: string;
  priority: number;
};

const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

export function dedupeSeedQueries(queries: SeedQuery[], limit = 100): SeedQuery[] {
  const best = new Map<string, SeedQuery>();
  for (const item of queries) {
    const query = normalize(item.query);
    if (!query) continue;
    const priority = Math.max(0, Math.min(100, item.priority));
    const existing = best.get(query);
    if (!existing || priority > existing.priority) best.set(query, { query, priority });
  }
  return [...best.values()]
    .sort((a, b) => b.priority - a.priority || a.query.localeCompare(b.query))
    .slice(0, Math.max(0, limit));
}

export function expandSeedQueries(seeds: string[], maxQueries = 20): SeedQuery[] {
  const candidates: SeedQuery[] = [];
  for (const seed of seeds) {
    const clean = normalize(seed);
    if (!clean) continue;
    candidates.push(
      { query: clean, priority: 100 },
      { query: `${clean} explained`, priority: 86 },
      { query: `${clean} documentary`, priority: 78 },
      { query: `why ${clean}`, priority: 74 },
    );
  }
  return dedupeSeedQueries(candidates, maxQueries);
}
