# Annotator-Connotator Release Notes

[日本語版 / Japanese release notes](RELEASE_NOTES.ja.md)

## v0.8.0 - Web app complete

2026-08-26

This release marks a practical completion point for the Annotator-Connotator web app. It now brings together **context-aware learner-value judgment, connotation-aware analysis, long-form processing, contextual questions, speech, translation, multilingual UI, and browser integration** in one local language-learning application.

### Context-aware annotation selection

- Annotation selection now evaluates **lexical difficulty, meaning in context, domain status, and pedagogical value** separately rather than relying on word difficulty alone.
- Candidate discovery is separated from learner-level display decisions, allowing useful idioms, phrasal verbs, extended senses, constructions, and technical terms to remain eligible even when their component words are simple.
- Annotations may display reason tags such as **hard word**, **idiomatic expression**, **technical term**, and **construction**.
- Beginner, intermediate, and advanced are now independent checkboxes. Selecting multiple levels displays the union of items useful for those learner bands.
- Low / standard / high density controls how much is shown within the selected learner levels. Changing learner level or density re-filters the already judged pool locally and does not trigger another analysis request.

### Regional discovery to prevent annotation gaps

- Longer texts previously could produce a large under-annotated region when candidate discovery became concentrated near the beginning. The new **regional exhaustive discovery** design addresses this during the first discovery pass instead of relying only on a later repair pass.
- Each section is divided into natural local regions. Every region is explicitly scanned before candidates are flattened back into source order; regions are not forced to fill a quota when no useful target is present.
- In a 14-region benchmark, every region produced candidates. The largest uncovered span decreased from **2,985 characters to 778 characters**, and the number of gaps of at least 1,000 characters decreased from **two to zero**.
- The same run needed **zero completion additions**, indicating that the spatial improvement came from the first discovery pass itself.
- Total token use increased by about **8.8%** versus the baseline. The method does not guarantee perfect recall of every individual expression, but it substantially reduces the tendency for discovery to stop effectively before the end of a passage.

### Connotation-aware analysis

- Connotation analysis remains separate from ordinary annotations and continues to use a precision-first policy.
- Evaluative meaning, stance, implicature, presupposition, register, irony, and related pragmatic effects are explained separately from literal meaning.
- The connotation-detail slider is display-only and does not trigger a new LLM analysis.

### Translation only when requested

- Full-text translation is now **opt-in through a checkbox** and is off by default.
- When translation is disabled, unexpected model translation output is not retained as a displayed translation.
- Translation-enabled and translation-disabled analysis pools are kept separate in the cache.
- Toggling the translation checkbox does not automatically start another paid analysis; the setting takes effect when the user explicitly analyzes the text.

### Faster long-form analysis

- Long texts can now be analyzed with up to **five chunks in parallel**.
- Source order is preserved while keeping the existing retry, cancellation, and partial-failure behavior.
- In a 14,111-character benchmark, wall-clock time decreased from about 545 seconds with serial processing to about 155 seconds with five-way concurrency. Actual latency varies with API load and caching.

### Prevention of unintended paid re-analysis

- Changing learner level, annotation density, or connotation display settings no longer starts a new analysis.
- Loading a page with saved results no longer auto-clicks the Analyze button.
- Normal re-analysis occurs only when the user explicitly starts an analysis or re-analysis.

### Two text-to-speech options

- The existing device/browser speech option remains available, with its default rate changed to **1.00×**.
- A higher-quality **AI speech** option has been added using `gpt-4o-mini-tts`, with **Marin** and **Cedar** voice choices.
- Long texts are generated in chunks. Audio is cached locally in **IndexedDB** using the text, language, model, voice, speed, and instruction version as cache inputs, so matching audio can be replayed without another generation request.
- Unsupported AI-speech languages are rejected before an API call is made, and the app suggests device speech in the current UI language.
- The interface explicitly identifies AI speech as AI-generated audio.

### Ask about a selected passage

- Select text in the source or analyzed passage and choose **Ask** from Chrome's normal right-click menu. Copy, Search, Translate, and the browser's other native context-menu actions remain available.
- Questions start with the selected passage, the user's question, and a compact amount of nearby context. If more context is needed, the model can request a wider window with `get_context` rather than receiving the entire source by default.
- Question answers follow the selected explanation language and use Standard (Luna) or Precise (Sol) according to the app's analysis mode.
- Optional browser speech recognition can be used to dictate a question.
- A short hint beside the annotation legend makes the right-click question feature discoverable without adding another permanent toolbar control.

### Chrome extension

- A minimal Manifest V3 Chrome extension can open selected text from a web page or text-selectable PDF in Annotator-Connotator.
- Importing text through the extension fills the input but does **not** automatically start analysis.
- On the local app itself, the extension adds the native **Ask** context-menu action and bridges the selected passage back into the question dialog.
- The unpacked extension should be reloaded from `chrome://extensions` after updating its local files.

### 74-language catalog

- The public source-language, explanation-language, and UI-language catalog now contains **74 languages**.
- **Mongolian (`mn`), Māori (`mi`), and Urdu (`ur`)** were retested after correcting the language-routing path and all three passed the targeted live re-evaluation, so they have been restored to the catalog.
- Unsupported routing or fallback is treated separately from model-language quality, preventing a request that silently fell back to Japanese from being counted as a model-language failure.
- Deterministic tests now guard the `mn` / `mi` / `ur` explanation-language routing.
- Language-catalog support and AI TTS support remain separate concerns. Mongolian was not added to AI TTS support merely because it passed the explanation-language evaluation.

### UI, localization, and branding

- In the Japanese UI, the main heading is displayed as **「あの手ーターこの手ーター」**. Other UI languages keep the standard product name.
- When new UI strings are added, existing translated UI caches are supplemented with only the missing strings rather than regenerated wholesale.
- New speech- and question-related messages can be localized through the app's existing UI translation mechanism.
- The app now uses the new **two palms + A/C** logo, with a black **A** and white **C**, across the web app, favicon, and Chrome extension icons.

### Quality and safety

- Regression tests now cover five-way long-form concurrency, regional discovery, local learner-level and density filtering, connotation display behavior, translation opt-in behavior, speech caching, TTS language checks, contextual questions, language routing, and the Chrome-extension bridge.
- The OpenAI API key continues to remain on the local Node.js server and is not exposed to the browser.
- Question requests send only the selected passage, the question, and the compact context actually needed by the model to OpenAI; wider context is supplied only when requested.
- GitHub Actions continues to run syntax checks, automated tests, and **74-language catalog verification**.

With this release, the web app brings together **vocabulary and construction annotation, contextual learner-value judgment, connotation explanations, optional full-text translation, YouTube transcript import, a 74-language UI/catalog, long-form analysis, device speech, cached AI speech, contextual questions, and browser selection import** in one local application.
