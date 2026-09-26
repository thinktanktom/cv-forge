/**
 * Test-only helper: loads the fictional `fixtures/persona/` profile shared by
 * every test in this repo (unit and render). Never touches `$CV_DATA` or any
 * real personal data — see AGENTS.md rule 5.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from 'yaml';

import type { Education, Identity, Plan, Profile, Project, Role, SkillGroup } from '../src/types.js';

const personaDir = fileURLToPath(new URL('../fixtures/persona', import.meta.url));

function loadYaml<T>(file: string): T {
  const full = path.join(personaDir, file);
  return parse(readFileSync(full, 'utf8')) as T;
}

export function loadPersonaProfile(): Profile {
  return {
    identity: loadYaml<Identity>('identity.yaml'),
    roles: loadYaml<Role[]>('roles.yaml'),
    projects: loadYaml<Project[]>('projects.yaml'),
    skills: loadYaml<SkillGroup[]>('skills.yaml'),
    education: loadYaml<Education[]>('education.yaml'),
  };
}

/** A plan referencing only real fixture bullet ids — should always validate. */
export function samplePlan(): Plan {
  return {
    variant: 'smart-contract',
    headline: 'Smart Contract Engineer — Staking, Security, Multi-chain',
    summary: 'Solidity engineer focused on staking mechanics and audit remediation.',
    bullets: [
      { id: 'northwind.staking' },
      { id: 'northwind.audit-remediation', rewrite: 'Closed every finding across two audit rounds, including a critical reentrancy path in reward claims.' },
      { id: 'northwind.oracle' },
      { id: 'harbour.api' },
      { id: 'openfoo.merged' },
    ],
  };
}

/**
 * A deliberately tiny profile for tests that only care about one mechanism
 * (skill-group selection, CSS parameterisation) and would otherwise hand-roll
 * their own `Profile` literal. Pass `skills` to control the groups.
 */
export function minimalProfile(skills: SkillGroup[] = [{ label: 'Languages', items: ['Solidity'] }]): Profile {
  return {
    identity: { name: 'A B', headline: 'H', email: 'a@example.invalid', links: [] },
    roles: [
      {
        id: 'r', company: 'C', title: 'T', start: '2020-01', end: null,
        bullets: [{ id: 'r.a', text: 'Did a thing.', tags: [] }],
      },
    ],
    projects: [],
    skills,
    education: [{ institution: 'I', qualification: 'Q', years: '2016' }],
  };
}

/** A plan over `minimalProfile`, for the same reason. */
export function minimalPlan(overrides: Partial<Plan> = {}): Plan {
  return { variant: 'smart-contract', headline: 'X', bullets: [{ id: 'r.a' }], ...overrides };
}
