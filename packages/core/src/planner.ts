export type QueryLane = {
  name: string;
  weight: number;
  minCalls?: number;
  maxCalls?: number;
};

export type QueryAllocation = { name: string; calls: number };

export function allocateSearchBudget(total: number, lanes: QueryLane[]): QueryAllocation[] {
  if (!Number.isInteger(total) || total <= 0) throw new Error('total must be a positive integer');
  if (!lanes.length) return [];
  const positive = lanes.map(l => ({ ...l, weight: Math.max(l.weight, 0) }));
  const weightTotal = positive.reduce((s,l)=>s+l.weight,0) || positive.length;
  const allocations = positive.map(l => ({
    name: l.name,
    calls: Math.min(l.maxCalls ?? total, Math.max(l.minCalls ?? 0, Math.floor(total * (l.weight || 1) / weightTotal))),
  }));
  let assigned = allocations.reduce((s,a)=>s+a.calls,0);

  // Fill remaining calls by descending fractional priority while respecting caps.
  const ordered = [...positive].sort((a,b)=>b.weight-a.weight);
  while (assigned < total) {
    let changed = false;
    for (const lane of ordered) {
      if (assigned >= total) break;
      const target = allocations.find(a=>a.name===lane.name)!;
      if (target.calls < (lane.maxCalls ?? total)) {
        target.calls += 1;
        assigned += 1;
        changed = true;
      }
    }
    if (!changed) break;
  }
  if (assigned > total) {
    const reverse = [...ordered].reverse();
    while (assigned > total) {
      let changed = false;
      for (const lane of reverse) {
        if (assigned <= total) break;
        const target = allocations.find(a=>a.name===lane.name)!;
        if (target.calls > (lane.minCalls ?? 0)) {
          target.calls -= 1;
          assigned -= 1;
          changed = true;
        }
      }
      if (!changed) throw new Error('Minimum lane allocations exceed total budget');
    }
  }
  return allocations;
}
