import type { Publisher } from '@auto-ytb/providers';
import { GoogleOAuthTokenProvider } from './oauth.js';

export interface UploadAssetLoader {
  load(uri: string): Promise<{ body: Uint8Array | Blob; mimeType: string; size: number }>;
}

function asRequestBody(body: Uint8Array | Blob): BodyInit {
  return body as BodyInit;
}

export class YouTubePublisher implements Publisher {
  readonly name = 'youtube-data-api';
  constructor(private readonly tokenProvider: GoogleOAuthTokenProvider, private readonly loader: UploadAssetLoader, private readonly fetchFn: typeof fetch = fetch) {}

  async uploadPrivate(input: {
    fileUri: string;
    title: string;
    description: string;
    tags: string[];
    categoryId?: string;
    language: string;
    containsSyntheticMedia: boolean;
    selfDeclaredMadeForKids?: boolean;
  }): Promise<{ externalId: string; url?: string; status: 'private' }> {
    const token = await this.tokenProvider.getAccessToken();
    const asset = await this.loader.load(input.fileUri);
    const metadata = {
      snippet: {
        title: input.title.slice(0, 100),
        description: input.description.slice(0, 5000),
        ...(input.tags.length ? { tags: input.tags.slice(0, 50) } : {}),
        ...(input.categoryId ? { categoryId: input.categoryId } : {}),
        defaultLanguage: input.language,
      },
      status: {
        privacyStatus: 'private',
        selfDeclaredMadeForKids: input.selfDeclaredMadeForKids === true,
        containsSyntheticMedia: input.containsSyntheticMedia,
      },
    };
    const init = await this.fetchFn('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json; charset=UTF-8',
        'x-upload-content-length': String(asset.size),
        'x-upload-content-type': asset.mimeType,
      },
      body: JSON.stringify(metadata),
    });
    if (!init.ok) throw new Error(`YouTube upload session failed ${init.status}: ${(await init.text()).slice(0, 500)}`);
    const location = init.headers.get('location');
    if (!location) throw new Error('YouTube resumable upload did not return a Location header');
    const upload = await this.fetchFn(location, {
      method: 'PUT',
      headers: { 'content-type': asset.mimeType, 'content-length': String(asset.size) },
      body: asRequestBody(asset.body),
    });
    if (!upload.ok) throw new Error(`YouTube upload failed ${upload.status}: ${(await upload.text()).slice(0, 500)}`);
    const json = await upload.json() as { id: string };
    return { externalId: json.id, url: `https://www.youtube.com/watch?v=${json.id}`, status: 'private' };
  }

  async setThumbnail(input: { externalId: string; fileUri: string }): Promise<{ status: 'set' }> {
    const token = await this.tokenProvider.getAccessToken();
    const asset = await this.loader.load(input.fileUri);
    if (!['image/jpeg','image/png'].includes(asset.mimeType)) throw new Error(`Unsupported YouTube thumbnail mime type: ${asset.mimeType}`);
    if (asset.size > 2 * 1024 * 1024) throw new Error(`YouTube thumbnail exceeds 2 MB: ${asset.size} bytes`);
    const response = await this.fetchFn(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(input.externalId)}&uploadType=media`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': asset.mimeType, 'content-length': String(asset.size) },
      body: asRequestBody(asset.body),
    });
    if (!response.ok) throw new Error(`YouTube thumbnail upload failed ${response.status}: ${(await response.text()).slice(0, 500)}`);
    return { status: 'set' };
  }

  async schedule(input: { externalId: string; publishAt: string }): Promise<{ status: 'scheduled'; publishAt: string }> {
    const publishAt = new Date(input.publishAt);
    if (!Number.isFinite(publishAt.getTime()) || publishAt.getTime() <= Date.now()) throw new Error('publishAt must be a valid future timestamp');
    const token = await this.tokenProvider.getAccessToken();
    const current = await this.fetchFn(`https://www.googleapis.com/youtube/v3/videos?part=status&id=${encodeURIComponent(input.externalId)}`, { headers:{ authorization:`Bearer ${token}` } });
    let currentStatus: { selfDeclaredMadeForKids?: boolean; containsSyntheticMedia?: boolean } = {};
    if (current.ok) {
      const json = await current.json() as { items?: Array<{ status?: { selfDeclaredMadeForKids?: boolean; containsSyntheticMedia?: boolean } }> };
      currentStatus = json.items?.[0]?.status ?? {};
    }
    const response = await this.fetchFn('https://www.googleapis.com/youtube/v3/videos?part=status', {
      method: 'PUT',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ id: input.externalId, status: { privacyStatus: 'private', publishAt: publishAt.toISOString(), ...(currentStatus.selfDeclaredMadeForKids !== undefined ? { selfDeclaredMadeForKids:currentStatus.selfDeclaredMadeForKids } : {}), ...(currentStatus.containsSyntheticMedia !== undefined ? { containsSyntheticMedia:currentStatus.containsSyntheticMedia } : {}) } }),
    });
    if (!response.ok) throw new Error(`YouTube schedule failed ${response.status}: ${(await response.text()).slice(0, 500)}`);
    return { status: 'scheduled', publishAt: publishAt.toISOString() };
  }
}
