import type { TextModel } from '@auto-ytb/providers';
import type { ResearchDossier, StoryAngle } from '@auto-ytb/editorial';
import type { VideoScript } from './types.js';

export function validateScript(script: VideoScript, dossier: ResearchDossier): string[] {
  const errors: string[] = [];
  if (script.beats.length < 5) errors.push('Script needs at least 5 beats');
  if (script.beats[0]?.purpose !== 'hook') errors.push('First beat must be a hook');
  if (!script.beats.some((beat) => beat.purpose === 'payoff' || beat.purpose === 'reveal')) errors.push('Script needs a payoff/reveal');
  const validSources = new Set(dossier.sources.map((source) => source.id));
  for (const beat of script.beats) {
    if (beat.sourceIds.some((sourceId) => !validSources.has(sourceId))) errors.push(`Beat ${beat.id} references an unknown source`);
  }
  return [...new Set(errors)];
}

export async function generateScript(input: { dossier: ResearchDossier; angle: StoryAngle; model: TextModel; language?: string; targetDurationSec?: number }): Promise<VideoScript> {
  const targetDurationSec = input.targetDurationSec ?? 600;
  const claims = input.dossier.claims.map((claim) => `[${claim.id}] ${claim.text} sources=${claim.sourceIds.join(',')}`).join('\n');
  const response = await input.model.generateJson<VideoScript>({
    system: 'You are a high-retention YouTube documentary writer. Be precise, visual, original, source-grounded and concise. Do not invent facts. Build curiosity without misleading clickbait.',
    prompt: `Angle: ${input.angle.title}\nThesis: ${input.angle.thesis}\nViewer promise: ${input.angle.viewerPromise}\nTarget duration: ${targetDurationSec}s\nClaims:\n${claims}\n\nCreate a beat-by-beat script. Use source IDs from the dossier for factual beats.`,
    schemaName: 'video_script',
    temperature: 0.45,
  });
  return { ...response.value, language: input.language ?? response.value.language ?? 'en', targetDurationSec };
}
