# Annotator-Connotator

Turn any text into language-learning material with annotations, translations, and connotation-aware explanations.
The default model is `gpt-5.6-sol`.
The app provides 71 quality-screened languages for source text, explanations, and the interface.

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
- Adjusts annotation density.
- Offers all, speaking, and academic perspectives without treating the item budget as a quota. Grammar inclusion remains a separate checkbox.
- Sends the passage to the local server endpoint `POST /api/annotate`.
- Keeps the API key on the server side.
- Renders clickable vocabulary, phrases, idioms, grammar notes, slash reading, and exportable JSON/Markdown.
- Separately analyzes how wording sounds and what a listener may infer, rather than treating pragmatic inference as dictionary meaning.
- Covers evaluative nuance, stance, politeness, implicature, presupposition, register, irony, and euphemism.
- Marks nuance spans directly in the text, places word-level nuance in the matching annotation card, and gives sentence-, utterance-, or passage-level nuance its own card.
- Lets the learner switch nuance detail between brief, standard, and detailed without discarding the richer API result.

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

## YouTube Import

Choose `YouTube`, paste a video URL, and select whether to correct likely recognition errors with AI. The imported text remains editable and is not analyzed until you press the regular Analyze button. The importer prefers the selected input language; with automatic language detection it prefers an auto-generated source-language track when one is available.

The feature works with public videos that expose captions. It does not bypass private videos, age restrictions, disabled captions, or YouTube access controls. YouTube's official API only allows caption download with permission to edit the video, so this local feature uses the unofficial caption endpoint through `@hallelx/youtube-transcript`. YouTube can change or restrict that endpoint, especially from cloud-hosting IP addresses.

## Language Quality Evaluation

All 71 selectable languages passed two GPT-5.6 source-language cases each and a separate explanation-language test. The source cases covered an informational passage and a pragmatic passage with an idiom, stance, politeness, register, or implication. The explanation test used the same English sentence for every language. The evaluation checked translation fidelity, annotation accuracy, learning usefulness, connotation/register handling, output-language naturalness, and renderable source spans. Maori and Urdu were removed after failing the explanation-language test. See `docs/LANGUAGE_EVALUATION_2026-08-21.md` for the exact test examples, thresholds, and results, and `scripts/evaluate_candidate_languages.mjs` for the reproducible evaluator.

## Credit

Inspired by this video:

https://youtu.be/4IEaloiyelA?si=BViqR21SRxdEghOB
