import type { VisualSourcePolicy, VisualSourceRef } from './types.js';

export type SourceLike = {
  id: string;
  url?: string;
  title?: string;
  sourceType?: 'primary' | 'news' | 'official' | 'community' | 'reference' | 'unknown' | string;
  primaryEvidence?: boolean;
};

const DIRECT_ASSET_EXT = /\.(png|jpe?g|webp|gif|mp4|webm)(?:\?|#|$)/i;
const TRUSTED_PUBLIC_MEDIA = [
  'upload.wikimedia.org',
  'commons.wikimedia.org',
];

function hostname(url?: string): string | null {
  if (!url) return null;
  try { return new URL(url).hostname.toLowerCase(); } catch { return null; }
}

export function classifyVisualSource(source: SourceLike): VisualSourceRef {
  const url = source.url?.trim();
  const host = hostname(url);
  const directMedia = Boolean(url && DIRECT_ASSET_EXT.test(url));
  const publicMediaHost = Boolean(host && TRUSTED_PUBLIC_MEDIA.includes(host));

  let policy: VisualSourcePolicy = 'SOURCE_CARD';
  let reason = 'Use a transformed source card with attribution; do not copy the page itself.';

  if (!url) {
    policy = 'PROCEDURAL_ONLY';
    reason = 'Source has no resolvable URL; retain provenance but render only original procedural visuals.';
  } else if (source.sourceType === 'community') {
    policy = 'PROCEDURAL_ONLY';
    reason = 'Community content is reference evidence only; avoid reproducing user-generated media without an explicit license.';
  } else if (directMedia && publicMediaHost) {
    policy = 'DIRECT_ASSET_ALLOWED';
    reason = 'Direct media URL is from a public-media host; still preserve source URL and verify the item license before public release.';
  } else if (source.sourceType === 'official' || source.sourceType === 'primary' || source.primaryEvidence) {
    policy = 'SOURCE_CARD';
    reason = 'Primary/official evidence is suitable for an attributed transformed source card; page copying remains disabled by default.';
  }

  return { sourceId: source.id, url, title: source.title, sourceType: source.sourceType, policy, reason };
}

export function buildVisualSourceRefs(sourceIds: string[], sources: SourceLike[]): VisualSourceRef[] {
  const byId = new Map(sources.map((source) => [source.id, source]));
  return sourceIds.map((id) => byId.get(id)).filter((source): source is SourceLike => Boolean(source)).map(classifyVisualSource);
}
