import { defineConfig } from 'vitest/config';

/**
 * Fidelity tests: launches Chromium via playwright-core and shells out to
 * pandoc/pdfinfo. Requires `nix develop` (chromium + Carlito + poppler-utils
 * + pandoc, correctly wired — see flake.nix). Never wired into `npm test` or
 * CI; run explicitly via `npm run test:render`.
 */
export default defineConfig({
  test: {
    include: ['test/render/**/*.test.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
