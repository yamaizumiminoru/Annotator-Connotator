# Reason-tagged selection v1

This experimental architecture separates ordinary annotation discovery from learner-band judgment.

## Pipeline

1. The existing integrated model call continues to discover ordinary annotations and connotations together.
2. Ordinary discovery is broadened across A1-C2+ while connotation instructions remain sparse and precision-first.
3. Discovered ordinary candidates are judged in local context on separate dimensions: component lexical burden, contextual expression/sense difficulty, domain-term status, per-band pedagogical value, and meaning type.
4. The judge output is converted into non-exclusive learner-facing reason tags: **難語**, **慣用表現**, **術語**, **構文**.
5. Density is a soft threshold over pedagogical value and reasons rather than an exact 40/70/100% quota.

## Learner bands

The UI exposes beginner, intermediate, and advanced as independent checkboxes. Multiple bands use union semantics: a candidate can remain if it is valuable for any selected band. The broad candidate pool and all-band judge result can therefore be reused when checkboxes or density change.

## Compatibility

The existing `server.js`, annotation normalization, long-form merge, connotation handling, and legacy cache format remain intact. `server-reason-selection.js` wraps the current server at runtime so the experiment is easy to compare or remove without merging PR #12 or PR #13.

If the contextual judge fails, selection falls back to priority thresholds rather than dropping the entire ordinary annotation result.
