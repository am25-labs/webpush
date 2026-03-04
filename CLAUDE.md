# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Web Push notification microservice built with Express 5 and the `web-push` library. Designed for self-hosted manga/book reader instances. Uses ES modules (`"type": "module"`).

## Commands

- **Install dependencies:** `pnpm install`
- **Start server:** `pnpm start` (runs `node index.js`, default port 5500)
- **Generate VAPID keys:** `pnpm run generate:vapid`

No test framework or linter is configured.

## Architecture

Single-file Express server ([index.js](index.js)) with three endpoints:

- `GET /health` — health check
- `POST /send` — send push notification to a single subscription
- `POST /send-many` — send push notification to multiple subscriptions (parallel via `Promise.all`)

VAPID credentials are configured via environment variables: `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`.

[utils/vapid.js](utils/vapid.js) is a standalone CLI script to generate VAPID key pairs.

## Environment

Requires a `.env` file with VAPID credentials (not committed). Package manager is pnpm.
