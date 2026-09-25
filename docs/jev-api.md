# Jev (`typesafe/jev-1.13`) — request/response shape

OpenRouter's linked API reference for the Decisions endpoint 404s as of
2026-09-25, so this was derived empirically by probing the live endpoint.
**Verify before trusting; it is a beta surface and will move.**

Endpoint: `POST https://openrouter.ai/api/alpha/decisions`
Auth: `Authorization: Bearer $OPENROUTER_API_KEY`

## Request

```jsonc
{
  "model": "typesafe/jev-1.13",
  "state":  { /* string | record | array */ },
  "questions": {                 // a RECORD keyed by question id, NOT an array
    "<qid>": {
      "type": "noul" | "choice" | "score",   // discriminator
      "instructions": "...",                  // string | record | array
      // "criteria" is required for choice and score, absent for noul:
      //   choice -> record:  { "<option>": "what this option means", ... }
      //   score  -> array:   ["junior", "mid", "senior", "staff"]
      "criteria": {} 
    }
  },
  "provider": {                  // accepted on this surface (HTTP 200)
    "data_collection": "deny",
    "order": ["typesafe"],
    "allow_fallbacks": false
  }
}
```

## Response

```jsonc
{
  "model": "typesafe/jev-1.13-20260917",
  "answers": {
    "<qid>": { "type": "noul",   "noul": 0.72 },
    "<qid>": { "type": "choice", "choice": "smart-contract",
               "probabilities": { "smart-contract": 1, "full-stack": 0 }, "confidence": 1 },
    "<qid>": { "type": "score",  "score": 3,
               "legend": { "0": "junior", "1": "mid", "2": "senior", "3": "staff" },
               "probabilities": { "0": 0, "1": 0, "2": 0, "3": 1 }, "confidence": 1 }
  },
  "usage": { "input_tokens": 302, "output_tokens": 21, "cost": 0.000012684 },
  "id": "gen-dec-...",
  "provider": "TypeSafe"
}
```

## Measured behaviour (2026-09-25)

- **Batching works.** 50 `noul` questions in one round trip returned 50/50
  answers: 2311 input tokens, **$0.000097** total. No per-call question limit
  was hit at 50; the documented ceiling is the 32k context (state + questions).
- **It discriminates.** With a Solidity/audit JD, Solidity bullets scored
  0.92–0.97 and React bullets 0.24–0.42.
- **`provider.data_collection: "deny"` is accepted** — the request returns 200
  and still routes to TypeSafe. Acceptance is *not* proof of enforcement, and
  `order: ["typesafe"]` is a no-op since TypeSafe is the only provider serving
  Jev. Treat the type-level exclusion of identity (see `src/types.ts`) as the
  control that actually protects the data, not this flag.

## Gotchas

- `questions` is a record, not an array. An array returns
  `expected "record", received array`.
- The prompt field is `instructions`, not `question`.
- Probabilities vary slightly between calls — threshold on bands, not equality.
- Calibration is an aggregate property; any single answer can be wrong.
