export type SnapshotTarget = {
  id: string;
  tier: 'PRIORITY' | 'TRACK' | 'REFERENCE' | 'IGNORE';
  lastCapturedAt?: Date | null;
  breakoutActive?: boolean;
};

export type SnapshotPlan = SnapshotTarget & { intervalHours: number; dueAt: Date; isDue: boolean };

export function planCompetitorSnapshots(targets: SnapshotTarget[], now = new Date()): SnapshotPlan[] {
  return targets
    .filter((target) => target.tier !== 'IGNORE')
    .map((target) => {
      const intervalHours = target.breakoutActive
        ? 3
        : target.tier === 'PRIORITY'
          ? 6
          : target.tier === 'TRACK'
            ? 12
            : 24;
      const last = target.lastCapturedAt?.getTime() ?? 0;
      const dueAt = new Date(last ? last + intervalHours * 3_600_000 : 0);
      return { ...target, intervalHours, dueAt, isDue: !last || dueAt <= now };
    })
    .sort((a, b) => Number(b.isDue) - Number(a.isDue) || a.dueAt.getTime() - b.dueAt.getTime());
}
