# Implementation notes

- Base: main at `26d3c8bfc683e13671267ca50e5c7e109716de1e`.
- PR #12 and PR #13 are intentionally not merged or cherry-picked.
- The legacy `server.js` remains intact. `server-reason-selection.js` patches the ordinary-selection hooks before loading it, which keeps this experiment easy to compare and roll back.
- Connotation target/benchmark requests bypass the broad ordinary-discovery wrapper so the existing connotation evaluation path remains directly comparable.
- The contextual judge uses the same Luna/Sol model selected for the parent analysis and its usage is folded into reported API token usage.
- The browser reuses the judged candidate pool when learner-band checkboxes or density change, avoiding a new model call for display-only changes.
