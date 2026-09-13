export type CostStage = 'research_llm' | 'strategy_llm' | 'script_llm' | 'vision_analysis' | 'thumbnail_generation' | 'image_generation' | 'video_generation' | 'tts' | 'music' | 'stock' | 'render_compute' | 'other';
export type CostLine = { id: string; stage: CostStage; provider: string; model?: string; operation: string; sceneId?: string; units: number; unitType: string; unitCostUsd: number; estimatedUsd: number; actualUsd?: number; retryOf?: string; metadata?: Record<string, unknown> };
export type CostLedger = { version: 2; currency: 'USD'; lines: CostLine[]; estimatedVideoCostUsd: number; actualVideoCostUsd: number; budgetUsd?: number; budgetStatus: 'ALLOWED' | 'BLOCKED' | 'NOT_SET'; byScene: Record<string, number>; byStage: Record<string, number>; byProvider: Record<string, number> };

const round = (value: number) => Math.round(value * 100) / 100;

export function buildCostLedger(input: { lines: CostLine[]; budgetUsd?: number }): CostLedger {
  const lines = input.lines.map((line) => ({ ...line, units: Math.max(0, line.units), unitCostUsd: Math.max(0, line.unitCostUsd), estimatedUsd: Math.max(0, line.estimatedUsd), actualUsd: line.actualUsd == null ? undefined : Math.max(0, line.actualUsd) }));
  const byScene: Record<string, number> = {}; const byStage: Record<string, number> = {}; const byProvider: Record<string, number> = {};
  for (const line of lines) { const estimated = line.estimatedUsd; if (line.sceneId) byScene[line.sceneId] = round((byScene[line.sceneId] ?? 0) + estimated); byStage[line.stage] = round((byStage[line.stage] ?? 0) + estimated); byProvider[line.provider] = round((byProvider[line.provider] ?? 0) + estimated); }
  const estimatedVideoCostUsd = round(lines.reduce((sum, line) => sum + line.estimatedUsd, 0));
  const actualVideoCostUsd = round(lines.reduce((sum, line) => sum + (line.actualUsd ?? line.estimatedUsd), 0));
  return { version: 2, currency: 'USD', lines, estimatedVideoCostUsd, actualVideoCostUsd, budgetUsd: input.budgetUsd, budgetStatus: input.budgetUsd == null ? 'NOT_SET' : estimatedVideoCostUsd <= input.budgetUsd && actualVideoCostUsd <= input.budgetUsd ? 'ALLOWED' : 'BLOCKED', byScene, byStage, byProvider };
}

export function addCostLine(ledger: CostLedger, line: CostLine): CostLedger { return buildCostLedger({ lines: [...ledger.lines, line], budgetUsd: ledger.budgetUsd }); }

export function assertBudget(ledger: CostLedger): void { if (ledger.budgetStatus === 'BLOCKED') throw new Error(`BUDGET_CAP exceeded: estimated $${ledger.estimatedVideoCostUsd.toFixed(2)}, actual $${ledger.actualVideoCostUsd.toFixed(2)}, budget $${Number(ledger.budgetUsd).toFixed(2)}`); }
