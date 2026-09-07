import type { BinaryAsset, ImageProvider, ObjectStore, Publisher, SearchProvider, SearchResult, TextModel, VideoProvider, VideoRenderer, VoiceProvider } from './types.js';

function stableHash(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export class MockSearchProvider implements SearchProvider {
  constructor(private readonly fixtures: Record<string, SearchResult[]> = {}) {}
  async search(query: string, options?: { limit?: number }): Promise<SearchResult[]> {
    const exact = this.fixtures[query] ?? [];
    return exact.slice(0, options?.limit ?? 10);
  }
}

export class MockTextModel implements TextModel {
  readonly name = 'mock-text-model';
  constructor(private readonly responder?: (schemaName: string, prompt: string) => unknown) {}
  async generateJson<T>(input: { system: string; prompt: string; schemaName: string }): Promise<{ value: T }> {
    if (!this.responder) throw new Error(`MockTextModel has no responder for ${input.schemaName}`);
    return { value: this.responder(input.schemaName, input.prompt) as T };
  }
}

function mockAsset(kind: string, prompt: string, mimeType: string, provider: string): BinaryAsset {
  const id = `${kind}_${stableHash(prompt)}`;
  return { id, uri: `mock://${provider}/${id}`, mimeType, provider, promptHash: stableHash(prompt), costUsd: 0 };
}

export class MockVoiceProvider implements VoiceProvider {
  readonly name = 'mock-voice';
  async synthesize(input: { text: string; voice: string; language: string }) {
    return { ...mockAsset('voice', `${input.voice}:${input.language}:${input.text}`, 'audio/wav', this.name), durationSeconds: Math.max(1, Math.round(input.text.split(/\s+/).length / 2.5)) };
  }
}

export class MockImageProvider implements ImageProvider {
  readonly name = 'mock-image';
  async generate(input: { prompt: string; aspectRatio: string }) {
    return mockAsset('image', `${input.aspectRatio}:${input.prompt}`, 'image/png', this.name);
  }
}

export class MockVideoProvider implements VideoProvider {
  readonly name = 'mock-video';
  async generate(input: { prompt: string; durationSeconds: number; aspectRatio: string }) {
    return { ...mockAsset('video', `${input.aspectRatio}:${input.durationSeconds}:${input.prompt}`, 'video/mp4', this.name), costUsd: 0 };
  }
}

export class MockObjectStore implements ObjectStore {
  readonly name = 'mock-store';
  async put(input: { key: string; contentType: string; data: string | Uint8Array }) {
    const bytes = typeof input.data === 'string' ? input.data.length : input.data.byteLength;
    return { uri: `mock://store/${input.key}`, bytes };
  }
}

export class MockRenderer implements VideoRenderer {
  readonly name = 'mock-renderer';
  async render(input: { manifestUri: string; outputKey: string }) {
    return { ...mockAsset('render', `${input.manifestUri}:${input.outputKey}`, 'video/mp4', this.name), uri: `mock://render/${input.outputKey}` };
  }
}

export class MockPublisher implements Publisher {
  readonly name = 'mock-publisher';
  async uploadPrivate(input: { fileUri: string; title: string; description: string; tags: string[]; language: string; containsSyntheticMedia: boolean }) {
    return { externalId: `yt_mock_${stableHash(`${input.fileUri}:${input.title}`)}`, url: undefined, status: 'private' as const };
  }
  async schedule(input: { externalId: string; publishAt: string }) {
    return { status: 'scheduled' as const, publishAt: input.publishAt };
  }
}
