# Annotator-Connotator development handoff

Date: 2026-08-24

## Snapshot

This checkpoint completes Issues #4, #5, #7, and #9 on top of v0.7.0 (`5c6252e`).
Issues #6 and #8, plus application use of the new square logo, are intentionally deferred.

The completed scope is:

- Issue #4: loopback-only server defaults and restricted CORS for API-using endpoints.
- Issue #7: deterministic no-API tests and lightweight GitHub Actions CI.
- Issues #5 and #9: transparent long-form chunking, global result merging, progress reporting, cancellation, and explicit partial failures.

## Architecture

### Server and network safety

`lib/server-security.js` owns host and origin policy. The server binds to `127.0.0.1`
by default. Non-loopback binding requires `ALLOW_NETWORK=1`; intentional browser clients
from other origins must be listed in `CORS_ORIGINS`. Wildcard CORS is not used on the
POST endpoints that can incur API usage. The OpenAI key remains server-side in the
ignored `.env` file.

### Deterministic core

Reusable logic was extracted from `server.js` into testable modules:

- `lib/analysis-core.js`: limits, stable cache material, and API-usage aggregation.
- `lib/annotation-normalization.js`: exact offset repair, low-value filtering, and
  connotation normalization/deduplication.
- Existing `lib/annotation-selection.js`: global pedagogical ranking, overlap removal,
  and deterministic density prefixes from Issues #1 and #2.
- `lib/long-form.js`: chunk boundaries, pipeline state, global offset conversion, and
  merged result construction.

Default CI never calls OpenAI. Paid benchmark scripts remain separate.

### Long-form analysis

Texts over 18,000 characters use long-form mode. The current defaults are:

- target chunk size: 7,500 characters;
- neighboring read-only context: 320 characters on each side;
- local safety ceiling: 250,000 characters.

Chunks prefer paragraph and sentence boundaries, including Japanese punctuation without
following whitespace. Chunk text forms a contiguous, lossless partition of the source.
Context is supplied to the model but is excluded from the chunk's local offset space.

Each chunk discovers eligible annotation candidates at the same learner-level threshold.
After all chunks finish, ordinary annotations are converted to global source offsets,
deduplicated, globally ranked by pedagogical priority, and only then filtered by density.
Connotations remain precision-first and are deduplicated without forced density coverage.
Translations and slash-reading segments are merged in source order. Usage from primary,
repair, completion, and chunk calls is aggregated.

### Progress, cancellation, and failure behavior

For long-form requests, `/api/annotate` can return newline-delimited JSON events when
`streamProgress` is true. `client-analysis.js` reads progress, final-result, and error
events. The UI reports section-level progress rather than a fabricated percentage.

The cancel button aborts the browser request, signals the current provider call, and
prevents subsequent chunk calls. A provider request already in flight may still consume
tokens. Cancellation and partial failure are shown separately from ordinary API errors.
Neither state replaces the previous successful result, so the source remains editable
and the UI returns to a stable state.

## Files in this checkpoint

Production and UI:

- `server.js`
- `script.js`
- `client-analysis.js`
- `index.html`
- `languages.js`
- `styles.css`
- `lib/analysis-core.js`
- `lib/annotation-normalization.js`
- `lib/long-form.js`
- `lib/server-security.js`

Tests and automation:

- `.github/workflows/ci.yml`
- `scripts/check_syntax.mjs`
- `tests/analysis-core.test.js`
- `tests/annotation-normalization.test.js`
- `tests/client-analysis.test.js`
- `tests/long-form.test.js`
- `tests/server-security.test.js`
- `tests/fixtures/long-form-cases.json`
- `package.json`

Documentation:

- `README.md`
- this handoff file

## Verification at handoff

Run:

```powershell
npm.cmd run ci
```

Result on 2026-08-24:

- syntax: 9 files passed;
- deterministic tests: 34 passed, 0 failed;
- language catalog: 71 entries passed source and explanation screening;
- `git diff --check`: passed;
- local `/api/health`: HTTP 200 on port 4174.

No paid OpenAI benchmark or broad live multilingual run was performed for this checkpoint.
The deterministic suite covers English/Japanese inputs over 20,000 characters, compact
Japanese sentence boundaries, global offsets, duplicate/overlap handling, global density
ranking, cancellation, partial failure, streamed client events, and server origin policy.

## Deferred work

### Issue #6: persistent result cache

The server currently has a 20-minute in-memory candidate cache for density changes. This
is not reload persistence. Implement the issue using storage suitable for large results
(likely IndexedDB), an exact settings-aware key, schema/prompt version invalidation, and
an explicit force-refresh action. `lib/analysis-core.js` already provides
`cacheMaterial`, `stableSerialize`, and `CACHE_SCHEMA_VERSION`; the response's
`_selection` payload preserves the ranked candidate pool so density-only changes can be
reused without lowering the learner-level threshold or making another paid call.

### Issue #8: usage metadata UI

The server already returns aggregate metadata in `_api`, including model, analysis mode,
chunk count, cache/reuse state, and merged token usage. Repair and completion calls are
included when the provider reports them. Add a compact learner-facing presentation for
model, mode, input tokens, output tokens, and total tokens. Do not make another API call
or add a hard-coded pricing table solely for this display.

### Square logo

A square logo variant was generated during the task but has not been copied into the
repository or connected to the app. Treat logo integration as a separate UI change after
the infrastructure issues above, and verify favicon/header rendering at desktop and
mobile sizes.

## Important guardrails for the next session

- Preserve full-source discovery, global priority ordering, exact offsets, and nested
  ordinary-annotation density behavior from Issues #1 and #2.
- Do not lower learner difficulty thresholds or pad results with trivial annotations.
- Keep Connotator precision-first; do not force connotation coverage or nesting.
- Keep short-text analysis on the simple single-request path.
- Keep paid OpenAI tests out of `npm test` and default CI.
- Do not commit `.env` or expose its contents.
- Leave the existing untracked `output/` PDF untouched unless explicitly requested.
