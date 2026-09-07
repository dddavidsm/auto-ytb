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
};

export interface VoiceProvider {
  readonly name: string;
  synthesize(input: { text: string; voice: string; language: string }): Promise<BinaryAsset & { durationSeconds?: number }>;
}

export interface ImageProvider {
  readonly name: string;
  generate(input: { prompt: string; aspectRatio: string; referenceUris?: string[] }): Promise<BinaryAsset>;
}

export interface VideoProvider {
  readonly name: string;
  generate(input: { prompt: string; durationSeconds: number; aspectRatio: string; referenceUris?: string[] }): Promise<BinaryAsset>;
}

export interface ObjectStore {
  readonly name: string;
  put(input: { key: string; contentType: string; data: string | Uint8Array }): Promise<{ uri: string; bytes?: number }>;
}

export interface VideoRenderer {
  readonly name: string;
  render(input: { manifestUri: string; outputKey: string }): Promise<BinaryAsset & { durationSeconds?: number }>;
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
  }): Promise<{ externalId: string; url?: string; status: 'private' }>;
  schedule(input: { externalId: string; publishAt: string }): Promise<{ status: 'scheduled'; publishAt: string }>;
}
