import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Agent worktrees live under .claude/worktrees/. Without this, `npm test`
    // from the root walks into other branches' working trees and runs their
    // tests — including browser-dependent ones that are meant to be excluded
    // from the default run. It reports failures that have nothing to do with
    // the branch you are on.
    exclude: ['node_modules/**', 'dist/**', '.claude/**'],
  },
});
