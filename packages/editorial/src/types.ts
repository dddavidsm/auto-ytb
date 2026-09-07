import type { SearchResult } from '@auto-ytb/providers';

export type SourceAssessment = SearchResult & {
  authority: number;
  freshness: number;
  primaryEvidence: boolean;
  qualityScore: number;
};

export type Claim = {
  id: string;
  text: string;
  importance: 'critical' | 'supporting' | 'context';
  sourceIds: string[];
  confidence: number;
  disputed: boolean;
  notes?: string;
};

export type StoryAngle = {
  id: string;
  title: string;
  thesis: string;
  viewerPromise: string;
  hook: string;
  novelty: number;
  emotionalPull: number;
  retentionPotential: number;
  monetizationFit: number;
  evidenceFit: number;
  productionFit: number;
  risk: number;
  score: number;
};

export type ResearchDossier = {
  topic: string;
  generatedAt: string;
  executiveSummary: string;
  sources: SourceAssessment[];
  claims: Claim[];
  contradictions: Array<{ claimIds: string[]; description: string; severity: 'low' | 'medium' | 'high' }>;
  timeline: Array<{ date: string; event: string; sourceIds: string[] }>;
  angles: StoryAngle[];
  recommendedAngleId: string | null;
  researchConfidence: number;
  blockingIssues: string[];
};
