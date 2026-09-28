import type { ContentLibraryProvider } from './types.js';

function clean(value: string) {
  return value.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '').replace(/\.\.(?:\/|$)/g, '').trim();
}

/**
 * Durable content-library adapter backed by the project's authenticated R2
 * media proxy. It keeps production archival inside Cloudflare and does not
 * require a second OAuth identity such as Google Drive.
 */
export class CloudflareR2LibraryProvider implements ContentLibraryProvider {
  readonly name = 'cloudflare-r2';
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchFn: typeof fetch;
  private readonly prefix: string;

  constructor(options: { baseUrl: string; token: string; prefix?: string; fetchFn?: typeof fetch }) {
    this.baseUrl = String(options.baseUrl || '').trim();
    this.token = String(options.token || '').trim();
    this.prefix = clean(options.prefix || 'library');
    this.fetchFn = options.fetchFn ?? fetch;
    if (!this.baseUrl) throw new Error('AUTO_YTB_MEDIA_PROXY_URL is required for Cloudflare R2 archival');
    if (!this.token) throw new Error('CONTROL_PLANE_TOKEN is required for Cloudflare R2 archival');
  }

  private key(pathSegments: string[], fileName: string) {
    return [this.prefix, ...pathSegments, fileName].map((part) => clean(String(part))).filter(Boolean).join('/');
  }

  private urlFor(key: string) {
    const url = new URL(this.baseUrl);
    url.searchParams.set('key', key);
    return url;
  }

  async ensurePath(pathSegments: string[]) {
    const path = [this.prefix, ...pathSegments].map((part) => clean(String(part))).filter(Boolean).join('/');
    return { folderId: path, path };
  }

  async upload(input: { pathSegments: string[]; fileName: string; mimeType: string; data: Uint8Array | string; metadata?: Record<string, unknown> }) {
    const data = typeof input.data === 'string' ? new TextEncoder().encode(input.data) : input.data;
    const key = this.key(input.pathSegments, input.fileName);
    const response = await this.fetchFn(this.urlFor(key), {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${this.token}`,
        'content-type': input.mimeType || 'application/octet-stream',
        'content-length': String(data.byteLength),
        ...(input.metadata ? { 'x-auto-ytb-metadata': JSON.stringify(input.metadata).slice(0, 6000) } : {}),
      },
      // Node's fetch accepts Uint8Array bodies; the bundled DOM typings are
      // narrower around ArrayBufferLike, so preserve the runtime-safe value
      // while keeping the provider portable across Node and Workers builds.
      body: data as unknown as BodyInit,
    });
    if (!response.ok) throw new Error(`Cloudflare R2 archival failed ${response.status}: ${(await response.text()).slice(0, 600)}`);
    return { externalId: key, uri: this.urlFor(key).toString(), bytes: data.byteLength };
  }

  async writeJson(input: { pathSegments: string[]; fileName: string; value: unknown; metadata?: Record<string, unknown> }) {
    return this.upload({ ...input, mimeType: 'application/json', data: JSON.stringify(input.value, null, 2) });
  }
}
