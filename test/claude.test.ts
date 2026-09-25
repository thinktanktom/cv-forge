import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ClaudeSelector, SelectionHandoffRequired } from '../src/selectors/claude.js';
import type { Bullet, SelectInput } from '../src/types.js';

const bullets: Bullet[] = [
  { id: 'a.one', text: 'Did a solidity thing.', tags: ['solidity'] },
  { id: 'a.two', text: 'Did a react thing.', tags: ['react'] },
];
const input: SelectInput = { bullets, jd: 'Looking for a Solidity engineer.' };

let handoffDir: string;

beforeEach(() => {
  handoffDir = mkdtempSync(join(tmpdir(), 'cv-forge-handoff-test-'));
  process.env.CV_FORGE_HANDOFF_DIR = handoffDir;
});

afterEach(() => {
  delete process.env.CV_FORGE_HANDOFF_DIR;
  rmSync(handoffDir, { recursive: true, force: true });
});

describe('ClaudeSelector handoff', () => {
  it('writes a prompt file and throws SelectionHandoffRequired when no answer exists', async () => {
    const selector = new ClaudeSelector();

    await expect(selector.select(input)).rejects.toBeInstanceOf(SelectionHandoffRequired);

    let caught: SelectionHandoffRequired | undefined;
    try {
      await selector.select(input);
    } catch (err) {
      caught = err as SelectionHandoffRequired;
    }
    expect(caught).toBeDefined();
    expect(existsSync(caught!.promptPath)).toBe(true);
    expect(caught!.message).toContain(caught!.promptPath);
    expect(caught!.message).toContain(caught!.answerPath);

    const prompt = readFileSync(caught!.promptPath, 'utf8');
    expect(prompt).toContain(input.jd);
    expect(prompt).toContain('a.one');
    expect(prompt).toContain('a.two');
  });

  it('returns Scored[] once a valid answer file is written', async () => {
    const selector = new ClaudeSelector();

    let answerPath = '';
    try {
      await selector.select(input);
    } catch (err) {
      answerPath = (err as SelectionHandoffRequired).answerPath;
    }
    expect(answerPath).not.toBe('');

    writeFileSync(
      answerPath,
      JSON.stringify([
        { id: 'a.one', score: 0.9, confidence: 0.8 },
        { id: 'a.two', score: 0.1 },
      ]),
      'utf8',
    );

    const scored = await selector.select(input);
    expect(scored).toEqual([
      { id: 'a.one', score: 0.9, confidence: 0.8 },
      { id: 'a.two', score: 0.1 },
    ]);
  });

  it('rejects an answer file missing a bullet id', async () => {
    const selector = new ClaudeSelector();
    let answerPath = '';
    try {
      await selector.select(input);
    } catch (err) {
      answerPath = (err as SelectionHandoffRequired).answerPath;
    }

    writeFileSync(answerPath, JSON.stringify([{ id: 'a.one', score: 0.9 }]), 'utf8');

    await expect(selector.select(input)).rejects.toThrow(/missing a score/);
  });
});
