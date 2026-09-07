import type { ResearchDossier } from '@auto-ytb/editorial';
import type { ProductionManifest, VideoScript } from '@auto-ytb/production';

export type QaCheck = { id: string; status: 'PASS' | 'WARN' | 'FAIL'; score: number; message: string };
export type QaReport = { passed: boolean; score: number; checks: QaCheck[]; containsSyntheticMedia: boolean; blockers: string[] };

function words(text: string): string[] { return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean); }
function overlap(a: string, b: string): number {
  const left = new Set(words(a)); const right = new Set(words(b));
  const intersection = [...left].filter((word) => right.has(word)).length;
  return intersection / Math.max(1, Math.min(left.size, right.size));
}
function clamp(value:number,min=0,max=100){return Math.max(min,Math.min(max,value));}

export function runQa(input: { dossier: ResearchDossier; script: VideoScript; manifest: ProductionManifest; priorScripts?: VideoScript[]; maxCostUsd?: number }): QaReport {
  const checks: QaCheck[] = [];
  const criticalUnsupported = input.dossier.claims.filter((claim) => claim.importance === 'critical' && claim.sourceIds.length === 0);
  checks.push({ id: 'factual', status: criticalUnsupported.length ? 'FAIL' : input.dossier.researchConfidence < 65 ? 'WARN' : 'PASS', score: criticalUnsupported.length ? 0 : input.dossier.researchConfidence, message: criticalUnsupported.length ? `${criticalUnsupported.length} critical claims unsupported` : `Research confidence ${input.dossier.researchConfidence}` });

  const unknownSources = input.script.beats.flatMap((beat) => beat.sourceIds).filter((id) => !input.dossier.sources.some((source) => source.id === id));
  checks.push({ id: 'provenance', status: unknownSources.length ? 'FAIL' : 'PASS', score: unknownSources.length ? 0 : 100, message: unknownSources.length ? 'Script contains unknown source references' : 'All script source references resolve' });

  const maxSimilarity = Math.max(0, ...(input.priorScripts ?? []).map((script) => overlap(input.script.beats.map((beat) => beat.narration).join(' '), script.beats.map((beat) => beat.narration).join(' '))));
  checks.push({ id: 'originality', status: maxSimilarity > 0.72 ? 'FAIL' : maxSimilarity > 0.5 ? 'WARN' : 'PASS', score: Math.round((1 - maxSimilarity) * 100), message: `Maximum prior-script lexical overlap ${(maxSimilarity * 100).toFixed(1)}%` });

  const coveredSceneIds = new Set(input.manifest.assets.map((asset) => asset.sceneId));
  const uncoveredScenes = input.manifest.scenes.filter((scene) => !coveredSceneIds.has(scene.id));
  checks.push({ id: 'visual-coverage', status: uncoveredScenes.length ? 'FAIL' : 'PASS', score: uncoveredScenes.length ? Math.max(0, Math.round(100 * (1 - uncoveredScenes.length / Math.max(1, input.manifest.scenes.length)))) : 100, message: uncoveredScenes.length ? `${uncoveredScenes.length} scenes have no visual asset` : 'Every scene has a concrete visual asset' });

  const isShort = input.manifest.contentFormat === 'SHORT_VERTICAL';
  const packagingIds = new Set(input.manifest.packaging.map((variant) => variant.id));
  const thumbnailIds = new Set(input.manifest.thumbnails.map((thumbnail) => thumbnail.packagingId));
  const missingThumbnails = isShort ? [] : [...packagingIds].filter((id) => !thumbnailIds.has(id));
  const selectedThumbnailMissing = isShort ? false : !thumbnailIds.has(input.manifest.selectedPackagingId);
  const oversizedThumbnails = input.manifest.thumbnails.filter((thumbnail) => (thumbnail.bytes ?? 0) > 2_000_000);
  const invalidThumbnailMime = input.manifest.thumbnails.filter((thumbnail) => !['image/jpeg','image/png'].includes(thumbnail.mimeType));
  const thumbnailTextTooLong = input.manifest.packaging.filter((variant) => words(variant.thumbnailText ?? '').length > 6 || (variant.thumbnailText?.length ?? 0) > 42);
  const packagingTitlesTooLong = input.manifest.packaging.filter((variant) => variant.title.length > 100);
  const thumbnailBlocking = isShort
    ? packagingTitlesTooLong.length > 0
    : Boolean(missingThumbnails.length || selectedThumbnailMissing || oversizedThumbnails.length || invalidThumbnailMime.length || input.manifest.thumbnails.length < Math.min(3,input.manifest.packaging.length));
  const thumbnailWarn = thumbnailTextTooLong.length || packagingTitlesTooLong.length;
  const thumbnailPenalty = missingThumbnails.length*25 + Number(selectedThumbnailMissing)*30 + oversizedThumbnails.length*15 + invalidThumbnailMime.length*20 + thumbnailTextTooLong.length*7 + packagingTitlesTooLong.length*7;
  checks.push({
    id:'packaging-readiness',
    status:thumbnailBlocking?'FAIL':thumbnailWarn?'WARN':'PASS',
    score:clamp(100-thumbnailPenalty),
    message:isShort
      ? (packagingTitlesTooLong.length ? `${packagingTitlesTooLong.length} Shorts titles exceed 100 characters` : 'Shorts packaging ready; custom thumbnail is not a production blocker')
      : thumbnailBlocking
        ? `Packaging blocked: ${missingThumbnails.length} variants missing thumbnails, selected thumbnail ${selectedThumbnailMissing?'missing':'ok'}, ${oversizedThumbnails.length} oversized, ${invalidThumbnailMime.length} invalid mime`
        : thumbnailWarn ? `${thumbnailTextTooLong.length} thumbnail texts or ${packagingTitlesTooLong.length} titles should be shortened` : `${input.manifest.thumbnails.length} thumbnail variants ready`,
  });

  const expectedAspect = isShort ? '9:16' : '16:9';
  const expectedPortrait = isShort ? input.manifest.frame.height > input.manifest.frame.width : input.manifest.frame.width > input.manifest.frame.height;
  checks.push({ id:'format-frame', status:input.manifest.aspectRatio===expectedAspect && expectedPortrait?'PASS':'FAIL', score:input.manifest.aspectRatio===expectedAspect && expectedPortrait?100:0, message:`${input.manifest.contentFormat} ${input.manifest.frame.width}x${input.manifest.frame.height} ${input.manifest.aspectRatio}` });

  const synthetic = input.manifest.scenes.some((scene) => scene.generated) || input.manifest.assets.some((asset) => asset.generated) || input.manifest.thumbnails.some((thumbnail) => thumbnail.provider !== 'human');
  checks.push({ id: 'synthetic-disclosure', status: 'PASS', score: 100, message: synthetic ? 'Synthetic media disclosure required where applicable' : 'No synthetic-media disclosure required by asset plan' });

  const estimated = input.manifest.estimatedCostUsd;
  const maxCost = input.maxCostUsd ?? 25;
  checks.push({ id: 'cost', status: estimated > maxCost ? 'FAIL' : estimated > maxCost * 0.75 ? 'WARN' : 'PASS', score: Math.max(0, Math.round(100 - (estimated / maxCost) * 70)), message: `Estimated cost $${estimated.toFixed(2)} / cap $${maxCost.toFixed(2)}` });

  const blockers = checks.filter((check) => check.status === 'FAIL').map((check) => check.id);
  const score = Math.round(checks.reduce((sum, check) => sum + check.score, 0) / checks.length);
  return { passed: blockers.length === 0, score, checks, containsSyntheticMedia: synthetic, blockers };
}
