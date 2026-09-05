# Annotator-Connotator

Turn any text into language-learning material with annotations, translations, and connotation-aware explanations.
Standard analysis uses `gpt-5.6-luna`; precise analysis uses `gpt-5.6-sol`.
The app provides 74 quality-screened languages for source text, explanations, and the interface.

## Name

**Annotator-Connotator** combines the idea of turning a document into teaching material in every useful way with support for understanding not only annotation, but also connotation.

## Setup

1. Put your OpenAI API key in `.env`.
2. Double-click `launch_app.bat`.

On the first launch, the script installs the small YouTube-caption dependency when needed. It then starts the local server and opens `http://localhost:4174` in your default browser.

To stop the server, double-click `stop_app.bat`.

For one-click access later, double-click `install_desktop_shortcut.bat` once.
It creates a desktop shortcut that runs `launch_app.bat`.

You can also start it manually:

```powershell
.\start_server.ps1
```

Then open `http://localhost:4174`.

The server binds to `127.0.0.1` by default and rejects unexpected browser origins on POST endpoints that can spend API usage. Broader access is explicit: set `ALLOW_NETWORK=1` and optionally `HOST` for LAN binding, and list any intentional cross-origin web clients in the comma-separated `CORS_ORIGINS` variable. Do not expose this BYOK server directly to an untrusted network.

## Deployment Note

This app needs a small local/server-side proxy because the OpenAI API key must
stay out of the browser. GitHub Pages can host only the static files, so use a
Node-capable host such as Render, Railway, Fly.io, or a private server if you
want to deploy it publicly. Set `OPENAI_API_KEY` as a server-side environment
variable on the host.

## What It Does

- Lets you paste text in a selected source language.
- Imports public YouTube captions from a video URL, removes timestamps, and turns the caption segments into plain text.
- Can use the configured OpenAI model to correct likely speech-recognition errors without translating or summarizing the transcript.
- Supports 71 selectable languages, with automatic source-language detection.
- Lets you choose the explanation language separately.
- Lets you choose a UI language.
- Shows a full translation in the selected explanation language.
- Adjusts extraction difficulty: beginner, intermediate, advanced.
- Exhaustively scans medium and long passages in ordered sections so candidate discovery cannot silently stop after the beginning of the document.
- Ranks level-appropriate candidates globally by pedagogical priority and then adjusts annotation density.
- Switches between faster standard analysis with Luna and optional precise analysis with Sol.
- Offers all, speaking, and academic perspectives without treating the item budget as a quota. Grammar inclusion remains a separate checkbox.
- Sends the passage to the local server endpoint `POST /api/annotate`.
- Keeps the API key on the server side.
- Renders clickable vocabulary, phrases, idioms, grammar notes, slash reading, and exportable JSON/Markdown.
- Separately analyzes how wording sounds and what a listener may infer, rather than treating pragmatic inference as dictionary meaning.
- Covers evaluative nuance, stance, politeness, implicature, presupposition, register, irony, and euphemism.
- Highlights the smallest useful anchor expression while preserving wider contrast and discourse conditions in the context and evidence fields.
- Lets the learner switch nuance detail between brief, standard, and detailed without discarding the richer API result.
- Preserves global source offsets when ordered sections are merged back into one document.
- Shows section-based progress for multi-section work and lets the learner cancel without replacing the previous successful result.
- Shows the completed analysis model/mode and aggregate input, output, and total token usage without making another OpenAI request.
- Persists completed analyses locally in IndexedDB so unchanged work can be restored and reused without another paid model call.

## Ordered Section Analysis

Text over 3,200 JavaScript characters is divided at paragraph, sentence, line, or word boundaries into ordered sections of about 3,200 characters. This threshold is intentionally much lower than the old 18,000-character long-form threshold: a realistic lecture passage must now be inspected section by section rather than relying on one model response to keep searching through the entire document.

Each section receives a small amount of neighboring context for interpretation, but annotations, translation, and offsets are produced only for that section. A section may legitimately return zero ordinary annotations when it contains no level-appropriate targets; the system does not fill a quota merely to create visual coverage. Every section is nevertheless analyzed before the document is finalized.

Section results are remapped to global source offsets, deduplicated, globally ranked, and density-filtered once across the complete document. Translation and slash reading are combined in source order, so `translation` remains a full translation rather than a summary. `summaryJa` remains a separate summary field. Connotator remains precision-first and is not forced to produce a nuance annotation in every section.

The local safety ceiling is 250,000 characters. Actual latency and API usage grow with the number of sections. Cancelling aborts the current browser request and prevents later section calls; a provider request that has already started may still have consumed usage. A failed section is reported as a partial failure, and no incomplete result replaces the previous successful analysis.

## Local Result Cache And Usage

Completed analysis results are stored locally in browser IndexedDB. Cache identity includes the source text, source/explanation language, learner level, focus, grammar/slash settings, analysis mode, actual model, and cache-schema version. Display density is intentionally excluded from the identity because the richer ranked candidate pool can be filtered locally: low, standard, and high density therefore reuse the same eligible pool when a valid cached result is available.

The cache schema is versioned. Changes to the analysis architecture can invalidate older saved candidate pools so a previously incomplete result is not silently restored after an upgrade.

Reloading the app restores a matching saved result through the normal render path. Re-analyzing unchanged settings can also reuse the saved result without calling OpenAI. Use the **Re-run / 再解析** button when you explicitly want a fresh model generation; a fresh successful result replaces the saved entry for that exact analysis identity. Cache failures fall back to the normal server request rather than blocking analysis.

The compact result metadata line shows the model, analysis mode, section count when applicable, and aggregate input/output/total token usage reported by the API. A result served from persistent browser cache is marked as a local-cache result. Token numbers on a cached result describe the original analysis that produced it; loading the cached result itself does not make another OpenAI request.

## Annotation Selection And Density

Ordinary annotations are selected in three stages: ordered candidate discovery, contextual learner-band judging, and density filtering. Text up to 3,200 characters can use a single analysis section; longer text is split into multiple ordered sections so every region is explicitly inspected. Candidate discovery limits scale with section length instead of using a fixed whole-passage 7 / 12 / 18 cap. Discovery includes useful targets across all learner bands; the judge evaluates each target's value for beginner, intermediate, and advanced learners separately.

Density uses learning-value thresholds, not a fixed count or percentage. Low density shows high-value targets; standard also admits medium-value targets with a strong learning reason; high admits medium-value targets generally. Standard and high additionally preserve confidently judged advanced standalone words and domain terms, without promoting a simple construction merely because a slot contains a difficult word. Server and browser use the same selection rules. The server keeps a short-lived in-memory candidate cache, while the browser can reuse the judged pool across reloads when the analysis identity matches. A forced fresh generation can still produce a different candidate pool.

Overlapping candidates are preserved when they teach different things, such as a construction and a word inside it. Offset repair validates each source span independently; duplicate copies of the same span and type are removed separately. Each candidate receives an independent judge identifier, so repeated model IDs cannot attach one target's judgment to another. Cache schema changes invalidate older incomplete pools; use **Re-run / 再解析** to generate new candidates after updating.

Within each analysis section, the existing later-coverage check remains as a secondary safeguard when returned offsets are implausibly concentrated near the section beginning. It may request a small same-difficulty completion pass and may also return no additions. The primary full-document coverage guarantee is now the ordered multi-section scan rather than a single tail-repair pass. These ordinary-annotation coverage rules do not force Connotator coverage.

## Learner-Facing Cards

Ordinary annotation cards use learner-facing types such as word, collocation, formula, construction, idiom, and technical term. Their short gloss is visually quoted and the explanation prompt requests compact reference style, including plain-style Japanese. Construction candidates can include a generalized `pattern` plus annotation-relative `coreRanges`, allowing reusable elements such as `not only` and `but also` to be emphasized inside a longer source span.

Connotation cards keep the rich API fields but show a smaller default set: category badges and confidence, a compact gloss, connotation, effect in context, and concise evidence. Context warnings and competing interpretations appear only in the detailed view when present; `conventionality` remains available in JSON but is hidden from the normal card. Category badges include descriptions, and the legend provides a compact category glossary.

Run the deterministic regression tests with:

```powershell
npm.cmd test
```

Run the same no-API checks used by GitHub Actions with:

```powershell
npm.cmd run ci
```

Default CI performs syntax checks, deterministic unit/integration tests, and language-catalog fixture validation. Paid OpenAI smoke tests and benchmark scripts remain separate and are never run by default CI.

## Connotator Output

The API returns ordinary `annotations` and a separate `connotations` array. Each connotation includes its exact source span, scope, primary and secondary categories, subtype, surface meaning, suggested meaning, pragmatic effect, context note, confidence, alternatives, evidence, and whether the nuance is conventional, contextual, or mixed. The prompt explicitly allows an empty array and tells the model not to turn ordinary dictionary meaning or unsupported associations into connotation.

`tests/connotation-benchmark-cases.json` contains the first 32-case Japanese/English benchmark: eight categories with clear, contextual, contrast or cancellation, and negative-control cases. Validate the case design without using the API:

```powershell
node scripts/evaluate_connotations.mjs --dry-run --mode both
```

Run a limited live evaluation against the local app before a full benchmark:

```powershell
node scripts/evaluate_connotations.mjs --mode discovery --limit 2
```

The full benchmark uses a separate model judgment for pragmatic accuracy and restraint. It is an AI screening test, not native-speaker certification.

The model comparison and multilingual long-passage test are reproducible with `scripts/compare_connotation_models.mjs` and `scripts/evaluate_luna_long_multilingual.mjs`. The long-passage test covers Japanese, English, Chinese, Korean, Spanish, Turkish, and Arabic. It remains an AI screening test rather than native-speaker certification.

## YouTube Import

Choose `YouTube`, paste a video URL, and select whether to correct likely recognition errors with AI. The imported text remains editable and is not analyzed until you press the regular Analyze button. The importer prefers the selected input language; with automatic language detection it prefers an auto-generated source-language track when one is available.

The feature works with public videos that expose captions. It does not bypass private videos, age restrictions, disabled captions, or YouTube access controls. YouTube's official API only allows caption download with permission to edit the video, so this local feature uses the unofficial caption endpoint through `@hallelx/youtube-transcript`. YouTube can change or restrict that endpoint, especially from cloud-hosting IP addresses.

## Language Quality Evaluation

All 74 selectable languages passed two GPT-5.6 source-language cases each and a separate explanation-language test. The source cases covered an informational passage and a pragmatic passage with an idiom, stance, politeness, register, or implication. The explanation test used the same English sentence for every language. The evaluation checked translation fidelity, annotation accuracy, learning usefulness, connotation/register handling, output-language naturalness, and renderable source spans. Maori and Urdu were removed after failing the explanation-language test. See `docs/LANGUAGE_EVALUATION_2026-08-21.md` for the exact test examples, thresholds, and results, and `scripts/evaluate_candidate_languages.mjs` for the reproducible evaluator.

## Credit

Inspired by this video:

https://youtu.be/4IEaloiyelA?si=BViqR21SRxdEghOB
