# maestro-oss

[![License: MIT](https://img.shields.io/badge/license-MIT-6ee7b7.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)](tsconfig.base.json)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js&logoColor=white)](apps/web)
[![Node](https://img.shields.io/badge/node-%3E%3D22-339933?logo=node.js&logoColor=white)](package.json)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

Open-source multi-agent orchestration canvas. Drop AI agents (CLI or API-backed)
onto a shared canvas, wire them together, give them sticky notes, cron routines,
a browser they can drive, and a phone/simulator they can tap around in.

## Architecture

```
apps/web      Next.js App Router canvas UI (deployable to Vercel)
apps/daemon   Local Node process: spawns agents, drives the browser/device
              portals, runs cron routines, dispatches push notifications
packages/shared  Zod schemas for the WS wire protocol + DB row types,
                  shared by both apps
supabase/migrations  Postgres schema + row-level security
```

**Why two processes?** Spawning a CLI agent, driving a real Chromium instance,
running `adb`/`simctl`, and firing cron jobs all need a long-lived process with
filesystem and subprocess access. That's not something Vercel's serverless
functions can do. `apps/web` can be deployed to Vercel (or run locally); it
talks to `apps/daemon` — which runs on your machine — over a WebSocket.

The daemon never holds a Supabase service-role key. Every DB read/write is
scoped to the connecting user's JWT, so Postgres RLS applies exactly the same
as it does from the browser.

## Setup

1. **Supabase** — create a project, then run `supabase/migrations/0001_init.sql`
   against it (via the SQL editor or `supabase db push`).
2. **Env vars**
   - `apps/web/.env.example` → `apps/web/.env.local`
   - `apps/daemon/.env.example` → `apps/daemon/.env`
3. **Install & run**
   ```
   npm install
   npm run dev
   ```
   This builds `packages/shared`, then runs the shared watcher, the daemon,
   and `next dev` together. Web UI: http://localhost:3000. Daemon:
   `ws://localhost:4200`.

## Agents

- **CLI agents** — the daemon spawns your configured command (default `claude`)
  and pipes messages to its stdin, streaming stdout/stderr back to the node.
  Any CLI that reads prompts line-by-line from stdin works; interactive TUIs
  that need a real TTY will not.
- **API agents** — run in-process in the daemon via the Vercel AI SDK
  (`@ai-sdk/anthropic` by default). No subprocess, just a streaming HTTP call.

Connect two agent terminals with an edge on the canvas and a completed
message from the source agent is automatically forwarded as input to the
target agent.

## Routines

Cron-scheduled prompts per agent, run by `node-cron` inside the daemon. The
web app is the source of truth for routine config (stored in the `routines`
table); when a workspace connects to the daemon it replays `routine.upsert`
for each enabled row to (re)activate the in-memory cron jobs. If the daemon
restarts, reload the workspace tab to re-arm routines.

## Browser portal

Headless Chromium via Playwright, one page per portal node. Actions: navigate,
click, type, read text, screenshot. Install browsers once:
```
npx playwright install chromium
```

## Device portal

- **Android** (emulator or physical, USB/WiFi debugging) — via `adb`. No extra
  SDK needed beyond `platform-tools` on your PATH.
- **iOS Simulator** — boot/launch/screenshot via `xcrun simctl` (Xcode
  required). Tap/type additionally require the optional
  [`idb`](https://github.com/facebook/idb) tool — without it those actions
  return an error explaining why.
- **Physical iOS devices are not supported.** There is no public, unsigned API
  to drive a real iPhone's UI; this is a hard platform limitation, not a
  missing feature.

## Push notifications

Self-hosted Web Push (VAPID) — no APNs/FCM dependency. Generate keys:
```
npm run gen:vapid
```
Put the values in `apps/daemon/.env` (`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`)
and `apps/web/.env.local` (`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, the public key
only). Click "Enable push" on the canvas toolbar to subscribe. Native mobile
push (APNs/FCM) is out of scope for v1 — this covers desktop/mobile browsers
that support the Push API.

## Testing

```
npm test        # vitest — shared protocol schemas, routine scheduler, process manager
npm run typecheck
npm run lint
```

## Known limitations

- No multiplayer cursor/presence layer yet — canvas state syncs via Supabase
  but concurrent edits from two tabs can race on the same node.
- CLI agent transcripts persist per-chunk (noisier); API agent transcripts
  persist per completed turn.
- Routine schedules live in the daemon's memory, re-armed on workspace
  connect — see "Routines" above.
