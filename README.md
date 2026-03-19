# am-webpush

Simple **Web Push notification server** built with Express 5 and TypeScript.

It can be used in two ways:

1. **Standalone service** — run this repo as a microservice and send HTTP requests to it.
2. **Library** — import and mount the router inside your own backend (Express, Next.js, etc.).

The server **does not store subscriptions**. Your application is responsible for storing them.

---

## Quick Start

### 1. Install dependencies

```bash
pnpm install
```

### 2. Build

```bash
pnpm build
```

### 3. Create a `.env` file

```env
VAPID_SUBJECT=https://your-domain.com
VAPID_PUBLIC_KEY=BNx4a...
VAPID_PRIVATE_KEY=abc1...
PORT=5500
```

Generate VAPID keys if you don't have them:

```bash
pnpm run generate:vapid
```

### 4. Start the server

```bash
pnpm start
```

The API will be available at `http://localhost:5500`.

---

## API

### Health check

```
GET /health
```

```json
{ "status": "ok" }
```

### Send notification

Send a push notification to a single subscription.

```
POST /send
```

```json
{
  "subscription": {
    "endpoint": "https://push-service/...",
    "keys": {
      "p256dh": "BNx4a...",
      "auth": "abc1..."
    }
  },
  "payload": {
    "title": "New episode",
    "body": "Episode 42 has been uploaded",
    "url": "/"
  }
}
```

Response:

```json
{ "success": true }
```

### Send to multiple subscriptions

Broadcast the same notification to multiple devices.

```
POST /send-many
```

```json
{
  "subscriptions": [
    { "endpoint": "...", "keys": { "p256dh": "...", "auth": "..." } },
    { "endpoint": "...", "keys": { "p256dh": "...", "auth": "..." } }
  ],
  "payload": {
    "title": "Maintenance",
    "body": "The server will restart at 3am",
    "url": "/"
  }
}
```

Response:

```json
{
  "success": true,
  "total": 2,
  "sent": 2,
  "failed": 0,
  "results": [
    { "success": true },
    { "success": true }
  ]
}
```

---

## Usage

### 1. Standalone server (recommended)

Run this repository as a separate push service. Your apps send HTTP requests to it whenever they need to deliver a notification.

```
App  →  HTTP  →  am-webpush  →  Push Service  →  Browser
```

#### Example (TypeScript)

```ts
interface PushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

async function sendPush(subscription: PushSubscription) {
  const res = await fetch("https://your-push-server.com/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subscription,
      payload: {
        title: "Hello",
        body: "New message",
        url: "/",
      },
    }),
  });

  const data = await res.json();
  console.log(data); // { success: true }
}
```

#### Example (JavaScript)

```js
await fetch("https://your-push-server.com/send", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    subscription,
    payload: {
      title: "Hello",
      body: "New message",
      url: "/",
    },
  }),
});
```

This approach is recommended if:

- Multiple apps share the same push system.
- You want one place to manage VAPID keys.
- You prefer a dedicated microservice.

---

### 2. Embedded in an Express backend

Import `createPushServer` and mount it in your own Express app. You provide the VAPID config programmatically — no `.env` needed for the library.

#### TypeScript

```ts
import express from "express";
import { createPushServer } from "am-webpush";

const app = express();

app.use(express.json());

const pushRouter = createPushServer({
  vapidSubject: "https://your-domain.com",
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY!,
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY!,
});

// Mount at /push so endpoints become /push/health, /push/send, /push/send-many
app.use("/push", pushRouter);

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
```

#### JavaScript

```js
import express from "express";
import { createPushServer } from "am-webpush";

const app = express();

app.use(express.json());

const pushRouter = createPushServer({
  vapidSubject: "https://your-domain.com",
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY,
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY,
});

app.use("/push", pushRouter);

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
```

> **Important:** You must apply `express.json()` middleware **before** mounting the push router. The router expects `req.body` to already be parsed.

---

### 3. Embedded in a Next.js app

Use `createPushServer` inside a Next.js Route Handler. Since Route Handlers don't use Express middleware, you need to parse the body yourself and call the `web-push` library directly. Use this repo as a **reference implementation**.

#### TypeScript (App Router)

```ts
// app/api/push/send/route.ts
import webpush from "web-push";

interface PushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

interface PushPayload {
  title: string;
  body: string;
  url?: string;
}

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export async function POST(request: Request) {
  const { subscription, payload } = (await request.json()) as {
    subscription: PushSubscription;
    payload: PushPayload;
  };

  if (!subscription || !payload) {
    return Response.json(
      { error: "subscription and payload are required" },
      { status: 400 }
    );
  }

  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return Response.json({ success: true });
  } catch (error) {
    console.error("Push error:", error);
    return Response.json(
      { error: "Failed to send notification" },
      { status: 500 }
    );
  }
}
```

#### JavaScript (App Router)

```js
// app/api/push/send/route.js
import webpush from "web-push";

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export async function POST(request) {
  const { subscription, payload } = await request.json();

  if (!subscription || !payload) {
    return Response.json(
      { error: "subscription and payload are required" },
      { status: 400 }
    );
  }

  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return Response.json({ success: true });
  } catch (error) {
    console.error("Push error:", error);
    return Response.json(
      { error: "Failed to send notification" },
      { status: 500 }
    );
  }
}
```

---

## Exported types

When using the library with TypeScript, you get full type support:

```ts
import type {
  PushSubscription,
  PushPayload,
  PushServerOptions,
} from "am-webpush";
```

| Type                | Description                                       |
| ------------------- | ------------------------------------------------- |
| `PushSubscription`  | Browser push subscription (`endpoint` + `keys`)   |
| `PushPayload`       | Notification payload (`title`, `body`, `url?`)    |
| `PushServerOptions` | Config object for `createPushServer()`            |

---

## Subscription storage

This server **does not store subscriptions**. Your application must store them in a database.

A subscription object returned by the browser looks like this:

```json
{
  "endpoint": "https://push-service/...",
  "keys": {
    "p256dh": "BNx4a...",
    "auth": "abc1..."
  }
}
```

### Example Prisma model

```prisma
model PushSubscription {
  id        String   @id @default(cuid())
  endpoint  String   @unique
  keys      Json
  createdAt DateTime @default(now())
  userId    String

  @@index([userId])
}
```

### Example: send to all user devices

#### TypeScript

```ts
import type { PushSubscription } from "am-webpush";

const subscriptions: PushSubscription[] = await prisma.pushSubscription.findMany({
  where: { userId },
});

await fetch("https://your-push-server.com/send-many", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    subscriptions: subscriptions.map((s) => ({
      endpoint: s.endpoint,
      keys: s.keys as { p256dh: string; auth: string },
    })),
    payload: {
      title: "Announcement",
      body: "Message for everyone",
      url: "/",
    },
  }),
});
```

#### JavaScript

```js
const subscriptions = await prisma.pushSubscription.findMany({
  where: { userId },
});

await fetch("https://your-push-server.com/send-many", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    subscriptions: subscriptions.map((s) => ({
      endpoint: s.endpoint,
      keys: s.keys,
    })),
    payload: {
      title: "Announcement",
      body: "Message for everyone",
      url: "/",
    },
  }),
});
```

---

## iOS (Safari) note

Push notifications on **iOS Safari (16.4+)** only work if the site is installed as a **PWA**.

Minimal manifest:

```json
{
  "name": "Your App",
  "short_name": "App",
  "start_url": "/",
  "display": "standalone"
}
```

Include it in your HTML:

```html
<link rel="manifest" href="/manifest.json" />
```

Without installing the site on the Home Screen, iOS will ignore push notifications.

---

## Development

```bash
pnpm install        # Install dependencies
pnpm build          # Compile TypeScript to dist/
pnpm dev            # Watch mode (recompile on changes)
pnpm start          # Start the server (requires build first)
pnpm run generate:vapid  # Generate VAPID key pair
```

### Project structure

```
src/
  router.ts    ← Core: createPushRouter() returns Express Router with all endpoints
  server.ts    ← Standalone server: dotenv, VAPID config, cors, body parsing, listen
  vapid.ts     ← CLI script to generate VAPID key pairs
index.ts       ← Library entry: exports createPushServer(), createPushRouter(), and types
bin/
  webpush.ts   ← CLI entry point (imports src/server.ts)
dist/          ← Compiled output (generated by pnpm build)
```
