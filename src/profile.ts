/**
 * Loads and validates a `Profile` (see `src/types.ts`) from a directory of
 * YAML files: `identity.yaml`, `roles.yaml`, `projects.yaml`, `skills.yaml`,
 * `education.yaml`.
 *
 * The profile directory is `<CV_DATA>/profile` when that env var is set;
 * otherwise the caller must pass an explicit path (tests pass
 * `fixtures/persona`). CV_DATA points at the *data repo root*, matching
 * `appdir.ts`, which reads `<CV_DATA>/applications` — one variable, one
 * meaning.
 *
 * Bullet ids are the primary key of the whole system (see the comment on
 * `Bullet.id` in `types.ts`), so this module fails loudly — throws, does not
 * warn — the moment the same id appears twice anywhere in the profile.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import type {
  Bullet,
  Education,
  Identity,
  Link,
  Profile,
  Project,
  Role,
  SkillGroup,
} from './types.js';

/* ------------------------------------------------------------------ */
/* Schemas                                                             */
/* ------------------------------------------------------------------ */
/*
 * These intentionally mirror the shapes in types.ts field-for-field rather
 * than trying to force `satisfies z.ZodType<X>` on them: zod's `.optional()`
 * infers `T | undefined` for the property value, which is not the same type
 * as an `exactOptionalPropertyTypes`-checked `field?: T` once you compare
 * structurally. The `to*` conversion functions below do the actual mapping
 * into the exact `types.ts` shapes, omitting keys instead of setting them to
 * `undefined`.
 */

const bulletSchema = z.object({
  id: z.string().min(1, 'bullet id must not be empty'),
  text: z.string().min(1, 'bullet text must not be empty'),
  tags: z.array(z.string()),
});

const roleSchema = z.object({
  id: z.string().min(1),
  company: z.string().min(1),
  title: z.string().min(1),
  start: z.string().min(1),
  end: z.string().nullable(),
  location: z.string().optional(),
  bullets: z.array(bulletSchema),
});

const projectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  url: z.string().optional(),
  bullets: z.array(bulletSchema),
});

const skillGroupSchema = z.object({
  label: z.string().min(1),
  items: z.array(z.string()),
});

const educationSchema = z.object({
  institution: z.string().min(1),
  qualification: z.string().min(1),
  years: z.string().min(1),
  detail: z.string().optional(),
});

const linkSchema = z.object({
  label: z.string().min(1),
  url: z.string().min(1),
});

const identitySchema = z.object({
  name: z.string().min(1),
  headline: z.string().min(1),
  email: z.string().min(1),
  phone: z.string().optional(),
  location: z.string().optional(),
  links: z.array(linkSchema),
});

/* ------------------------------------------------------------------ */
/* File loading                                                        */
/* ------------------------------------------------------------------ */

const PROFILE_FILES = {
  identity: 'identity.yaml',
  roles: 'roles.yaml',
  projects: 'projects.yaml',
  skills: 'skills.yaml',
  education: 'education.yaml',
} as const;

/**
 * Resolve the profile directory: `CV_DATA` wins when set (the normal path
 * for real usage); otherwise fall back to the explicit path the caller gave
 * (the path tests take, pointing at `fixtures/persona`).
 */
export function resolveProfileDir(explicitPath?: string): string {
  const fromEnv = process.env.CV_DATA;
  if (fromEnv !== undefined && fromEnv.trim() !== '') {
    return join(fromEnv, 'profile');
  }
  if (explicitPath !== undefined && explicitPath.trim() !== '') {
    return explicitPath;
  }
  throw new Error(
    'No profile directory available: set CV_DATA in the environment or pass an explicit path.',
  );
}

function readYamlFile(dir: string, filename: string): unknown {
  const filePath = join(dir, filename);
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not read profile file "${filename}" (${filePath}): ${reason}`);
  }
  try {
    return parseYaml(raw);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not parse YAML in "${filename}": ${reason}`);
  }
}

function parseProfileFile<T>(dir: string, filename: string, schema: z.ZodType<T>): T {
  const data = readYamlFile(dir, filename);
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
        return `  ${filename}#${path}: ${issue.message}`;
      })
      .join('\n');
    throw new Error(`Invalid profile data in "${filename}":\n${details}`);
  }
  return result.data;
}

/* ------------------------------------------------------------------ */
/* Conversion into exact types.ts shapes                               */
/* ------------------------------------------------------------------ */

function toRole(r: z.infer<typeof roleSchema>): Role {
  return {
    id: r.id,
    company: r.company,
    title: r.title,
    start: r.start,
    end: r.end,
    bullets: r.bullets,
    ...(r.location !== undefined ? { location: r.location } : {}),
  };
}

function toProject(p: z.infer<typeof projectSchema>): Project {
  return {
    id: p.id,
    name: p.name,
    bullets: p.bullets,
    ...(p.url !== undefined ? { url: p.url } : {}),
  };
}

function toEducation(e: z.infer<typeof educationSchema>): Education {
  return {
    institution: e.institution,
    qualification: e.qualification,
    years: e.years,
    ...(e.detail !== undefined ? { detail: e.detail } : {}),
  };
}

function toIdentity(i: z.infer<typeof identitySchema>): Identity {
  const links: Link[] = i.links;
  return {
    name: i.name,
    headline: i.headline,
    email: i.email,
    links,
    ...(i.phone !== undefined ? { phone: i.phone } : {}),
    ...(i.location !== undefined ? { location: i.location } : {}),
  };
}

function toSkillGroup(s: z.infer<typeof skillGroupSchema>): SkillGroup {
  return { label: s.label, items: s.items };
}

/* ------------------------------------------------------------------ */
/* Duplicate bullet id guard                                           */
/* ------------------------------------------------------------------ */

function assertUniqueBulletIds(profile: Profile): void {
  const locations = new Map<string, string[]>();

  const record = (id: string, where: string): void => {
    const existing = locations.get(id);
    if (existing) {
      existing.push(where);
    } else {
      locations.set(id, [where]);
    }
  };

  for (const role of profile.roles) {
    for (const bullet of role.bullets) {
      record(bullet.id, `${PROFILE_FILES.roles} (role "${role.id}")`);
    }
  }
  for (const project of profile.projects) {
    for (const bullet of project.bullets) {
      record(bullet.id, `${PROFILE_FILES.projects} (project "${project.id}")`);
    }
  }

  const duplicates = [...locations.entries()].filter(([, where]) => where.length > 1);
  if (duplicates.length > 0) {
    const detail = duplicates
      .map(([id, where]) => `  "${id}" appears in: ${where.join(', ')}`)
      .join('\n');
    throw new Error(
      `Duplicate bullet id(s) found — bullet ids are the primary key of the whole system and must be unique across the entire profile:\n${detail}`,
    );
  }
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export function loadProfile(explicitPath?: string): Profile {
  const dir = resolveProfileDir(explicitPath);

  const identityRaw = parseProfileFile(dir, PROFILE_FILES.identity, identitySchema);
  const rolesRaw = parseProfileFile(dir, PROFILE_FILES.roles, z.array(roleSchema));
  const projectsRaw = parseProfileFile(dir, PROFILE_FILES.projects, z.array(projectSchema));
  const skillsRaw = parseProfileFile(dir, PROFILE_FILES.skills, z.array(skillGroupSchema));
  const educationRaw = parseProfileFile(dir, PROFILE_FILES.education, z.array(educationSchema));

  const profile: Profile = {
    identity: toIdentity(identityRaw),
    roles: rolesRaw.map(toRole),
    projects: projectsRaw.map(toProject),
    skills: skillsRaw.map(toSkillGroup),
    education: educationRaw.map(toEducation),
  };

  assertUniqueBulletIds(profile);

  return profile;
}

/** Flatten role + project bullets into one list, in profile order. */
export function allBullets(profile: Profile): Bullet[] {
  return [
    ...profile.roles.flatMap((role) => role.bullets),
    ...profile.projects.flatMap((project) => project.bullets),
  ];
}
