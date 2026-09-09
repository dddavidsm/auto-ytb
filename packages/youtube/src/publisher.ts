import { createHash } from 'node:crypto';
import type { Publisher } from '@auto-ytb/providers';
import { GoogleOAuthTokenProvider } from './oauth.js';

export interface UploadAssetLoader {
  load(uri: string): Promise<{ body: Uint8Array | Blob; mimeType: string; size: number }>;
}

function asRequestBody(body: Uint8Array | Blob): BodyInit {
  return body as BodyInit;
}

function markerFor(value: string): string {
  return `auto_ytb_${createHash('sha256').update(value).digest('hex').slice(0, 24)}`;
}

function cliArg(name: string): string | undefined {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);
}

export class YouTubePublisher implements Publisher {
  readonly name = 'youtube-data-api';
  constructor(
    private readonly tokenProvider: GoogleOAuthTokenProvider,
    private readonly loader: UploadAssetLoader,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly options: { idempotencyKey?: string } = {},
  ) {}

  private async findExistingUpload(token: string, marker: string): Promise<string | null> {
    const channels = await this.fetchFn('https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true', { headers:{ authorization:`Bearer ${token}` } });
    if (!channels.ok) return null;
    const channelJson = await channels.json() as { items?: Array<{ contentDetails?: { relatedPlaylists?: { uploads?: string } } }> };
    const uploadsPlaylist = channelJson.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsPlaylist) return null;

    let pageToken: string | undefined;
    for (let page = 0; page < 3; page += 1) {
      const params = new URLSearchParams({ part:'contentDetails', playlistId:uploadsPlaylist, maxResults:'50' });
      if (pageToken) params.set('pageToken', pageToken);
      const playlist = await this.fetchFn(`https://www.googleapis.com/youtube/v3/playlistItems?${params.toString()}`, { headers:{ authorization:`Bearer ${token}` } });
      if (!playlist.ok) return null;
      const playlistJson = await playlist.json() as { items?: Array<{ contentDetails?: { videoId?: string } }>; nextPageToken?: string };
      const ids = (playlistJson.items ?? []).map((item) => item.contentDetails?.videoId).filter((id): id is string => Boolean(id));
      if (ids.length) {
        const videos = await this.fetchFn(`https://www.googleapis.com/youtube/v3/videos?part=snippet,status&id=${encodeURIComponent(ids.join(','))}`, { headers:{ authorization:`Bearer ${token}` } });
        if (!videos.ok) return null;
        const videosJson = await videos.json() as { items?: Array<{ id?: string; snippet?: { tags?: string[] }; status?: { privacyStatus?: string } }> };
        const matched = (videosJson.items ?? []).find((item) => item.id && item.snippet?.tags?.includes(marker));
        if (matched?.id) return matched.id;
      }
      pageToken = playlistJson.nextPageToken;
      if (!pageToken) break;
    }
    return null;
  }

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
    // The opportunity id survives a process crash and a newly-created production run, unlike
    // the local render path. This makes a retry recover the already-uploaded private video.
    const stableSeed = String(this.options.idempotencyKey || process.env.AUTO_YTB_UPLOAD_IDEMPOTENCY_KEY || cliArg('opportunity-id') || input.fileUri);
    const marker = markerFor(stableSeed);
    const existing = await this.findExistingUpload(token, marker);
    if (existing) return { externalId:existing, url:`https://www.youtube.com/watch?v=${existing}`, status:'private' };

    const asset = await this.loader.load(input.fileUri);
    const tags = [...new Set([...input.tags.slice(0, 49), marker])];
    const metadata = {
      snippet: {
        title: input.title.slice(0, 100),
        description: input.description.slice(0, 5000),
        tags,
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
