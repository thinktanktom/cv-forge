/**
 * Core contracts. Everything else in this repo builds against these.
 *
 * The one structural invariant worth stating loudly: `SelectInput` carries no
 * identity. The selection leg is the only thing that leaves the machine, so it
 * is typed so that a name, phone number or address cannot reach it even by
 * accident. Widening this type is a privacy decision, not a refactor.
 */

export interface Bullet {
  /** Stable, human-authored, e.g. "northwind.audit-remediation". Never generated. */
  id: string;
  text: string;
  tags: string[];
}

export interface Role {
  id: string;
  company: string;
  title: string;
  start: string;
  end: string | null;
  location?: string;
  bullets: Bullet[];
}

export interface Project {
  id: string;
  name: string;
  url?: string;
  bullets: Bullet[];
}

export interface SkillGroup {
  label: string;
  items: string[];
}

export interface Education {
  institution: string;
  qualification: string;
  years: string;
  detail?: string;
}

export interface Link {
  label: string;
  url: string;
}

/** Never included in a SelectInput. See the note at the top of this file. */
export interface Identity {
  name: string;
  headline: string;
  email: string;
  phone?: string;
  location?: string;
  links: Link[];
}

export interface Profile {
  identity: Identity;
  roles: Role[];
  projects: Project[];
  skills: SkillGroup[];
  education: Education[];
}

/* ------------------------------------------------------------------ */
/* Selection                                                           */
/* ------------------------------------------------------------------ */

/** Deliberately identity-free — this is what crosses the network. */
export interface SelectInput {
  bullets: Bullet[];
  jd: string;
}

export interface Scored {
  id: string;
  /** 0..1. Comparable within one run; not calibrated across engines. */
  score: number;
  /** 0..1 where the engine reports one. */
  confidence?: number;
}

export interface Selector {
  readonly name: 'jev' | 'claude' | 'tag';
  select(input: SelectInput): Promise<Scored[]>;
}

export interface Shortlist {
  engine: Selector['name'];
  generatedAt: string;
  variant?: string;
  scored: Scored[];
}

/* ------------------------------------------------------------------ */
/* Tailoring plan — the thing render consumes                          */
/* ------------------------------------------------------------------ */

export interface PlanBullet {
  /** MUST resolve to a Bullet.id in the profile. render rejects it otherwise. */
  id: string;
  /** Optional sharpening of wording. May not introduce a new claim. */
  rewrite?: string;
}

export interface Plan {
  variant: string;
  headline: string;
  summary?: string;
  bullets: PlanBullet[];
  /**
   * Skill group labels to render, in this order. Omit to render every group.
   *
   * A full profile accumulates groups for every direction a career has taken.
   * Printing all of them on a specialised CV spends a third of the sheet on
   * skills the reader did not ask about, which is vertical space a bullet
   * could have used. Unknown labels are rejected by `render`, the same way
   * unknown bullet ids are.
   */
  skillGroups?: string[];
  coverLetter?: string;
}
