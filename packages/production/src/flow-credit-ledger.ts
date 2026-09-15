export type FlowCreditEvent = {
  timestamp: string;
  projectId: string;
  projectUrl?: string;
  runId?: string;
  episode?: string;
  assetType: 'IMAGE' | 'VIDEO' | 'STORYBOARD' | 'TOOL';
  modelOrTool: string;
  purpose: string;
  expectedValue: string;
  outcome: 'QUEUED' | 'COMPLETED' | 'FAILED' | 'DISCARDED' | 'KEPT';
  creditsSpent?: number | null;
  balanceBefore?: number | null;
  balanceAfter?: number | null;
  decision?: 'KEEP' | 'DISCARD' | 'PENDING';
  notes?: string;
};

export type FlowCreditLedger = {
  version: 1;
  provider: 'google-flow';
  accountTier?: 'PRO' | 'UNKNOWN';
  monthlyCredits?: number | null;
  dailyCreditsRemaining?: number | null;
  balance?: number | null;
  events: FlowCreditEvent[];
};

export function createFlowCreditLedger(input: Partial<Omit<FlowCreditLedger, 'version' | 'provider'>> = {}): FlowCreditLedger {
  return { version: 1, provider: 'google-flow', events: [], ...input };
}

export function appendFlowCreditEvent(ledger: FlowCreditLedger, event: FlowCreditEvent): FlowCreditLedger {
  return { ...ledger, events: [...ledger.events, event], balance: event.balanceAfter ?? ledger.balance };
}

export function summarizeFlowCreditLedger(ledger: FlowCreditLedger) {
  const spent = ledger.events.reduce((sum, event) => sum + (Number(event.creditsSpent) || 0), 0);
  const completed = ledger.events.filter((event) => event.outcome === 'COMPLETED' || event.outcome === 'KEPT').length;
  const kept = ledger.events.filter((event) => event.decision === 'KEEP' || event.outcome === 'KEPT').length;
  return {
    creditsSpent: Number(spent.toFixed(2)),
    actions: ledger.events.length,
    completed,
    kept,
    discarded: ledger.events.filter((event) => event.decision === 'DISCARD' || event.outcome === 'DISCARDED').length,
    keepRate: completed ? Number((kept / completed).toFixed(3)) : null,
  };
}
