import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

/**
 * This repo is public. Personal data lives in a separate private repo, and the
 * only thing standing between the two is discipline — which is exactly the
 * thing that fails quietly at 1am. So it is a test, and CI runs it.
 *
 * It scans what git actually tracks, not the working tree, because that is
 * what a push publishes.
 */

function trackedFiles(): string[] {
  return execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
}

/** Paths that belong to the private data repo and must never appear here. */
const FORBIDDEN_PATHS = [
  /^profile\//,
  /^applications\//,
  /^\.claude\/worktrees\//,
  /(^|\/)\.env$/,
  /(^|\/)\.env\.(?!example)/,
  /\.(pem|key|p12|pfx)$/,
];

/**
 * Secret shapes. The `.env.example` placeholder is `sk-or-v1-...`, which does
 * not match: these require a run of real key characters.
 */
const SECRET_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ['OpenRouter API key', /sk-or-v1-[A-Za-z0-9]{24,}/],
  ['Anthropic API key', /sk-ant-[A-Za-z0-9_-]{24,}/],
  ['AWS access key id', /\bAKIA[0-9A-Z]{16}\b/],
  ['PEM private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
];

/**
 * Email addresses that are not obviously fixtures. `.invalid` is reserved by
 * RFC 2606 precisely for this, and the persona fixtures use it.
 */
const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const ALLOWED_EMAIL_SUFFIX = /\.(invalid|example)$|@example\.(com|org|net)$|@users\.noreply\.github\.com$|noreply@anthropic\.com$/;

function isProbablyText(path: string): boolean {
  try {
    if (statSync(path).size > 2_000_000) return false;
    const buf = readFileSync(path);
    return !buf.subarray(0, 4096).includes(0);
  } catch {
    return false;
  }
}

describe('nothing personal is tracked in this public repo', () => {
  const files = trackedFiles();

  it('tracks something at all (guards against a silently empty scan)', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('tracks no path belonging to the private data repo', () => {
    const offenders = files.filter((f) => FORBIDDEN_PATHS.some((re) => re.test(f)));
    expect(offenders).toEqual([]);
  });

  it('contains no credential-shaped string', () => {
    const offenders: string[] = [];
    for (const file of files) {
      if (!isProbablyText(file)) continue;
      const text = readFileSync(file, 'utf8');
      for (const [label, re] of SECRET_PATTERNS) {
        if (re.test(text)) offenders.push(`${file}: ${label}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('contains no real-looking email address', () => {
    const offenders: string[] = [];
    for (const file of files) {
      if (!isProbablyText(file)) continue;
      if (file === 'test/no-personal-data.test.ts') continue; // this file names the patterns
      for (const match of readFileSync(file, 'utf8').matchAll(EMAIL)) {
        const address = match[0];
        if (!ALLOWED_EMAIL_SUFFIX.test(address)) offenders.push(`${file}: ${address}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
