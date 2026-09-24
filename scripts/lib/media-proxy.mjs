import { readFile, stat } from 'node:fs/promises';
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
  });
  if (!response.ok) throw new Error(`Media persistence failed ${response.status}: ${(await response.text()).slice(0, 500)}`);
  return { key: String(key).replace(/^\/+/, ''), url: urlFor(settings.base, key).toString(), size: info.size };
}
