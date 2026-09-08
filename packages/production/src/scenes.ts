import type { VideoScript, Scene, ScriptBeat } from './types.js';
import { buildVisualSourceRefs, type SourceLike } from './source-visuals.js';

const clamp=(value:number,min=0,max=100)=>Math.max(min,Math.min(max,value));

function scoreVisualValue(beat: ScriptBeat, index: number): number {
  const purposeBoost: Record<ScriptBeat['purpose'], number> = { hook:28, setup:8, evidence:14, escalation:20, reveal:30, payoff:24, cta:4 };
  const retentionBoost = beat.retentionDevice && beat.retentionDevice !== 'none' ? 12 : 0;
  const intentBoost = /collapse|race|battle|transformation|future|reconstruction|explosion|breakthrough|impossible|visualize/i.test(beat.visualIntent) ? 18 : 0;
  return clamp(35 + purposeBoost[beat.purpose] + retentionBoost + intentBoost - index * 5);
}

function hasQuantitativeIntent(beat: ScriptBeat): boolean {
  return /\b(percent|percentage|billion|million|growth|decline|revenue|cost|market|share|rate|timeline|year|years|data|chart|graph|compare|comparison)\b/i.test(`${beat.narration} ${beat.visualIntent}`) || /\d/.test(beat.narration);
}

function sourceAttribution(sourceRefs: Scene['sourceRefs']): string {
  const ref=sourceRefs?.[0];
  if(!ref) return 'Source: research dossier';
  let domain='';
  try { domain=ref.url?new URL(ref.url).hostname.replace(/^www\./,''):''; } catch { domain=''; }
  return `Source: ${ref.title || domain || ref.sourceType || ref.sourceId}${domain && ref.title ? ` · ${domain}` : ''}`;
}

function chooseSceneKind(beat: ScriptBeat, index: number, visualValue: number, hasSourceRefs: boolean): Pick<Scene,'kind'|'generated'|'costTier'|'selectionReason'> {
  if (hasQuantitativeIntent(beat) && (beat.purpose === 'evidence' || beat.purpose === 'setup')) {
    return { kind:'chart', generated:false, costTier:'free', selectionReason:'Quantitative/evidence beat is clearer and cheaper as a procedural chart.' };
  }
  if (hasSourceRefs && (beat.purpose === 'evidence' || beat.purpose === 'setup') && index === 0) {
    return { kind:'source_card', generated:false, costTier:'free', selectionReason:'Evidence beat has traceable research sources; render an attributed transformed source card instead of generic AI media.' };
  }
  if (index > 0 || beat.purpose === 'cta' || beat.purpose === 'setup') {
    return { kind:'motion_graphic', generated:false, costTier:'free', selectionReason:'Supporting beat does not justify generative-media spend; use deterministic motion graphics.' };
  }
  if (visualValue >= 86) {
    return { kind:'ai_video', generated:true, costTier:'premium', selectionReason:'High-value hook/reveal/payoff moment justifies premium generative video.' };
  }
  if (visualValue >= 64) {
    return { kind:'ai_image', generated:true, costTier:'low', selectionReason:'Narratively important moment benefits from a specific editorial image without premium video cost.' };
  }
  return { kind:'motion_graphic', generated:false, costTier:'free', selectionReason:'Procedural visual provides sufficient clarity at near-zero marginal media cost.' };
}

export function planScenes(script: VideoScript, options: { targetSceneDurationSec?: number; sources?: SourceLike[] } = {}): Scene[] {
  const targetSceneDurationSec = Math.max(2.5, Math.min(16, options.targetSceneDurationSec ?? 10));
  const scenes: Scene[] = [];
  for (const beat of script.beats) {
    const sceneCount = Math.max(1, Math.ceil(beat.targetDurationSec / targetSceneDurationSec));
    const duration = beat.targetDurationSec / sceneCount;
    const sourceRefs = buildVisualSourceRefs(beat.sourceIds, options.sources ?? []);
    for (let index = 0; index < sceneCount; index += 1) {
      const visualValue = scoreVisualValue(beat,index);
      const choice = chooseSceneKind(beat,index,visualValue,sourceRefs.length>0);
      const procedural = choice.kind === 'chart' || choice.kind === 'motion_graphic' || choice.kind === 'source_card';
      scenes.push({
        id: `${beat.id}-s${index + 1}`,
        startSec: Math.round((beat.startSec + index * duration) * 10) / 10,
        durationSec: Math.round(duration * 10) / 10,
        ...choice,
        visualValue,
        instruction: procedural
          ? `${beat.onScreenText ?? beat.visualIntent}. ${choice.kind === 'chart' ? 'Evidence-led editorial chart/card with restrained labels and clear hierarchy.' : choice.kind === 'source_card' ? `Attributed evidence card. Transform and summarize the source; do not reproduce a webpage verbatim. ${sourceAttribution(sourceRefs)}` : 'Editorial motion-graphic card with strong hierarchy, simple geometry and no decorative clutter.'}`
          : choice.kind === 'ai_video'
            ? `${beat.visualIntent}. Cinematic editorial visualization, coherent with the narration, no fabricated readable interface text.`
            : `${beat.visualIntent}. Premium editorial documentary still, visually specific, no fabricated readable text or fake UI labels.`,
        sourceIds: beat.sourceIds,
        sourceRefs: sourceRefs.length ? sourceRefs : undefined,
      });
    }
  }
  return scenes;
}
