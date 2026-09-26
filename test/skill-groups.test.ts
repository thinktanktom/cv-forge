import { describe, it, expect } from 'vitest';
import { selectSkillGroups } from '../src/render.js';
import { minimalProfile, minimalPlan } from './fixtures.js';

const profile = minimalProfile([
  { label: 'Languages', items: ['Solidity'] },
  { label: 'Chains', items: ['Ethereum'] },
  { label: 'Machine learning', items: ['PyTorch'] },
]);

const labels = (skillGroups?: string[]) =>
  selectSkillGroups(minimalPlan(skillGroups ? { skillGroups } : {}), profile).map((g) => g.label);

describe('selectSkillGroups', () => {
  it('renders every group when the plan does not choose', () => {
    expect(labels()).toEqual(['Languages', 'Chains', 'Machine learning']);
  });

  it("keeps only the chosen groups, in the plan's order", () => {
    expect(labels(['Chains', 'Languages'])).toEqual(['Chains', 'Languages']);
  });

  it('throws on an unknown label, naming both the unknowns and the known groups', () => {
    // Silently dropping a section would lose the skills block off a CV with no
    // sign anything went wrong, so this fails loudly and says how to fix it.
    expect(() => labels(['Languages', 'Nope', 'Also nope']))
      .toThrow(/not in the profile: Nope, Also nope.*Known groups: Languages, Chains, Machine learning/s);
  });
});
