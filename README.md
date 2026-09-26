# cv-forge

Build a job-specific CV from a structured profile — as a local build step, not a
browser round-trip and three downloads into `~/Documents`.

You keep your career as **data**: a library of individually-addressable bullets.
For each application, an engine ranks those bullets against the job description,
a writing pass sharpens only the ones it selected, and a renderer produces a
print-tuned one-page A4 PDF, an ATS-friendly `.docx`, and HTML. Every
application lands in its own dated folder, so the folder *is* the record of what
you sent and when.

The whole thing is built on one constraint: **tailoring may select and rephrase,
it may not invent.**

---

## The one rule

A plan references bullet **ids** from your profile. `render` resolves every id
before it draws anything and fails on the first one it doesn't recognise.

```
Error: Plan references 1 bullet id(s) not found in the profile: northwind.led-the-team.
render refuses to invent content — fix or remove these ids in the plan before rendering.
```

A rewrite may sharpen wording, lead with the outcome, or adopt the job
description's vocabulary **for something the bullet already says**. It cannot add
a metric, a technology or a scale that isn't in the original.

This matters because generating a fresh CV per application has a specific failure
mode: a plausible claim you never earned ends up on the page, you don't catch it,
and you're defending it in an interview. Constraining the output to *references*
makes that structural rather than a matter of care.

---

## Requirements

- **Node 22+**
- **Nix with flakes** — for Chromium, the Carlito font, pandoc and poppler,
  wired correctly. This is not optional for `render`; see [Why `nix develop`](#why-nix-develop).
- An **OpenRouter API key**, only if you want the `jev` engine. Everything else
  works without one.

## Install

```sh
git clone https://github.com/thinktanktom/cv-forge
cd cv-forge
npm ci
npm run build
```

Put `cv` on your PATH, or call it as `node dist/cli.js`:

```sh
npm link            # then: cv --help
```

## Set up your data repo

Your profile and applications live in a **separate, private** repo. This one
never contains personal data.

```sh
mkdir -p ~/dev/cv-data/{profile,applications}
cd ~/dev/cv-data && git init
export CV_DATA=~/dev/cv-data          # add this to your shell rc
```

`CV_DATA` points at the data repo **root**: the profile is read from
`$CV_DATA/profile`, and applications are written to `$CV_DATA/applications/`.

Copy `fixtures/persona/*.yaml` into `$CV_DATA/profile/` as a starting shape,
then replace the contents with your own. Five files:

| file | holds |
|---|---|
| `identity.yaml` | name, headline, email, links. **Never sent to a selection engine.** |
| `roles.yaml` | one entry per role, each with its bullet variants |
| `projects.yaml` | open source and side projects, same bullet shape |
| `skills.yaml` | labelled skill groups |
| `education.yaml` | degrees and certifications |

A role looks like this:

```yaml
- id: northwind
  company: Northwind Protocol
  title: Lead Smart Contract Engineer
  start: "2023-01"
  end: null                    # null means "present"
  location: Remote
  bullets:
    - id: northwind.staking
      text: Built and deployed a Solidity staking contract on Base, with a Foundry invariant suite.
      tags: [solidity, foundry, base, defi]
```

**Bullet ids are the primary key of the whole system.** Write them by hand, keep
them stable, and never reuse one — `cv validate` fails loudly on a duplicate
anywhere in the profile.

Write **more bullets than any one CV will use**. That's the point: a 50-bullet
library with several phrasings per achievement is what gives the selection step
something to choose between. If your library is the same length as your CV,
you've just added indirection.

```sh
cv validate
```

```
/home/you/dev/cv-data
  9 roles, 6 projects
  50 bullets, all ids unique
  9 skill groups, 3 education entries
```

---

## The workflow

### 1. Capture the job

```sh
cv new --company "Aave Labs" \
       --role "Staff Smart Contract Engineer" \
       --variant smart-contract \
       --file jd.md
```

Or pipe it: `pbpaste | cv new --company Aave --role "Staff SC Engineer"`.

Creates `$CV_DATA/applications/2026-09-25-aave-labs-staff-smart-contract-engineer/`
containing `jd.md` and `status.yaml`, and prints the slug.

### 2. Rank your bullets against it

```sh
cv select <slug> --engine jev --top 15
```

```
engine: jev   kept 15/50

  0.89  northwind.audit-remediation
  0.87  northwind.multichain
  0.85  northwind.oracle
  ...

borderline — the engine is effectively undecided, look at these yourself:
  0.61  northwind.staking (kept)
  0.56  openfoo.merged (cut)
```

Writes `shortlist.json`. **The shortlist is a ranking, not a verdict** — read the
borderline list and decide those yourself.

### 3. Rewrite what it selected

This step runs in a Claude Code session on your own plan, not through an API.
`cv reword <slug>` prints exactly what to hand it, and which files it reads and
writes:

```
/reword <slug>
```

It reads `shortlist.json`, `jd.md` and your profile, and writes `plan.json`:

```json
{
  "variant": "smart-contract",
  "headline": "Staff Smart Contract Engineer",
  "summary": "...",
  "skillGroups": ["Languages", "Contracts", "Chains", "Tooling", "Security"],
  "bullets": [
    { "id": "northwind.audit-remediation", "rewrite": "Led incident response on..." },
    { "id": "northwind.multichain" }
  ]
}
```

Omit `rewrite` when the original already reads well. A plan where every bullet is
rewritten usually means the rewriting is drifting.

`skillGroups` chooses which skill groups to print, in order. Omit it to print all
of them — but a full profile accumulates a group for every direction a career has
taken, and printing all of them on a specialised CV spends a third of the sheet
on skills the reader didn't ask about.

You can also write `plan.json` by hand. Nothing requires an LLM.

### 4. Render

```sh
nix develop --command cv render <slug>
```

```
.../cv.pdf
.../cv.docx
.../cv.html
```

### 5. Track it

```sh
cv status <slug> applied "sent via Greenhouse"
cv open <slug>          # opens the folder; the file picker starts where the file is
cv log
```

```
APPLIED     STAGE    COMPANY     ROLE                            VARIANT
2026-09-25  applied  Aave Labs   Staff Smart Contract Engineer   smart-contract
—           draft    Northwind   Protocol Engineer               smart-contract

applied: 1   draft: 1
```

Stages: `draft`, `applied`, `screen`, `interview`, `offer`, `rejected`,
`withdrawn`.

---

## Selection engines

All three satisfy one `Selector` contract and are held to the same golden-set
test, so `--engine` is a config change rather than a leap of faith.

| engine | needs | use it when |
|---|---|---|
| `jev` | `OPENROUTER_API_KEY` | default. `typesafe/jev-1.13` via OpenRouter — a *decision* model, not a generative one. ~$0.0001 per application. |
| `tag` | nothing | no network, no credentials. The floor that makes the others optional. |
| `claude` | a Claude Code session | in-session handoff when you'd rather not use an API at all. |

Measured on a 50-bullet profile against a staff Solidity job description, `jev`'s
top seven mapped almost one-to-one onto the posting's stated requirements, while
`tag` ranked a loan-design bullet second and cut multi-chain deployment entirely
— a headline requirement in that posting. `tag` is a floor, not a substitute.

`jev` sends **only bullet text and the job description**. `SelectInput` has no
identity field, so a name, phone number or address cannot reach the network by
accident. Widening that type is a privacy decision, not a refactor.

Shortlists are cut **by rank, never by an absolute score threshold**: the measured
margin near the cut line is 0.01–0.05 and the model's probabilities drift between
calls, so a fixed cutoff drops good bullets silently, and differently each run.

For the API shape — derived empirically, because OpenRouter's own reference 404s
— see [`docs/jev-api.md`](docs/jev-api.md).

To use `jev`:

```sh
mkdir -p ~/.config/cv-forge
printf 'OPENROUTER_API_KEY=sk-or-v1-...\n' > ~/.config/cv-forge/env
chmod 600 ~/.config/cv-forge/env
set -a; . ~/.config/cv-forge/env; set +a
```

---

## Templates

One template, two variants. The print CSS is carried **verbatim** from the
source designs and parameterised at exactly five points — accent colour, chip
colour, `@page` margin, `.edu` font size, and one optional density rule. It's
tuned to fit A4 in one page; `test/css-fidelity.test.ts` compares the rendered
`<style>` block byte-for-byte against the originals so nobody can quietly
"improve" it.

Add a variant in `src/variants.ts`.

---

## Why `nix develop`

Two NixOS-specific traps, both of which fail *silently*:

1. **npm-downloaded Playwright browsers will not run.** They're linked against
   FHS paths that don't exist. The devShell points `PLAYWRIGHT_BROWSERS_PATH` at
   the nixpkgs browsers instead. `playwright-core` in `package.json` must match
   the nixpkgs `playwright-driver` version, or the driver refuses to start.
2. **Chromium cannot see Carlito without `FONTCONFIG_FILE`,** even with the font
   in the closure. A missing font reflows the page and a one-page CV becomes two
   — with no error.

`render` asserts the font actually resolved before drawing, and checks the output
page count afterwards, so both traps fail loudly instead:

```
Error: Rendered CV is 2 pages; the template is tuned for 1. ... Drop a bullet or
shorten the summary in plan.json — do not restyle the template.
```

Node is deliberately **not** in the devShell: it currently builds from source on
nixos-unstable rather than substituting from cache. Use your system Node 22.

---

## Two repos on purpose

This repo is **the tool**. Your data lives elsewhere, and the separation is
enforced rather than intended:

- `profile/` and `applications/` are gitignored, so a stray `git add -A` can't
  put them here.
- `test/no-personal-data.test.ts` scans what git actually **tracks** — tracked is
  what a push publishes — for data-repo paths, credential-shaped strings and
  non-fixture email addresses. CI runs it on every push, and it's verified
  against deliberate violations of each kind, not just a clean tree.
- All tests run against `fixtures/persona/`, a fictional person, so you can clone
  this and actually run it.

---

## Development

```sh
npm run lint          # tsc --noEmit
npm test              # unit tests, no browser
nix develop --command npm run test:render     # real Chromium + pandoc + pdfinfo

CV_SOURCE_DESIGNS=~/Documents npm test        # opt-in: CSS byte-fidelity guard
```

`AGENTS.md` documents the invariants — the ones worth knowing before changing
anything are the identity-free `SelectInput`, the unknown-id rejection, the page
ceiling, and that only `render.ts` may name a DOM global.

## Licence

Not yet chosen — add a `LICENSE` file before relying on this being reusable.
