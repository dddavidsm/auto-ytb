import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathFromUri } from '../../packages/runtime-node/file-path.mjs';

function config(env = process.env) {
  const base = String(env.AUTO_YTB_MEDIA_PROXY_URL || '').trim();
  const token = String(env.CONTROL_PLANE_TOKEN || '').trim();
  return base && token ? { base, token } : null;
}

function urlFor(base, key) {
  const url = new URL(base);
  url.searchParams.set('key', String(key).replace(/^\/+/, ''));
  return url;
}

export async function mirrorFile(uri, key, contentType, env = process.env) {
  const settings = config(env);
  if (!settings) return null;
  const path = pathFromUri(String(uri || ''));
  if (!path) return null;
  const info = await stat(path);
  if (!info.isFile()) return null;
  const response = await fetch(urlFor(settings.base, key), {
    method: 'PUT',
    headers: { authorization: `Bearer ${settings.token}`, 'content-type': contentType, 'content-length': String(info.size) },
    body: await readFile(path),
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) throw new Error(`Media persistence failed ${response.status}: ${(await response.text()).slice(0, 500)}`);
  return { key: String(key).replace(/^\/+/, ''), url: urlFor(settings.base, key).toString(), size: info.size };
}

export async function mirrorJson(value, key, env = process.env) {
  const settings = config(env);
  if (!settings) return null;
  const body = JSON.stringify(value);
  const response = await fetch(urlFor(settings.base, key), {
    method: 'PUT',
    headers: { authorization: `Bearer ${settings.token}`, 'content-type': 'application/json; charset=utf-8', 'content-length': String(Buffer.byteLength(body)) },
    body,
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Media manifest persistence failed ${response.status}: ${(await response.text()).slice(0, 500)}`);
  return { key: String(key).replace(/^\/+/, ''), url: urlFor(settings.base, key).toString(), size: Buffer.byteLength(body) };
}

export async function restoreFile(key, destination, env = process.env) {
  const settings = config(env);
  if (!settings) return null;
  const response = await fetch(urlFor(settings.base, key), { headers: { authorization: `Bearer ${settings.token}` }, signal: AbortSignal.timeout(30000) });
  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`Media cache read failed ${response.status}: ${(await response.text()).slice(0, 500)}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < 1024) throw new Error(`Media cache object ${key} is empty`);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
  return { path: destination, size: bytes.byteLength };
}

export async function readJson(key, env = process.env) {
  const settings = config(env);
  if (!settings) return null;
  const response = await fetch(urlFor(settings.base, key), { headers: { authorization: `Bearer ${settings.token}` }, signal: AbortSignal.timeout(10000) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Media manifest read failed ${response.status}: ${(await response.text()).slice(0, 500)}`);
  return response.json();
}
