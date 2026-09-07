import type { VideoScript, Scene } from './types.js';

export function planScenes(script: VideoScript): Scene[] {
  const scenes: Scene[] = [];
  for (const beat of script.beats) {
    const sceneCount = Math.max(1, Math.ceil(beat.targetDurationSec / 7));
    const duration = beat.targetDurationSec / sceneCount;
    for (let index = 0; index < sceneCount; index += 1) {
      const generated = /impossible|conceptual|future|reconstruction|visualize/i.test(beat.visualIntent) && index === 0;
      const kind: Scene['kind'] = generated ? 'ai_video' : beat.sourceIds.length ? (index % 3 === 0 ? 'screenshot' : 'motion_graphic') : 'motion_graphic';
      scenes.push({
        id: `${beat.id}-s${index + 1}`,
        startSec: Math.round((beat.startSec + index * duration) * 10) / 10,
        durationSec: Math.round(duration * 10) / 10,
        kind,
        instruction: beat.visualIntent,
        sourceIds: beat.sourceIds,
        generated,
      });
    }
  }
  return scenes;
}
