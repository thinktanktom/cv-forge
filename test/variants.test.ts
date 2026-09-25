import { describe, expect, it } from 'vitest';

import { getVariant, knownVariants } from '../src/variants.js';

describe('variant presets', () => {
  it('exposes exactly the two known presets', () => {
    expect(knownVariants()).toEqual(['smart-contract', 'full-stack']);
  });

  it('smart-contract preset matches the source design', () => {
    const v = getVariant('smart-contract');
    expect(v.accent).toBe('#0f5c5a');
    expect(v.chip).toBe('#eef3f3');
    expect(v.pageMargin).toBe('10.5mm 12mm');
    expect(v.eduFontSize).toBe('8.6pt');
    expect(v.lastChildHeadingRule).toBe(false);
  });

  it('full-stack preset matches the source design', () => {
    const v = getVariant('full-stack');
    expect(v.accent).toBe('#1d4ed8');
    expect(v.chip).toBe('#eef2fb');
    expect(v.pageMargin).toBe('10.5mm 12mm 9mm');
    expect(v.eduFontSize).toBe('8.4pt');
    expect(v.lastChildHeadingRule).toBe(true);
  });

  it('throws a clear error for an unknown variant', () => {
    expect(() => getVariant('does-not-exist')).toThrowError(/Unknown variant "does-not-exist"/);
  });
});
