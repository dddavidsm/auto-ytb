export type ChannelProfile = {
  version: 1;
  id: string;
  name: string;
  handle: string;
  language: string;
  targetMarkets: string[];
  channelType: 'UMBRELLA_OPPORTUNITY_DRIVEN' | 'NICHE' | 'SERIES';
  activeFormats: string[];
  brandIdentity: Record<string, unknown>;
  voiceIdentity: Record<string, unknown>;
  visualIdentity: Record<string, unknown>;
  costPolicy: Record<string, unknown>;
  productionPreferences: Record<string, unknown>;
  analyticsSettings: Record<string, unknown>;
  experimentPolicy: Record<string, unknown>;
  statisticsStatus: 'NOT_CONFIGURED' | 'NO_CREDENTIALS' | 'LIVE' | 'FIXTURE' | 'HYBRID';
};

export type ChannelStrategy = {
  version: 1;
  channelId: string;
  selectionMode: 'OPPORTUNITY_DRIVEN';
  marketEvidenceWeight: number;
  ownedEvidenceWeight: number;
  formatLearningSplit: boolean;
  neverInventMetrics: boolean;
  draftBeforeFinal: boolean;
};

export const KLYVERIO_PROFILE: ChannelProfile = {
  version: 1,
  id: 'klyverio-en',
  name: 'Klyverio',
  handle: '@klyverio',
  language: 'en',
  targetMarkets: ['global English-speaking'],
  channelType: 'UMBRELLA_OPPORTUNITY_DRIVEN',
  activeFormats: ['DOCUMENTARY', 'EXPLAINER', 'BUSINESS', 'SCIENCE', 'HISTORY', 'MYSTERY', 'RANKING', 'STORY', 'CHARACTER_LED', 'SHORT'],
  brandIdentity: { positioning: 'Evidence-led original stories selected by opportunity, not a fixed niche.', tone: ['curious', 'clear', 'credible', 'cinematic'] },
  voiceIdentity: { language: 'en', accent: 'neutral-international-english', continuity: 'stable channel voice when configured' },
  visualIdentity: { rule: 'one dominant idea per frame', palette: 'adaptive editorial', avoid: ['fake logos', 'copied thumbnails', 'generic keyword slideshow'] },
  costPolicy: { defaultCurrency: 'USD', draftBeforeFinal: true, hardBudgetCap: true },
  productionPreferences: { referenceFirst: true, evidenceFirst: true, allowLicensedSourceMedia: true, reuseExistingProductionEngine: true },
  analyticsSettings: { importOwnedMetricsWhenAvailable: true, classifyEstimatedSeparately: true, retentionTimelineMapping: true },
  experimentPolicy: { maxVariablesPerExperiment: 1, exploreUntilOwnedSample: 8, requireEvidenceBeforeScale: true },
  statisticsStatus: 'NO_CREDENTIALS',
};

export const KLYVERIO_STRATEGY: ChannelStrategy = { version: 1, channelId: 'klyverio-en', selectionMode: 'OPPORTUNITY_DRIVEN', marketEvidenceWeight: 0.9, ownedEvidenceWeight: 0.1, formatLearningSplit: true, neverInventMetrics: true, draftBeforeFinal: true };
