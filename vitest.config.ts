import { defineConfig } from 'vitest/config';

/**
 * Default config for `npm test` / CI: no browser, no `nix develop` needed.
 *
 * Two things are excluded deliberately:
 *   - `test/render/**` needs Chromium + Carlito; it runs via
 *     `vitest.render.config.ts` / `npm run test:render` instead.
 *   - `.claude/**` holds agent worktrees. Without excluding it, a run from the
 *     repo root walks into other branches' working trees and reports their
 *     failures as this branch's.
 */
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['test/render/**', 'node_modules/**', 'dist/**', '.claude/**'],
  },
});
