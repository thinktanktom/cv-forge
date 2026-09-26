import { describe, expect, it } from 'vitest';

import { getVariant } from '../src/variants.js';

/*
 * The preset *values* are asserted in render.test.ts, against the emitted CSS
 * rather than the preset object — that proves they reach the sheet, which
 * reading them back off getVariant() never did. Only the failure path is
 * unique to this module.
 */
describe('getVariant', () => {
  it('throws a clear error for an unknown variant', () => {
    expect(() => getVariant('does-not-exist')).toThrowError(/Unknown variant "does-not-exist"/);
  });
});
