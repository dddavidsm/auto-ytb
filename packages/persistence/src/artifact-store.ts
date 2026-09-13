import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rename, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';

export type ArtifactType = 'SCRIPT' | 'VOICE' | 'IMAGE' | 'VIDEO' | 'MUSIC' | 'SFX' | 'CAPTION' | 'MAP' | 'GRAPHIC' | 'PROXY' | 'THUMBNAIL' | 'RENDER' | 'REPORT';
export type ArtifactMetadata = { artifactId: string; runId: string; sceneId?: string; type: ArtifactType; mimeType: string; provider: string; model?: string; path: string; storageKey: string; size: number; duration?: number; resolution?: { width: number; height: number }; hash: string; createdAt: string; cost: number; isDraft: boolean; isFinal: boolean; metadata?: Record<string, unknown> };

const safe = (value: string) => String(value).replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '').slice(0, 180) || 'artifact';
const sha256 = (body: Uint8Array) => createHash('sha256').update(body).digest('hex');
async function atomicJson(path: string, value: unknown) { await mkdir(dirname(path), { recursive: true }); const temp = `${path}.${process.pid}.tmp`; await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); await rename(temp, path); }

export interface ArtifactStore { putFile(input: Omit<ArtifactMetadata, 'artifactId' | 'path' | 'storageKey' | 'size' | 'hash' | 'createdAt'> & { sourcePath: string; artifactId?: string }): Promise<ArtifactMetadata>; putJson(input: Omit<ArtifactMetadata, 'artifactId' | 'path' | 'storageKey' | 'size' | 'hash' | 'createdAt'> & { value: unknown; artifactId?: string }): Promise<ArtifactMetadata>; get(artifactId: string): Promise<ArtifactMetadata | null>; isValid(artifact: ArtifactMetadata): Promise<boolean>; list(runId: string): Promise<ArtifactMetadata[]>; }

export class FileArtifactStore implements ArtifactStore {
  readonly root: string;
  constructor(root = '.data/production-artifacts') { this.root = resolve(root); }
  private metadataPath(runId: string, artifactId: string) { return join(this.root, 'runs', safe(runId), 'metadata', `${safe(artifactId)}.json`); }
  private async persist(input: Omit<ArtifactMetadata, 'artifactId' | 'path' | 'storageKey' | 'size' | 'hash' | 'createdAt'> & { sourcePath: string; artifactId?: string }) {
    const body = await readFile(input.sourcePath); const hash = sha256(body); const artifactId = input.artifactId ?? `${safe(input.type.toLowerCase())}-${hash.slice(0, 16)}`; const ext = extname(input.sourcePath) || '.bin'; const storageKey = join('runs', safe(input.runId), safe(input.type.toLowerCase()), `${safe(artifactId)}${ext}`); const target = join(this.root, storageKey); await mkdir(dirname(target), { recursive: true }); if (resolve(input.sourcePath) !== resolve(target)) await copyFile(input.sourcePath, target); const result: ArtifactMetadata = { ...input, artifactId, path: target, storageKey, size: body.byteLength, hash, createdAt: new Date().toISOString() }; await atomicJson(this.metadataPath(input.runId, artifactId), result); return result;
  }
  async putFile(input: Omit<ArtifactMetadata, 'artifactId' | 'path' | 'storageKey' | 'size' | 'hash' | 'createdAt'> & { sourcePath: string; artifactId?: string }) { return this.persist(input); }
  async putJson(input: Omit<ArtifactMetadata, 'artifactId' | 'path' | 'storageKey' | 'size' | 'hash' | 'createdAt'> & { value: unknown; artifactId?: string }) { const path = join(this.root, 'runs', safe(input.runId), 'work', `${safe(input.artifactId ?? input.type.toLowerCase())}.json`); await mkdir(dirname(path), { recursive: true }); await atomicJson(path, input.value); return this.persist({ ...input, sourcePath: path }); }
  async get(artifactId: string) { const files = await this.findMetadata(this.root, `${safe(artifactId)}.json`); if (!files[0]) return null; return JSON.parse(await readFile(files[0], 'utf8')) as ArtifactMetadata; }
  async isValid(artifact: ArtifactMetadata) { try { const info = await stat(artifact.path); if (!info.isFile() || info.size !== artifact.size) return false; return sha256(await readFile(artifact.path)) === artifact.hash; } catch { return false; } }
  async list(runId: string) { const dir = join(this.root, 'runs', safe(runId), 'metadata'); try { const names = await readdir(dir); return Promise.all(names.filter((name) => name.endsWith('.json')).map(async (name) => JSON.parse(await readFile(join(dir, name), 'utf8')) as ArtifactMetadata)); } catch { return []; } }
  private async findMetadata(dir: string, wanted: string): Promise<string[]> { try { const entries = await readdir(dir, { withFileTypes: true }); const found: string[] = []; for (const entry of entries) { const path = join(dir, entry.name); if (entry.isDirectory()) found.push(...await this.findMetadata(path, wanted)); else if (entry.name === wanted) found.push(path); } return found; } catch { return []; } }
}
