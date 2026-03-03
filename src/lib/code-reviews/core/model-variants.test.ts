import { getAvailableThinkingEfforts } from './model-variants';
import { getModelVariants } from '@/lib/providers/recommended-models';

// Representative model slug per provider that exercises each branch in both functions.
const REPRESENTATIVE_MODELS = [
  'anthropic/claude-sonnet-4-20250514',
  'openai/o3',
  'google/gemini-3-pro',
  'moonshotai/kimi-k2',
  'z-ai/glm5',
  'minimax/some-model', // no variants expected
];

describe('getAvailableThinkingEfforts stays in sync with getModelVariants', () => {
  for (const model of REPRESENTATIVE_MODELS) {
    it(`returns matching variant names for ${model}`, () => {
      const serverVariants = getModelVariants(model);
      const clientVariantNames = getAvailableThinkingEfforts(model);

      const expectedNames = serverVariants ? Object.keys(serverVariants) : [];
      expect(clientVariantNames).toEqual(expectedNames);
    });
  }
});
