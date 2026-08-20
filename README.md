# Annotator-Connotator

Turn any text into language-learning material with annotations, translations, and connotation-aware explanations.
The default model is `gpt-5.6-sol`.
The app provides 73 selectable languages for source text, explanations, and the interface.

## Name

**Annotator-Connotator** combines the idea of turning a document into teaching material in every useful way with support for understanding not only annotation, but also connotation.

## Setup

1. Put your OpenAI API key in `.env`.
2. Double-click `launch_app.bat`.

This starts the local server when needed and opens `http://localhost:4174` in your default browser.

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
- Supports 73 selectable languages, with automatic source-language detection.
- Lets you choose the explanation language separately.
- Lets you choose a UI language.
- Shows a full translation in the selected explanation language.
- Adjusts extraction difficulty: beginner, intermediate, advanced, academic.
- Adjusts annotation density.
- Sends the passage to the local server endpoint `POST /api/annotate`.
- Keeps the API key on the server side.
- Renders clickable vocabulary, phrases, idioms, grammar notes, slash reading, and exportable JSON/Markdown.

## Language Quality Evaluation

The 16 languages added in v0.3.0 passed two GPT-5.6 source-language evaluation cases each, followed by a separate explanation-language test. The tests covered translation fidelity, annotation accuracy, learning usefulness, connotation/register handling, output-language naturalness, and renderable source spans. See `docs/LANGUAGE_EVALUATION_2026-08-21.md` for the results and `scripts/evaluate_candidate_languages.mjs` for the reproducible evaluator.

## Credit

Inspired by this video:

https://youtu.be/4IEaloiyelA?si=BViqR21SRxdEghOB
