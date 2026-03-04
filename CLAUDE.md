# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Web Push notification microservice built with Express 5 and the `web-push` library. Works as both a standalone CLI server and an importable library. Uses ES modules (`"type": "module"`). Package manager is pnpm.

## Commands

- **Install dependencies:** `pnpm install`
- **Start server:** `pnpm start` (runs `bin/am-webpush.js`, default port 5500)
- **Generate VAPID keys:** `pnpm run generate:vapid`

No test framework or linter is configured.

## Architecture

```
src/router.js    ← Core: createPushRouter(webpush) returns Express Router with endpoints
src/server.js    ← Standalone server: dotenv, VAPID config, cors, body parsing, app.listen
src/vapid.js     ← CLI script to generate VAPID key pairs
bin/am-webpush.js ← CLI entry point (shebang + imports src/server.js)
index.js         ← Library entry point: exports createPushServer() and createPushRouter()
```

**Two usage modes:**

1. **CLI** (`npx am-webpush` or `pnpm start`): `bin/am-webpush.js` → `src/server.js` → `src/router.js`. Reads VAPID config from `.env`.

2. **Programmatic**: `import { createPushServer } from 'am-webpush'` returns an Express Router. Caller provides VAPID config as arguments and mounts the router in their own Express app. Caller must apply `express.json()` middleware before mounting.

**Endpoints** (in `src/router.js`):
- `GET /health` — health check
- `POST /send` — push notification to a single subscription
- `POST /send-many` — push notification to multiple subscriptions (parallel via `Promise.all`)

## Environment

Requires a `.env` file with `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (only for CLI mode, not committed).
