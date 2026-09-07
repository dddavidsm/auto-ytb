import type { TextModel } from '@auto-ytb/providers';
import type { StoryAngle } from '@auto-ytb/editorial';
import type { PackagingVariant } from './types.js';

export function scorePackaging(variant: Omit<PackagingVariant, 'score'>): PackagingVariant {
  const raw = variant.curiosity * 0.34 + variant.clarity * 0.26 + variant.credibility * 0.22 + variant.differentiation * 0.18;
  return { ...variant, score: Math.round(raw * 10) / 10 };
}

export async function generatePackaging(input: { angle: StoryAngle; model: TextModel; count?: number; guidance?: string }): Promise<PackagingVariant[]> {
  const guidance = input.guidance?.trim();
  const response = await input.model.generateJson<Array<Omit<PackagingVariant, 'score'>>>({
    system: 'You design honest, high-performing YouTube packaging. Titles and thumbnails must make one clear promise and must not overclaim beyond the supplied thesis. Historical performance guidance is advisory only and can never justify misleading, sensational, unsupported, or ambiguous claims.',
    prompt: `Create ${input.count ?? 3} materially different title + thumbnail hypotheses for:\n${input.angle.title}\n${input.angle.thesis}\nPromise: ${input.angle.viewerPromise}${guidance ? `\n\nOwned-channel performance guidance:\n${guidance}` : ''}`,
    schemaName: 'packaging_variants',
    temperature: 0.65,
  });
  return response.value.map(scorePackaging).sort((a, b) => b.score - a.score);
}
