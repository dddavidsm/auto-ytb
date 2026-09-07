import type { VideoScript, Scene, ScriptBeat } from './types.js';

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

function chooseSceneKind(beat: ScriptBeat, index: number, visualValue: number): Pick<Scene,'kind'|'generated'|'costTier'|'selectionReason'> {
  if (hasQuantitativeIntent(beat) && (beat.purpose === 'evidence' || beat.purpose === 'setup')) {
    return { kind:'chart', generated:false, costTier:'free', selectionReason:'Quantitative/evidence beat is clearer and cheaper as a procedural chart.' };
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

export function planScenes(script: VideoScript, options: { targetSceneDurationSec?: number } = {}): Scene[] {
  const targetSceneDurationSec = Math.max(2.5, Math.min(16, options.targetSceneDurationSec ?? 10));
  const scenes: Scene[] = [];
  for (const beat of script.beats) {
    const sceneCount = Math.max(1, Math.ceil(beat.targetDurationSec / targetSceneDurationSec));
    const duration = beat.targetDurationSec / sceneCount;
    for (let index = 0; index < sceneCount; index += 1) {
      const visualValue = scoreVisualValue(beat,index);
      const choice = chooseSceneKind(beat,index,visualValue);
      const procedural = choice.kind === 'chart' || choice.kind === 'motion_graphic';
      scenes.push({
        id: `${beat.id}-s${index + 1}`,
        startSec: Math.round((beat.startSec + index * duration) * 10) / 10,
        durationSec: Math.round(duration * 10) / 10,
        ...choice,
        visualValue,
        instruction: procedural
          ? `${beat.onScreenText ?? beat.visualIntent}. ${choice.kind === 'chart' ? 'Evidence-led editorial chart/card with restrained labels and clear hierarchy.' : 'Editorial motion-graphic card with strong hierarchy, simple geometry and no decorative clutter.'}`
          : choice.kind === 'ai_video'
            ? `${beat.visualIntent}. Cinematic editorial visualization, coherent with the narration, no fabricated readable interface text.`
            : `${beat.visualIntent}. Premium editorial documentary still, visually specific, no fabricated readable text or fake UI labels.`,
        sourceIds: beat.sourceIds,
      });
    }
  }
  return scenes;
}
