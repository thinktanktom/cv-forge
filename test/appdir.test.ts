import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  slugFor, createApplication, readStatus, advance, listSlugs, appDir, dataRoot,
} from '../src/appdir.js';
import { readLedger, formatLedger, summarise } from '../src/ledger.js';

let root: string;
const AT = new Date('2026-09-25T10:00:00Z');

beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'cvforge-')); });
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

describe('slugFor', () => {
  it('builds a dated, kebab-cased slug', () => {
    expect(slugFor('Aave', 'Staff Smart Contract Engineer', AT))
      .toBe('2026-09-25-aave-staff-smart-contract-engineer');
  });

  it('strips punctuation and collapses separators', () => {
    expect(slugFor('Foo & Bar, Inc.', 'Sr. Engineer (Remote)', AT))
      .toBe('2026-09-25-foo-bar-inc-sr-engineer-remote');
  });

  it('folds accents rather than dropping the word', () => {
    expect(slugFor('Açaí', 'Engenheiro', AT)).toBe('2026-09-25-acai-engenheiro');
  });

  it('refuses a slug it cannot build', () => {
    expect(() => slugFor('!!!', 'Engineer', AT)).toThrow(/Cannot build a slug/);
  });
});

describe('dataRoot', () => {
  it('names the variable and the reason when unset', () => {
    const prev = process.env['CV_DATA'];
    delete process.env['CV_DATA'];
    try {
      expect(() => dataRoot()).toThrow(/CV_DATA is not set/);
    } finally {
      if (prev !== undefined) process.env['CV_DATA'] = prev;
    }
  });
});

describe('createApplication', () => {
  it('writes jd.md and a draft status, and returns the slug', async () => {
    const { slug, dir } = await createApplication(
      { company: 'Aave', role: 'Staff SC Engineer', jd: '# Role\n\nSolidity.' }, root, AT,
    );
    expect(slug).toBe('2026-09-25-aave-staff-sc-engineer');
    expect(await readFile(join(dir, 'jd.md'), 'utf8')).toBe('# Role\n\nSolidity.\n');
    const status = await readStatus(dir);
    expect(status.stage).toBe('draft');
    expect(status.company).toBe('Aave');
    expect(status.history).toHaveLength(1);
  });

  it('refuses to clobber an existing application', async () => {
    const input = { company: 'Aave', role: 'Staff SC Engineer', jd: 'x' };
    await createApplication(input, root, AT);
    await expect(createApplication(input, root, AT)).rejects.toThrow(/already exists/);
  });

  it('omits optional fields rather than writing nulls', async () => {
    const { dir } = await createApplication({ company: 'A', role: 'B', jd: 'x' }, root, AT);
    const raw = await readFile(join(dir, 'status.yaml'), 'utf8');
    expect(raw).not.toMatch(/url/);
    expect(raw).not.toMatch(/variant/);
  });
});

describe('advance', () => {
  it('moves the stage and appends history', async () => {
    const { dir } = await createApplication({ company: 'A', role: 'B', jd: 'x' }, root, AT);
    const after = await advance(dir, 'applied', 'sent via Greenhouse', AT);
    expect(after.stage).toBe('applied');
    expect(after.history).toHaveLength(2);
    expect(after.history[1]?.note).toBe('sent via Greenhouse');
    expect((await readStatus(dir)).stage).toBe('applied');
  });
});

describe('readStatus', () => {
  it('rejects an unknown stage by name', async () => {
    const dir = appDir('2026-01-01-x-y', root);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'status.yaml'), 'company: X\nrole: Y\nstage: interviewing\n');
    await expect(readStatus(dir)).rejects.toThrow(/Unknown stage "interviewing"/);
  });
});

describe('ledger', () => {
  it('is empty before anything is created', async () => {
    expect(await readLedger(root)).toEqual([]);
    expect(formatLedger([])).toMatch(/No applications yet/);
  });

  it('reports applied date, stage and counts', async () => {
    const a = await createApplication({ company: 'Aave', role: 'Staff', jd: 'x', variant: 'smart-contract' }, root, AT);
    await advance(a.dir, 'applied', undefined, AT);
    await createApplication({ company: 'Zed', role: 'Dev', jd: 'x' }, root, new Date('2026-09-24T10:00:00Z'));

    const rows = await readLedger(root);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.slug).toBe('2026-09-25-aave-staff');   // newest first
    expect(rows[0]?.applied).toBe('2026-09-25');
    expect(rows[0]?.variant).toBe('smart-contract');
    expect(rows[1]?.applied).toBeNull();
    expect(summarise(rows)).toEqual({ applied: 1, draft: 1 });
  });

  it('surfaces a malformed folder without hiding the rest', async () => {
    await createApplication({ company: 'Good', role: 'Role', jd: 'x' }, root, AT);
    const broken = appDir('2026-09-20-broken-thing', root);
    await mkdir(broken, { recursive: true });
    await writeFile(join(broken, 'status.yaml'), 'nonsense: true\n');

    const rows = await readLedger(root);
    expect(rows).toHaveLength(2);
    expect(rows.some((r) => r.company === '(unreadable)')).toBe(true);
    expect(rows.some((r) => r.company === 'Good')).toBe(true);
  });

});
