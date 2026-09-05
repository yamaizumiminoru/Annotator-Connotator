# Annotation recall diagnosis — 2026-09-05

## Evidence and limits

Baseline: GitHub main `e12488cb6e67a0c72c56eaa189946aba94e601f9` (PR #61), using the actual `server-tts.js` entry point and its installed fetch/selection wrappers. A fresh Luna standard-mode request used advanced only, high density, grammar and translation enabled, and the 27,586-character lecture from the supplied `new2 Hey there, and welcome to this new introduction.json` export. Source SHA-256: `545a841eafc23e8d36a331e6d0e53dc547c88da1011a9aad0fa33565e2cc1c8c`.

The export contains 80 displayed annotations but no raw discovery, judge, or candidate-pool metadata. Its legacy `settings.level` says beginner and it does not preserve selected-level checkboxes. Consequently, the historical omissions cannot be assigned a precise internal cause from that export. The measurements below describe the fresh, explicitly advanced-only request, not a reconstruction of its original generation.

Temporary instrumentation captured outgoing model bodies (without authorization headers), raw responses, regional flattening, every offset-repair/merge stage, judge inputs/results, and final selection. Full lecture and raw trace remain in ignored local diagnostic files; they are not included in the repository.

## Measured flow

Actual order: regional discovery → region-local offset repair/deduplication → contextual judge → section repair/filter/deduplication → optional later-coverage completion → long-form global repair/merge → learner-band/density selection → browser redisplay.

| Representative target | Raw discovery and judging | Final baseline eligibility |
| --- | --- | --- |
| `morphemes` | Discovered in section 3; repaired to section offsets 2217–2226; lexical/contextual advanced, domain confidence high, advanced value high | Retained in pool, server response, and browser selection |
| `indirect speech act` | Discovered in section 4; repaired to 2343–2362; lexical intermediate, contextual advanced, domain confidence high, advanced value high | Retained throughout |
| `cognates` | Discovered as `so-called cognates` in section 8; domain confidence high and advanced value high | Retained throughout; span includes the naming modifier |
| `Zipf's law` | Absent from raw section-5 candidates; nearby `power law` and `mathematical distribution` were returned | Never reached judging or selection |
| `utterance` | No standalone lexical/term candidate. Section 6 returned the whole comparative construction containing it | The construction's contextual band is intermediate, advanced value low; correctly excluded from advanced selection |

All 36 regions were returned. There were 250 raw candidates, 249 valid candidates, and 117 advanced/high-density annotations. The one invalid candidate, `not literally`, was not an exact source substring. No valid overlap was deleted in this baseline; no additional candidate was lost in section normalization, deduplication, or long-form merge. All 249 candidates received judgments. No later-coverage completion was requested.

| Section | Raw candidates | Prompt maximum | Discovery output tokens (limit 13,000) |
| --- | ---: | ---: | ---: |
| 1 | 32 | 30 | 10,297 |
| 2 | 35 | 31 | 9,656 |
| 3 | 30 | 31 | 10,113 |
| 4 | 27 | 31 | 9,879 |
| 5 | 18 | 31 | 6,672 |
| 6 | 28 | 31 | 8,498 |
| 7 | 28 | 29 | 9,751 |
| 8 | 40 | 31 | 10,998 |
| 9 | 12 | 32 | 8,199 |

There is **no fixed final display-count cap** in the active reason-based selector. Density uses learning-value thresholds, not the legacy 40/70/100% slicing. Candidate maxima are instructions to the model, not server-side truncation: three sections exceeded them. The sections with the remaining discovery misses were below their maxima. Every discovery and judge response completed below its output-token limit; neither configured maximum establishes the cause of these omissions. Limits are unchanged by this fix.

## General defects repaired

1. **Candidate preservation:** offset repair previously treated any overlap as grounds to discard a candidate, before the judge could compare its learning value. It could also relocate a valid nested candidate to an unrelated repeated occurrence. Repair now validates each candidate independently and uses the nearest exact occurrence when repair is needed; exact duplicates remain the merge stage's responsibility. Regression tests show a useful nested target surviving a rejected surrounding construction at all three learner levels.
2. **Discovery semantics:** the effective discovery prompt simultaneously prohibited overlap and asked for separately useful nested words/terms. PR #61 also prohibited ordinary B1–B2 literal vocabulary despite all-band discovery. Instructions now consistently preserve distinct targets and useful beginner/intermediate material. Named technical concepts are distinguished from incidental personal/place names, using source-language meaning rather than English naming triggers.
3. **Judge association:** repeated model IDs could assign one candidate another candidate's judgment. Independent positional transport IDs now associate each judgment with its intended target; public IDs are disambiguated within that batch.
4. **Server/browser agreement:** PR #61 rescued advanced words/terms only on the server. Browser redisplay could remove them using the unpatched selector. The existing eligibility rule now lives in the shared selector. Low density remains strict; construction/collocation candidates do not receive lexical rescue merely because of difficult slot words.

The baseline contained no repeated judge IDs and no server/browser disagreement. These are independently reproduced defects, not asserted causes of its particular missing words. Likewise, the overlap failure is demonstrated by controlled pipeline tests, not by a deleted overlap in this live sample. Prompt changes address conflicting discovery semantics; a stochastic model run cannot prove why an unreturned candidate was omitted.

The changes add no language-specific matching, example whitelist, candidate-count quota, or special recovery pass. Cache schema `analysis-v4` prevents reuse of old incomplete pools. README now describes the active threshold semantics.

## Validation

- `npm.cmd run ci`: syntax checks, 242 deterministic tests, and 74-language catalog fixture validation passed.
- Behavioral regressions exercise beginner English, intermediate Spanish, advanced Japanese, UTF-16 offsets, nested/crossing spans, repeated occurrences, exact duplicates, shuffled judgments, and all learner-band/density combinations.
- A mocked-provider test starts the actual `server-tts.js` HTTP stack and performs nine analyses covering all three levels × three densities, including overlapping targets and duplicated model IDs. It checks final targets and browser redisplay with no external API calls.
- Focused real API checks of sections 4–6 retained `indirect speech act` and recovered standalone `utterance` as a term. Japanese and Turkish checks returned plausible basic constructions and domain vocabulary in their respective bands. Every returned candidate was judged, and the response used cache schema v4. These checks are limited examples, not a new native-speaker evaluation of all 74 languages.
- The first focused section-5 rerun still omitted `Zipf's law` at raw discovery (31 candidates against a prompt maximum of 31). After clarifying the boundary between named concepts and incidental proper names, one final matched section request returned 21 valid candidates, including `Zipf's law`. Its contextual band was advanced, domain confidence high, and advanced value high; it survived final display. Discovery used 7,354/13,000 output tokens and the judge 3,008/3,990. This supports the category clarification without proving the cause of the earlier stochastic omission.
- The same final clarification found Japanese `パレートの法則` and Turkish `Bayes teoremi` as advanced domain targets. Incidental `山田さん` and `Ayşe` were not returned. Basic/intermediate material still appeared in the corresponding selected bands. These were separate examples, not production keyword rules.

No remaining omission in these bounded checks was repaired by a forced target or a special extra extraction pass. Future model generations can still omit useful targets; the implementation fixes deterministic loss paths and clarifies discovery semantics rather than guaranteeing exhaustive recall.

## Update and restart

Server-side code changed. After pulling main, stop the existing local server, launch through `launch_app.bat` (or `npm.cmd start`), reload the page, and use **Re-run / 再解析**. `start_server.ps1` currently starts the legacy `server.js` entry directly; use the desktop launcher or npm entry for the complete annotation pipeline.
