export type RevisionRunStatus = 'PLANNED' | 'RUNNING' | 'COMPLETED' | 'BLOCKED' | 'FAILED';
export type RevisionRun = { id: string; parentRunId: string; selectedSceneIds: string[]; reasons: Record<string, string>; status: RevisionRunStatus; costBefore: number; additionalCost: number; qcBefore?: Record<string, unknown>; qcAfter?: Record<string, unknown>; createdAt: string; completedAt?: string };

export function makeRevisionRun(input: { id: string; parentRunId: string; selectedSceneIds: string[]; reasons?: Record<string, string>; costBefore: number; qcBefore?: Record<string, unknown> }): RevisionRun {
  return { ...input, reasons: input.reasons ?? {}, status: 'PLANNED', additionalCost: 0, createdAt: new Date().toISOString() };
}
