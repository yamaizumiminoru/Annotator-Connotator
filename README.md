# Language Annotation Studio

Local app server for turning pasted text into a clickable language-learning dashboard.
The default model is `gpt-5.6-sol`.

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
- Lets you choose the explanation language separately.
- Lets you choose a UI language.
- Shows a full translation in the selected explanation language.
- Adjusts extraction difficulty: beginner, intermediate, advanced, academic.
- Adjusts annotation density.
- Sends the passage to the local server endpoint `POST /api/annotate`.
- Keeps the API key on the server side.
- Renders clickable vocabulary, phrases, idioms, grammar notes, slash reading, and exportable JSON/Markdown.

## Credit

Inspired by this video:

https://youtu.be/4IEaloiyelA?si=BViqR21SRxdEghOB
