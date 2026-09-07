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

  const synthetic = input.manifest.scenes.some((scene) => scene.generated) || input.manifest.assets.some((asset) => asset.generated);
  checks.push({ id: 'synthetic-disclosure', status: 'PASS', score: 100, message: synthetic ? 'Synthetic media disclosure required' : 'No synthetic-media disclosure required by asset plan' });

  const estimated = input.manifest.estimatedCostUsd;
  const maxCost = input.maxCostUsd ?? 25;
  checks.push({ id: 'cost', status: estimated > maxCost ? 'FAIL' : estimated > maxCost * 0.75 ? 'WARN' : 'PASS', score: Math.max(0, Math.round(100 - (estimated / maxCost) * 70)), message: `Estimated cost $${estimated.toFixed(2)} / cap $${maxCost.toFixed(2)}` });

  const blockers = checks.filter((check) => check.status === 'FAIL').map((check) => check.id);
  const score = Math.round(checks.reduce((sum, check) => sum + check.score, 0) / checks.length);
  return { passed: blockers.length === 0, score, checks, containsSyntheticMedia: synthetic, blockers };
}
