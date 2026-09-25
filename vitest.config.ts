import { defineConfig } from 'vitest/config';

/**
 * Default config for `npm test` / CI: no browser, no `nix develop` needed.
 * Anything under `test/render/` requires Chromium + Carlito and is covered
 * by `vitest.render.config.ts` / `npm run test:render` instead.
 */
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['test/render/**', 'node_modules/**'],
  },
});
