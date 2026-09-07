import type { BinaryAsset } from '@auto-ytb/providers';

export type ScriptBeat = {
  id: string;
  startSec: number;
  targetDurationSec: number;
  purpose: 'hook' | 'setup' | 'evidence' | 'escalation' | 'reveal' | 'payoff' | 'cta';
  narration: string;
  onScreenText?: string;
  visualIntent: string;
  sourceIds: string[];
  retentionDevice?: 'open_loop' | 'pattern_interrupt' | 'question' | 'contrast' | 'reveal' | 'none';
};

export type VideoScript = {
  title: string;
  language: string;
  targetDurationSec: number;
  thesis: string;
  beats: ScriptBeat[];
  outro: string;
};

export type PackagingVariant = {
  id: string;
  title: string;
  thumbnailConcept: string;
  thumbnailText?: string;
  promise: string;
  curiosity: number;
  clarity: number;
  credibility: number;
  differentiation: number;
  score: number;
};

export type ThumbnailAsset = BinaryAsset & { packagingId: string; text?: string };

export type Scene = {
  id: string;
  startSec: number;
  durationSec: number;
  kind: 'archive' | 'screenshot' | 'chart' | 'map' | 'motion_graphic' | 'ai_image' | 'ai_video' | 'text' | 'broll';
  instruction: string;
  sourceIds: string[];
  generated: boolean;
  visualValue?: number;
  costTier?: 'free' | 'low' | 'premium';
  selectionReason?: string;
};

export type AssetRecord = BinaryAsset & {
  sceneId: string;
  generated: boolean;
  sourceIds: string[];
  metadata?: Record<string, unknown>;
};
export type ProductionContentFormat = 'LONG_HORIZONTAL' | 'SHORT_VERTICAL';

export type ProductionManifest = {
  projectId: string;
  createdAt: string;
  contentFormat: ProductionContentFormat;
  aspectRatio: '16:9' | '9:16';
  frame: { width: number; height: number };
  script: VideoScript;
  packaging: PackagingVariant[];
  thumbnails: ThumbnailAsset[];
  selectedPackagingId: string;
  packagingSelection?: {
    mode: 'EXPLOIT' | 'EXPLORE';
    explorationRate: number;
    scores: Array<{ id: string; baseScore: number; learnedScore: number; noveltyScore: number; banditScore: number }>;
  };
  scenes: Scene[];
  assets: AssetRecord[];
  voice?: BinaryAsset & { durationSeconds?: number };
  estimatedCostUsd: number;
  actualCostUsd: number;
  containsSyntheticMedia: boolean;
};
