import type { TextModel } from '@auto-ytb/providers';
import type { ResearchDossier, StoryAngle } from '@auto-ytb/editorial';
import type { ContentExecutionPlan, VideoScript } from './types.js';

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

export async function generateScript(input: {
  dossier: ResearchDossier;
  angle: StoryAngle;
  model: TextModel;
  language?: string;
  targetDurationSec?: number;
  guidance?: string;
  factClaimMode?: ContentExecutionPlan['factClaimMode'];
  scriptMode?: ContentExecutionPlan['scriptMode'];
}): Promise<VideoScript> {
  const targetDurationSec = input.targetDurationSec ?? 600;
  const factClaimMode=input.factClaimMode??'VERIFY_CLAIMS';
  const scriptMode=input.scriptMode??'NARRATION';
  const claims = input.dossier.claims.map((claim) => `[${claim.id}] ${claim.text} sources=${claim.sourceIds.join(',')}`).join('\n');
  const guidance = input.guidance?.trim()
    ? `\nProduction and owned-channel learning guidance (secondary to safety, factual accuracy when applicable, and the supplied viewer promise):\n${input.guidance.trim()}\nDo not use this guidance to invent real-world claims, exaggerate stakes, or add unsupported certainty.\n`
    : '';
  const system=factClaimMode==='CREATIVE_ORIGINAL'
    ? 'You are an original high-retention YouTube story and scene writer. Create materially original progression, readable actions, reactions, escalation and payoff. Fictional or generated events must never be presented as verified real-world evidence.'
    : factClaimMode==='DISTINGUISH_FACT_FROM_LEGEND'
      ? 'You are a high-retention YouTube story writer covering myths and mysteries. Clearly distinguish verified facts, reported claims, uncertainty and legend. Be visual, precise and never invent evidence.'
      : 'You are a high-retention YouTube documentary writer. Be precise, visual, original, source-grounded and concise. Do not invent facts. Build curiosity without misleading clickbait.';
  const modeGuidance=scriptMode==='VISUAL_ACTION'
    ? 'This is visual-first content with no synthesized narrator. The schema field named narration is a production beat/control field, not spoken voice-over: keep it concise and describe only the minimal context/action needed to drive visuals. The visualIntent field must carry the observable action and payoff.'
    : scriptMode==='DIALOGUE'
      ? 'This is dialogue-first content. Put character turns in the narration field using the required speaker serialization from production guidance; avoid default external narration.'
      : scriptMode==='HYBRID'
        ? 'Use dialogue and integrated narration only where each materially improves comprehension or pacing.'
        : 'Write speakable narration with natural sentence-length and emphasis variation.';
  const sourceGuidance=factClaimMode==='CREATIVE_ORIGINAL'
    ? 'Do not fabricate source IDs. Creative beats should normally use an empty sourceIds array unless the dossier actually supplies a source for a factual statement.'
    : `Use source IDs from the dossier for factual beats.${claims?`\nClaims:\n${claims}`:''}`;
  const response = await input.model.generateJson<VideoScript>({
    system,
    prompt: `Angle: ${input.angle.title}\nThesis: ${input.angle.thesis}\nViewer promise: ${input.angle.viewerPromise}\nTarget duration: ${targetDurationSec}s\nScript mode: ${scriptMode}\nFact mode: ${factClaimMode}\n${modeGuidance}\n${sourceGuidance}\n${guidance}\nCreate a beat-by-beat script with a concrete hook and payoff.`,
    schemaName: 'video_script',
    temperature: factClaimMode==='CREATIVE_ORIGINAL'?0.62:0.45,
  });
  return { ...response.value, language: input.language ?? response.value.language ?? 'en', targetDurationSec };
}
