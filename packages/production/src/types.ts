import type { BinaryAsset, VoiceAsset } from '@auto-ytb/providers';

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

export type VisualSourcePolicy = 'SOURCE_CARD' | 'DIRECT_ASSET_ALLOWED' | 'PROCEDURAL_ONLY' | 'BLOCKED';
export type VisualSourceRef = {
  sourceId: string;
  url?: string;
  title?: string;
  sourceType?: string;
  policy: VisualSourcePolicy;
  reason: string;
};

export type Scene = {
  id: string;
  startSec: number;
  durationSec: number;
  kind: 'archive' | 'screenshot' | 'source_card' | 'chart' | 'map' | 'motion_graphic' | 'ai_image' | 'ai_video' | 'text' | 'broll';
  instruction: string;
  sourceIds: string[];
  generated: boolean;
  visualValue?: number;
  costTier?: 'free' | 'low' | 'premium';
  selectionReason?: string;
  sourceFootageId?: string;
  sourceRefs?: VisualSourceRef[];
};

export type AssetRecord = BinaryAsset & { sceneId: string; generated: boolean; sourceIds: string[]; metadata?: Record<string, unknown> };
export type SourceFootage = {
  id: string;
  uri: string;
  title?: string;
  sourceUrl?: string;
  /** Research/source id that explains what this footage demonstrates. */
  sourceId?: string;
  beatIds?: string[];
  startSec?: number;
  endSec?: number;
  license: string;
  rightsStatus: 'CLEARED' | 'VERIFY' | 'BLOCKED';
  cropMode?: 'CENTER' | 'SMART_CENTER';
};
export type ProductionContentFormat = 'LONG_HORIZONTAL' | 'SHORT_VERTICAL';

export type ContentExecutionPlan = {
  archetypeId: string;
  researchMode: 'FACTUAL_RESEARCH' | 'CREATIVE_ORIGINAL';
  researchRequired: boolean;
  factClaimMode: 'VERIFY_CLAIMS' | 'DISTINGUISH_FACT_FROM_LEGEND' | 'CREATIVE_ORIGINAL';
  scriptMode: 'NARRATION' | 'DIALOGUE' | 'HYBRID' | 'VISUAL_ACTION';
  voiceMode: string;
  voiceRequired: boolean;
  allowIntegratedNarrator: boolean;
  requiresCanonicalCast: boolean;
  audioMode: 'NARRATION_LED' | 'DIALOGUE_LED' | 'HYBRID' | 'NATURAL_SOUND';
  captionMode: 'FULL_SPEECH' | 'SPEAKER_AWARE' | 'CONTEXT_ONLY';
  visualMode: 'EVIDENCE_FIRST' | 'HYBRID' | 'GENERATIVE_FIRST' | 'CHARACTER_CONTINUITY';
  realityMode: string;
  cameraProfile: string;
  syntheticDisclosurePolicy: string;
  preferredFormats: ProductionContentFormat[];
  targetSceneDurationSec?: number;
  generativeSpendBias: number;
  requiredCapabilities: { search: boolean; voice: boolean; image: boolean; video: boolean };
};

export type CaptionPlan = {
  version: 1;
  mode: ContentExecutionPlan['captionMode'];
  enabled: boolean;
  burnIn: boolean;
  preset: 'NONE' | 'SOCIAL_CONTEXT' | 'EDITORIAL_CLEAN' | 'DIALOGUE_SPEAKER' | 'BOLD_SHORTS';
  source: 'VOICE_ALIGNMENT' | 'SCRIPT_DIALOGUE' | 'ON_SCREEN_CONTEXT' | 'NONE';
  maxChars: number;
  maxDurationSeconds: number;
  maxLines: 1 | 2;
  position: 'BOTTOM' | 'LOWER_MIDDLE' | 'MIDDLE';
  safeBottomPercent: number;
  fontScale: number;
  speakerAware: boolean;
  highlightKeywords: boolean;
  uppercase: boolean;
};

export type EditPlan = {
  version: 1;
  preset: 'MOBILE_NATURAL' | 'KIDS_STORY' | 'DOCUMENTARY' | 'SOCIAL_FAST' | 'COMEDY_TIMING' | 'CINEMATIC_STORY';
  transitionMode: 'HARD_CUT' | 'SOFT_FADE' | 'MOTIVATED';
  transitionDurationSeconds: number;
  filmLook: boolean;
  filmGrain: number;
  punchInAnchors: boolean;
  punchInScale: number;
  mobileImperfections: boolean;
  reactionTiming: boolean;
  maxCutsPerMinute: number;
  minSceneSeconds: number;
  preserveAudioTiming: boolean;
};

export type RenderExecutionEvidence = {
  captionsBurned: boolean;
  captionCueCount: number;
  captionPreset?: string;
  editPreset?: string;
  transitionsApplied: number;
  punchInsApplied: number;
  filmLookApplied: boolean;
};

export type ContentArchetypeSnapshot = {
  version: number;
  id: string;
  label: string;
  confidence: number;
  reasons: string[];
  voiceMode: string;
  realityMode: string;
  cameraProfile: string;
  syntheticDisclosurePolicy: string;
  profile: Record<string, unknown>;
};

export type AudioRightsStatus = 'CLEARED' | 'VERIFY' | 'BLOCKED';
export type AudioLibraryAsset = {
  id: string;
  kind: 'music' | 'sfx';
  uri: string;
  title?: string;
  license: string;
  rightsStatus: AudioRightsStatus;
  sourceUrl?: string;
  moods?: string[];
  tags?: string[];
  formats?: ProductionContentFormat[];
  costUsd?: number;
  defaultGain?: number;
  durationSeconds?: number;
};
export type SoundtrackCue = {
  assetId: string;
  kind: 'music' | 'sfx';
  uri: string;
  startSec: number;
  endSec?: number;
  gain: number;
  loop?: boolean;
  license: string;
  rightsStatus: AudioRightsStatus;
  sourceUrl?: string;
  costUsd?: number;
  reason: string;
};
export type SoundtrackPlan = {
  music?: SoundtrackCue;
  sfx: SoundtrackCue[];
  rightsReady: boolean;
  estimatedCostUsd: number;
  selectionNotes: string[];
};

export type ProductionManifest = {
  projectId: string;
  createdAt: string;
  contentFormat: ProductionContentFormat;
  aspectRatio: '16:9' | '9:16';
  frame: { width: number; height: number };
  contentArchetype?: ContentArchetypeSnapshot;
  executionPlan?: ContentExecutionPlan;
  captionPlan?: CaptionPlan;
  editPlan?: EditPlan;
  renderExecution?: RenderExecutionEvidence;
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
  sourceFootage?: SourceFootage[];
  voice?: VoiceAsset;
  soundtrack?: SoundtrackPlan;
  music?: SoundtrackCue;
  sfx?: SoundtrackCue[];
  estimatedCostUsd: number;
  actualCostUsd: number;
  containsSyntheticMedia: boolean;
};
