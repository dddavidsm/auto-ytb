import { existsSync } from 'node:fs';
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

export function escapeFfmpegFilterPath(path) {
  return String(path).replaceAll('\\', '/').replaceAll(':', '\\:').replaceAll("'", "\\'");
}

export function ffmpegFontOption() {
  const candidates = process.env.AUTO_YTB_FONT_FILE
    ? [process.env.AUTO_YTB_FONT_FILE]
    : process.platform === 'win32'
      ? ['C:\\Windows\\Fonts\\arial.ttf', 'C:\\Windows\\Fonts\\segoeui.ttf']
      : ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf'];
  const font = candidates.find((candidate) => existsSync(candidate));
  return font ? `fontfile='${escapeFfmpegFilterPath(font)}'` : '';
}
