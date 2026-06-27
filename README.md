# SiteForge — AI Website Builder

A Lovable-style AI website builder powered by **Vercel AI SDK** and **Vercel Sandbox**. Describe a website in plain English and watch it get built live in an isolated microVM with instant preview.

## Features

- **Chat-to-build** — Natural language prompts generate HTML, CSS, and JavaScript
- **Live preview** — Sites run in a Vercel Sandbox with a public preview URL
- **Isolated execution** — AI-generated code runs safely in Firecracker microVMs
- **Persistent projects** — Each project gets a named sandbox that persists across sessions
- **Tool calling** — AI reads, writes, and lists files autonomously

## Architecture

```
User chat → /api/chat → AI (Claude via AI Gateway)
                ↓
         Vercel Sandbox (named per project)
                ↓
         Static files + `serve` on port 4173
                ↓
         Live preview iframe
```

## Prerequisites

- Node.js 22+
- A [Vercel AI Gateway](https://vercel.com/ai-gateway) API key
- Vercel Sandbox access (included with Vercel teams on supported plans)

## Setup

1. **Install dependencies**

```bash
npm install
```

2. **Configure environment variables**

Create `.env.local` in the project root (same folder as `package.json`):

```bash
cp .env.example .env.local
```

**For Gemini (recommended)** — get a free key at [Google AI Studio](https://aistudio.google.com/apikey):

```env
GOOGLE_GENERATIVE_AI_API_KEY=your_key_here
```

**Or use Vercel AI Gateway** (for Claude or gateway-routed models):

```env
AI_GATEWAY_API_KEY=your_key_here
```

| Variable | Description |
|---|---|
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini API key from Google AI Studio |
| `AI_GATEWAY_API_KEY` | Vercel AI Gateway key (optional) |
| `VERCEL_TOKEN` | Personal access token (local sandbox only) |
| `VERCEL_TEAM_ID` | Your Vercel team ID |
| `VERCEL_PROJECT_ID` | Linked Vercel project ID |

## API keys — two ways to configure

### Option A: In the app (easiest for local use)

1. Open the app → click **Settings**
2. Paste your **Gemini API key** from [Google AI Studio](https://aistudio.google.com/apikey)
3. For **local preview only**, expand Vercel Sandbox and add Token, Team ID, Project ID
4. Click **Save & apply**

Keys are stored in your browser (localStorage) and sent with each request. Do not deploy this publicly with keys stored in the browser.

### Option B: `.env.local` (server-side, better for production)

```env
GOOGLE_GENERATIVE_AI_API_KEY=your_key
VERCEL_TOKEN=...          # local sandbox only
VERCEL_TEAM_ID=...
VERCEL_PROJECT_ID=...
```

Server env vars are used when the app has no browser-stored keys.

## Does Sandbox work locally?

**Yes**, but you must authenticate:

| Environment | Sandbox auth |
|---|---|
| **Local (`npm run dev`)** | Paste Vercel Token + Team ID + Project ID in **Settings**, or run `vercel link && vercel env pull` into `.env.local` |
| **Deployed on Vercel** | Automatic via OIDC — no token needed |

Sandbox is a **Vercel team feature** (Pro plan). Your team must have Sandbox enabled.

## Deploying to Vercel

1. Push to GitHub and import the project in [Vercel](https://vercel.com/new)
2. Ensure your **team has Sandbox enabled**
3. Add environment variable in Vercel dashboard:
   - `GOOGLE_GENERATIVE_AI_API_KEY` — required for AI
4. Deploy — sandbox auth is automatic; users do not need Vercel tokens
5. Optional: add `AI_GATEWAY_API_KEY` if using Claude models

You do **not** need `VERCEL_TOKEN` / `VERCEL_TEAM_ID` / `VERCEL_PROJECT_ID` on Vercel production — those are only for local development.

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy to Vercel

```bash
vercel deploy
```

On Vercel, Sandbox authentication uses OIDC automatically — you only need `AI_GATEWAY_API_KEY` in project settings.

## Usage

1. Open the app and wait for the sandbox preview to load
2. Type a prompt like *"Build a landing page for a coffee shop"*
3. Watch the AI write files and update the live preview
4. Iterate with follow-up prompts to refine the design

## Project structure

```
app/
  api/chat/route.ts    — AI chat with sandbox tools
  api/preview/route.ts — Initialize sandbox & preview URL
  page.tsx             — Main builder page
components/
  builder.tsx          — Split-pane layout
  chat-panel.tsx       — Chat UI
  preview-panel.tsx    — iframe preview
lib/
  sandbox.ts           — Vercel Sandbox management
  tools.ts             — AI tools (writeFiles, readFile, listFiles)
  types.ts             — Shared types
```

## License

MIT
