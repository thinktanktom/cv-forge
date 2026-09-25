import { describe, it, expect } from 'vitest';
import { selectSkillGroups } from '../src/render.js';
import type { Plan, Profile } from '../src/types.js';

const profile = {
  identity: { name: 'A', headline: 'H', email: 'a@example.invalid', links: [] },
  roles: [], projects: [], education: [],
  skills: [
    { label: 'Languages', items: ['Solidity'] },
    { label: 'Chains', items: ['Ethereum'] },
    { label: 'Machine learning', items: ['PyTorch'] },
  ],
} satisfies Profile;

const plan = (skillGroups?: string[]): Plan => ({
  variant: 'smart-contract',
  headline: 'X',
  bullets: [],
  ...(skillGroups ? { skillGroups } : {}),
});

describe('selectSkillGroups', () => {
  it('renders every group when the plan does not choose', () => {
    expect(selectSkillGroups(plan(), profile).map((g) => g.label))
      .toEqual(['Languages', 'Chains', 'Machine learning']);
  });

  it('keeps only the chosen groups, so a specialised CV does not spend the sheet on irrelevant skills', () => {
    expect(selectSkillGroups(plan(['Languages', 'Chains']), profile).map((g) => g.label))
      .toEqual(['Languages', 'Chains']);
  });

  it("honours the plan's order, not the profile's", () => {
    expect(selectSkillGroups(plan(['Chains', 'Languages']), profile).map((g) => g.label))
      .toEqual(['Chains', 'Languages']);
  });

  it('throws on an unknown label rather than silently dropping a section', () => {
    expect(() => selectSkillGroups(plan(['Languages', 'Nope', 'Also nope']), profile))
      .toThrow(/not in the profile: Nope, Also nope/);
  });

  it('names the known groups in the error so the fix is obvious', () => {
    expect(() => selectSkillGroups(plan(['Nope']), profile))
      .toThrow(/Known groups: Languages, Chains, Machine learning/);
  });

  it('renders an empty skills block when the plan asks for none', () => {
    expect(selectSkillGroups(plan([]), profile)).toEqual([]);
  });
});
