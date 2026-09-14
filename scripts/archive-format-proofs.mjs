import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import { GoogleDriveLibraryProvider } from '@auto-ytb/providers';
import { GoogleOAuthTokenProvider } from '@auto-ytb/youtube';
import { NodeUploadAssetLoader } from '../packages/runtime-node/index.mjs';

const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? '';
function loadDotEnv(text) { const values = {}; for (const line of text.split(/\r?\n/)) { const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/); if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, ''); } return values; }
const root = resolve('.'); const envPath = resolve(root, '.env.local'); const env = { ...(existsSync(envPath) ? loadDotEnv(await readFile(envPath, 'utf8')) : {}), ...process.env };
const pivotId = arg('pivot-id'); if (!pivotId) throw new Error('Use --pivot-id=<id>');
const pivotRoot = resolve(root, '.data', 'visual-format-pivot', pivotId); const resultPath = resolve(pivotRoot, 'visual-format-pivot-result.json');
const result = JSON.parse(await readFile(resultPath, 'utf8'));
const required = (name) => { const value = String(env[name] ?? '').trim(); if (!value) throw new Error(`${name} is required for Drive archive`); return value; };
const oauth = new GoogleOAuthTokenProvider({ clientId: required('DRIVE_CLIENT_ID'), clientSecret: required('DRIVE_CLIENT_SECRET'), refreshToken: required('DRIVE_REFRESH_TOKEN') });
const library = new GoogleDriveLibraryProvider({ getAccessToken: () => oauth.getAccessToken(), rootFolderName: env.DRIVE_ROOT_FOLDER || 'AUTO-YTB', rootFolderId: required('DRIVE_ROOT_FOLDER_ID') });
const loader = new NodeUploadAssetLoader();
const mime = (file) => ({ '.mp4': 'video/mp4', '.png': 'image/png', '.json': 'application/json' }[extname(file).toLowerCase()] || 'application/octet-stream');
const archived = [];
for (const proof of result.proofs) {
  const files = [proof.videoPath, proof.contactPath, proof.manifestPath, resolve(pivotRoot, proof.key, 'report.json')];
  for (const file of files) {
    const loaded = await loader.load(file); const body = loaded.body instanceof Blob ? new Uint8Array(await loaded.body.arrayBuffer()) : loaded.body;
    const name = file.endsWith('proof.mp4') ? 'format-proof.mp4' : file.endsWith('storyboard-contact-sheet.png') ? 'storyboard-contact-sheet.png' : file.endsWith('manifest.json') ? 'manifest.json' : 'report.json';
    const uploaded = await library.upload({ pathSegments: ['future-tech-business-en', 'FORMAT_PROOFS', proof.key], fileName: name, mimeType: mime(file), data: body, metadata: { pivotId, formatFamily: proof.format, source: 'original-format-proof', notPublicationCandidate: true, costUsd: proof.formatProofScore ? result.voice.costUsd / result.proofs.length : 0 } });
    archived.push({ format: proof.format, key: proof.key, name, ...uploaded });
  }
}
const index = await library.writeJson({ pathSegments: ['future-tech-business-en', 'FORMAT_PROOFS'], fileName: `${pivotId}.json`, value: { pivotId, archivedAt: new Date().toISOString(), notPublicationCandidate: true, recommendedFormat: result.recommendedFormat, files: archived }, metadata: { pivotId, source: 'visual-format-pivot' } });
console.log(JSON.stringify({ pivotId, recommendedFormat: result.recommendedFormat, files: archived, index }, null, 2));
