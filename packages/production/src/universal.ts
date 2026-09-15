export type QualityMode = 'DRAFT' | 'STANDARD' | 'MAX_QUALITY';
export type PersistenceScope = 'EPHEMERAL' | 'PROJECT' | 'SERIES' | 'CHANNEL' | 'GLOBAL';

export type ChannelProfile = {
  channelId: string;
  name: string;
  platform: string;
  language: string;
  audience?: string;
  formats: string[];
  qualityFloor: number;
  visualStyle?: string;
  voiceStrategy?: string;
  publishingRules?: Record<string, unknown>;
  costPolicy?: { maxPerVideoUsd?: number; maxPerDayUsd?: number };
};

export type PlatformProfile = {
  platformId: string;
  aspectRatio: '16:9' | '9:16' | '1:1' | string;
  durationMinSec?: number;
  durationMaxSec?: number;
  safeZones?: Record<string, number>;
  captionStyle?: string;
  publisher?: string;
};

export type CharacterProfile = {
  characterId: string;
  name: string;
  scope: PersistenceScope;
  speciesOrType: string;
  description: string;
  canonicalImages: string[];
  canonicalVideos?: string[];
  providerEntityIds?: Record<string, string>;
  visualStyle?: string;
  physicalInvariants?: Record<string, unknown>;
  wardrobeRules?: string[];
  locomotion?: string;
  gestureStyle?: string;
  voiceProfileId?: string;
  personalityProfileId?: string;
  allowedTransformations?: string[];
  forbiddenDrift?: string[];
};

export type CastProfile = {
  castId: string;
  characters: string[];
  relationships?: Array<{ from: string; to: string; relationship: string }>;
  relativeHeights?: Record<string, number>;
  interactionRules?: string[];
};

export type WorldProfile = {
  worldId: string;
  name: string;
  scope: PersistenceScope;
  visualReferences: string[];
  locations: string[];
  style?: string;
  lighting?: string;
  palette?: string[];
  continuityRules?: string[];
};

export type PropProfile = {
  propId: string;
  name: string;
  scope: PersistenceScope;
  visualReferences: string[];
  dimensions?: Record<string, number>;
  materials?: string[];
  relativeScale?: string;
  semanticRole?: string;
  forbiddenDrift?: string[];
};

export type SeriesProfile = {
  seriesId: string;
  channelId?: string;
  name: string;
  premise: string;
  format: string;
  episodeDurationSec?: number;
  castIds: string[];
  worldId?: string;
  storyEngine?: string;
  episodeRules?: string[];
  continuityPolicy?: 'STRICT' | 'SOFT' | 'NONE';
};

export type ProductionBrief = {
  briefId: string;
  prompt: string;
  inputType: 'PROMPT' | 'TOPIC' | 'NEWS_URL' | 'SCRIPT' | 'AUDIO' | 'VIDEO' | 'RADAR_RESULT' | 'SERIES_REQUEST';
  channelId?: string;
  platformId?: string;
  requestedFormat?: string;
  inferredFormat?: string;
  targetDurationSec?: number;
  language?: string;
  qualityMode: QualityMode;
  budgetUsd?: number;
  sourceRefs?: string[];
  constraints?: string[];
};

export type EpisodeContract = {
  protagonist: string;
  desire: string;
  problem: string;
  visibleGoal: string;
  stakes: string;
  attempt: string;
  consequence: string;
  escalation: string;
  turningPoint: string;
  climax: string;
  resolution: string;
  finalButton: string;
};

export type StoryStateGraph = {
  beatId: string;
  incomingState: Record<string, unknown>;
  characterGoal: string;
  action: string;
  dialogue?: string;
  consequence: string;
  outgoingState: Record<string, unknown>;
};

export type PhysicalState = {
  characters: Record<string, { position?: string; orientation?: string; pose?: string; scale?: string; emotion?: string }>;
  heldObjects: Record<string, string[]>;
  objectStates: Record<string, Record<string, unknown>>;
  location?: string;
  camera?: string;
  lighting?: string;
};

export type ShotState = { shotId: string; startState: PhysicalState; endState?: PhysicalState };

export type UniversalProductionNode = {
  id: string;
  kind: 'Research' | 'Concept' | 'Story' | 'Script' | 'Voice' | 'Character' | 'World' | 'AssetSearch' | 'ImageGeneration' | 'VideoGeneration' | 'PerformanceTransfer' | 'Timeline' | 'Captions' | 'Music' | 'SFX' | 'QC' | 'Repair' | 'Packaging' | 'Publishing' | 'Analytics';
  dependsOn: string[];
  status: 'PENDING' | 'READY' | 'RUNNING' | 'DONE' | 'BLOCKED';
  optional?: boolean;
  metadata?: Record<string, unknown>;
};

export type UniversalProductionGraph = { graphId: string; nodes: UniversalProductionNode[]; activeFormats: string[] };

export function createUniversalProductionGraph(activeFormats: string[] = ['SOURCED_NARRATIVE']): UniversalProductionGraph {
  const order: UniversalProductionNode['kind'][] = ['Research', 'Concept', 'Story', 'Script', 'Voice', 'Character', 'World', 'AssetSearch', 'ImageGeneration', 'VideoGeneration', 'PerformanceTransfer', 'Timeline', 'Captions', 'Music', 'SFX', 'QC', 'Repair', 'Packaging', 'Publishing', 'Analytics'];
  const nodes: UniversalProductionNode[] = order.map((kind, index) => ({ id: `${kind.toLowerCase()}-${index + 1}`, kind, dependsOn: index ? [`${order[index - 1].toLowerCase()}-${index}`] : [], status: index === 0 ? 'READY' : 'PENDING' }));
  return { graphId: `upg-${Date.now()}`, nodes, activeFormats };
}

export class ProfileRegistry<T extends { [key: string]: unknown }> {
  private readonly records = new Map<string, T>();
  constructor(private readonly idField: keyof T) {}
  upsert(record: T): T { const id = String(record[this.idField]); if (!id) throw new Error(`Profile missing ${String(this.idField)}`); this.records.set(id, record); return record; }
  get(id: string): T | undefined { return this.records.get(id); }
  list(): T[] { return [...this.records.values()]; }
  remove(id: string): boolean { return this.records.delete(id); }
}

export type EditPatch = {
  patchId: string;
  targetStartSec: number;
  targetEndSec: number;
  operation: 'REPLACE_ASSET' | 'TRIM' | 'RETIME' | 'REVOICE' | 'RECAPTION' | 'REWRITE_BEAT' | 'REGENERATE_SHOT';
  reason: string;
  affectedNodeIds: string[];
  newAssetIds?: string[];
  estimatedCostUsd: number;
  qcRequirements: string[];
};

export function parseNaturalLanguageEdit(request: string, durationSec = 60): EditPatch {
  const time = request.match(/(?:at|from|around)\s+(\d+)(?::(\d+))?/i);
  const start = time ? Number(time[1]) * (time[2] ? 60 : 1) + Number(time[2] ?? 0) : 0;
  const end = Math.min(durationSec, start + (time ? 8 : durationSec));
  const lower = request.toLowerCase();
  const operation: EditPatch['operation'] = lower.includes('caption') ? 'RECAPTION' : lower.includes('voice') || lower.includes('narrator') ? 'REVOICE' : lower.includes('replace') || lower.includes('footage') || lower.includes('image') ? 'REPLACE_ASSET' : lower.includes('faster') || lower.includes('slow') ? 'RETIME' : lower.includes('rewrite') || lower.includes('funnier') ? 'REWRITE_BEAT' : 'REGENERATE_SHOT';
  return { patchId: `edit-${Date.now()}`, targetStartSec: start, targetEndSec: end, operation, reason: request, affectedNodeIds: [], estimatedCostUsd: operation === 'REGENERATE_SHOT' ? 0.5 : 0, qcRequirements: ['timeline-sync', 'audio-sync', 'rights-check', 'localized-review'] };
}
