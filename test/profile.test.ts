import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { allBullets, loadProfile } from '../src/profile.js';

const FIXTURES_DIR = fileURLToPath(new URL('../fixtures/persona', import.meta.url));

const VALID_IDENTITY = `
name: Test Person
headline: Test Headline
email: test@example.invalid
links: []
`;

const VALID_PROJECTS = `
- id: proj
  name: A Project
  bullets: []
`;

const VALID_SKILLS = `
- { label: Languages, items: [TypeScript] }
`;

const VALID_EDUCATION = `
- institution: Test Institute
  qualification: BSc
  years: "2020"
`;

function writeTempProfile(overrides: Partial<Record<'identity' | 'roles' | 'projects' | 'skills' | 'education', string>>): string {
  const dir = mkdtempSync(join(tmpdir(), 'cv-forge-profile-test-'));
  writeFileSync(join(dir, 'identity.yaml'), overrides.identity ?? VALID_IDENTITY, 'utf8');
  writeFileSync(join(dir, 'roles.yaml'), overrides.roles ?? '[]', 'utf8');
  writeFileSync(join(dir, 'projects.yaml'), overrides.projects ?? VALID_PROJECTS, 'utf8');
  writeFileSync(join(dir, 'skills.yaml'), overrides.skills ?? VALID_SKILLS, 'utf8');
  writeFileSync(join(dir, 'education.yaml'), overrides.education ?? VALID_EDUCATION, 'utf8');
  return dir;
}

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe('loadProfile', () => {
  it('loads the persona fixture', () => {
    const profile = loadProfile(FIXTURES_DIR);

    expect(profile.identity.name).toBe('Alex Rivera');
    expect(profile.roles.map((r) => r.id).sort()).toEqual(['harbour', 'northwind']);
    expect(profile.projects.map((p) => p.id)).toEqual(['openfoo']);

    const bullets = allBullets(profile);
    const ids = bullets.map((b) => b.id).sort();
    expect(ids).toEqual(
      [
        'northwind.staking',
        'northwind.audit-remediation',
        'northwind.multichain',
        'northwind.oracle',
        'harbour.dashboard',
        'harbour.api',
        'harbour.ci',
        'openfoo.merged',
      ].sort(),
    );
  });

  it('reads <CV_DATA>/profile when CV_DATA is set, ignoring the explicit path', () => {
    /*
     * CV_DATA points at the data REPO ROOT, not at the profile directory:
     * appdir.ts reads <CV_DATA>/applications, so one variable has to mean one
     * thing. This asserts the join rather than the old bare-path behaviour.
     */
    const root = mkdtempSync(join(tmpdir(), 'cvdata-'));
    mkdirSync(join(root, 'profile'), { recursive: true });
    for (const f of ['identity.yaml','roles.yaml','projects.yaml','skills.yaml','education.yaml']) {
      copyFileSync(join(FIXTURES_DIR, f), join(root, 'profile', f));
    }
    const original = process.env.CV_DATA;
    process.env.CV_DATA = root;
    try {
      const profile = loadProfile('/does/not/exist');
      expect(profile.identity.name).toBe('Alex Rivera');
    } finally {
      if (original === undefined) {
        delete process.env.CV_DATA;
      } else {
        process.env.CV_DATA = original;
      }
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('points at the profile subdirectory in its error when CV_DATA is wrong', () => {
    const original = process.env.CV_DATA;
    process.env.CV_DATA = '/does/not/exist';
    try {
      expect(() => loadProfile()).toThrow(/\/does\/not\/exist\/profile\/identity\.yaml/);
    } finally {
      if (original === undefined) {
        delete process.env.CV_DATA;
      } else {
        process.env.CV_DATA = original;
      }
    }
  });

  it('rejects duplicate bullet ids across roles', () => {
    const dir = writeTempProfile({
      roles: `
- id: role-a
  company: A
  title: Eng
  start: "2020-01"
  end: null
  bullets:
    - id: dup.id
      text: First occurrence.
      tags: []
- id: role-b
  company: B
  title: Eng
  start: "2021-01"
  end: null
  bullets:
    - id: dup.id
      text: Second occurrence.
      tags: []
`,
    });
    tempDirs.push(dir);

    expect(() => loadProfile(dir)).toThrow(/Duplicate bullet id/);
    expect(() => loadProfile(dir)).toThrow(/dup\.id/);
  });

  it('rejects a duplicate bullet id shared between a role and a project', () => {
    const dir = writeTempProfile({
      roles: `
- id: role-a
  company: A
  title: Eng
  start: "2020-01"
  end: null
  bullets:
    - id: shared.id
      text: In a role.
      tags: []
`,
      projects: `
- id: proj-a
  name: Project A
  bullets:
    - id: shared.id
      text: In a project.
      tags: []
`,
    });
    tempDirs.push(dir);

    expect(() => loadProfile(dir)).toThrow(/Duplicate bullet id/);
  });

  it('names the file and the offending path on invalid data', () => {
    const dir = writeTempProfile({
      roles: `
- id: role-a
  company: A
  title: Eng
  start: "2020-01"
  end: null
  bullets:
    - text: Missing an id.
      tags: []
`,
    });
    tempDirs.push(dir);

    try {
      loadProfile(dir);
      expect.unreachable('loadProfile should have thrown on invalid roles.yaml');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      expect(message).toContain('roles.yaml');
      expect(message).toContain('bullets.0.id');
    }
  });
});
