export type Usage = {
  inputTokens?: number;
  outputTokens?: number;
  durationSeconds?: number;
  images?: number;
  videoSeconds?: number;
  costUsd?: number;
};

export type SearchResult = {
  id: string;
  title: string;
  url: string;
  snippet: string;
  publishedAt?: string;
  author?: string;
  sourceType?: 'primary' | 'news' | 'official' | 'community' | 'reference' | 'unknown';
};

export interface SearchProvider {
  search(query: string, options?: { limit?: number; recencyDays?: number; domains?: string[] }): Promise<SearchResult[]>;
}

export interface TextModel {
  readonly name: string;
  /** Optional cumulative non-asset provider spend (search + language-model work) for pre-render budget gates. */
  getNonAssetCostUsd?(): number;
  generateJson<T>(input: {
    system: string;
    prompt: string;
    schemaName: string;
    temperature?: number;
  }): Promise<{ value: T; usage?: Usage }>;
}

export type BinaryAsset = {
  id: string;
  uri: string;
  mimeType: string;
  bytes?: number;
  provider: string;
  model?: string;
  promptHash?: string;
  license?: string;
  sourceUrl?: string;
  costUsd?: number;
  metadata?: Record<string, unknown>;
};

export type VoiceAlignment = {
  characters: string[];
  characterStartTimesSeconds: number[];
  characterEndTimesSeconds: number[];
};
export type VoiceAsset = BinaryAsset & { durationSeconds?: number; alignment?: VoiceAlignment; language?: string; voiceId?: string };

export interface VoiceProvider {
  readonly name: string;
  synthesize(input: { text: string; voice: string; language: string }): Promise<VoiceAsset>;
}

export interface ImageProvider {
  readonly name: string;
  generate(input: { prompt: string; aspectRatio: string; referenceUris?: string[] }): Promise<BinaryAsset>;
}

export interface VideoProvider {
  readonly name: string;
  generate(input: { prompt: string; durationSeconds: number; aspectRatio: string; referenceUris?: string[] }): Promise<BinaryAsset>;
}

export interface ThumbnailComposer {
  readonly name: string;
  compose(input: { backgroundUri: string; text?: string; outputKey: string }): Promise<BinaryAsset>;
}

export interface ObjectStore {
  readonly name: string;
  put(input: { key: string; contentType: string; data: string | Uint8Array }): Promise<{ uri: string; bytes?: number }>;
}

export type FinalMediaInspection = {
  passed: boolean;
  score: number;
  width?: number;
  height?: number;
  durationSeconds?: number;
  hasVideo: boolean;
  hasAudio: boolean;
  blackSeconds?: number;
  longestBlackSeconds?: number;
  silenceSeconds?: number;
  longestSilenceSeconds?: number;
  issues: string[];
  metrics?: Record<string, number | string | boolean | null>;
};

export interface VideoRenderer {
  readonly name: string;
  render(input: { manifestUri: string; outputKey: string }): Promise<BinaryAsset & { durationSeconds?: number }>;
  inspect?(input: {
    fileUri: string;
    expectedWidth: number;
    expectedHeight: number;
    expectedDurationSeconds: number;
    requireAudio: boolean;
  }): Promise<FinalMediaInspection>;
}

export interface ContentLibraryProvider {
  readonly name: string;
  ensurePath(pathSegments: string[]): Promise<{ folderId: string; path: string }>;
  upload(input: { pathSegments: string[]; fileName: string; mimeType: string; data: Uint8Array | string; metadata?: Record<string, unknown> }): Promise<{ externalId: string; uri: string; bytes?: number }>;
  writeJson(input: { pathSegments: string[]; fileName: string; value: unknown; metadata?: Record<string, unknown> }): Promise<{ externalId: string; uri: string; bytes?: number }>;
}

export interface Publisher {
  readonly name: string;
  uploadPrivate(input: {
    fileUri: string;
    title: string;
    description: string;
    tags: string[];
    categoryId?: string;
    language: string;
    containsSyntheticMedia: boolean;
    selfDeclaredMadeForKids?: boolean;
  }): Promise<{ externalId: string; url?: string; status: 'private' }>;
  setThumbnail(input: { externalId: string; fileUri: string }): Promise<{ status: 'set' }>;
  schedule(input: { externalId: string; publishAt: string }): Promise<{ status: 'scheduled'; publishAt: string }>;
}
