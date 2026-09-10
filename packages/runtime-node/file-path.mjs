import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function pathFromUri(uri) {
  const value = String(uri ?? '').trim();
  if (value.startsWith('file://')) {
    try { return fileURLToPath(value); } catch { return null; }
  }
  if (isAbsolute(value)) return value;
  if (value.startsWith('.')) return resolve(value);
  return null;
}
