---
name: reword
description: Turn a cv-forge shortlist into a plan.json — select bullets from the profile and sharpen their wording for one job description. Use when the user runs /reword <slug> or asks to tailor a CV for an application.
---

# /reword <slug>

The generative leg of the pipeline. `cv select` has already ranked the bullets;
this step decides the final set and sharpens the wording. It runs here, on the
user's Claude plan, rather than through an API.

## Read

- `$CV_DATA/applications/<slug>/jd.md` — the job description
- `$CV_DATA/applications/<slug>/shortlist.json` — ranked ids with scores,
  plus a `borderline` list where the engine was undecided
- `$CV_DATA/profile/roles.yaml` and `projects.yaml` — the bullet library

## Write

`$CV_DATA/applications/<slug>/plan.json`:

```json
{
  "variant": "smart-contract",
  "headline": "Staff Smart Contract Engineer",
  "summary": "...",
  "bullets": [
    { "id": "bankx.incident-response", "rewrite": "..." },
    { "id": "bankx.multichain-deploy" }
  ],
  "coverLetter": "optional"
}
```

## The rule that matters

**Select and rephrase. Never invent.**

- Every `id` must already exist in the profile. `cv render` rejects unknown ids
  before it draws anything, so a fabricated id fails the build rather than
  reaching a PDF — but do not rely on that as a safety net. Do not guess ids.
- A `rewrite` may sharpen wording, lead with the outcome, or adopt the job
  description's vocabulary **for something the bullet already says**. It may
  not add a metric, a technology, a scale or a claim that is not in the
  original bullet text.
- Omit `rewrite` entirely when the original already reads well. A plan where
  every bullet is rewritten usually means the rewriting is drifting.

## Judgement

- **Treat the shortlist as a ranking, not a verdict.** Scores are calibrated
  in aggregate; any single one can be wrong, and the margin near the cut is
  thin. Read the `borderline` list properly and decide those yourself.
- **Order bullets for the reader, not by score.** Within a role, lead with the
  bullet that best answers the job description.
- **Keep it to one page.** That is what the template is tuned for. Around
  12-15 bullets total is the working range; if the summary is long, take a
  bullet out rather than letting it reflow to two pages.
- **Do not keyword-stuff.** The reader is a person. A bullet rewritten to
  contain every phrase from the job description reads worse, not better.

## Then

Tell the user to run `cv render <slug>`, and mention anything you dropped that
they might have expected to see.
