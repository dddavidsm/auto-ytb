import type { VideoScript, Scene } from './types.js';

export function planScenes(script: VideoScript, options: { targetSceneDurationSec?: number } = {}): Scene[] {
  const targetSceneDurationSec = Math.max(5, Math.min(16, options.targetSceneDurationSec ?? 10));
  const scenes: Scene[] = [];
  for (const beat of script.beats) {
    const sceneCount = Math.max(1, Math.ceil(beat.targetDurationSec / targetSceneDurationSec));
    const duration = beat.targetDurationSec / sceneCount;
    for (let index = 0; index < sceneCount; index += 1) {
      const highImpact = /impossible|conceptual|future|reconstruction|visualize|transformation|explosion|collapse|race|battle/i.test(beat.visualIntent) && index === 0;
      const kind: Scene['kind'] = highImpact ? 'ai_video' : 'ai_image';
      scenes.push({
        id: `${beat.id}-s${index + 1}`,
        startSec: Math.round((beat.startSec + index * duration) * 10) / 10,
        durationSec: Math.round(duration * 10) / 10,
        kind,
        instruction: highImpact
          ? `${beat.visualIntent}. Cinematic editorial visualization, coherent with the narration, no fabricated readable interface text.`
          : `${beat.visualIntent}. Premium editorial documentary still, visually specific, no fabricated readable text or fake UI labels.`,
        sourceIds: beat.sourceIds,
        generated: true,
      });
    }
  }
  return scenes;
}
