# am-webpush

Web Push notification microservice built with Express 5 and TypeScript.

Deploy it as a standalone service and send HTTP requests to it from any app.

```
Your App  →  HTTP  →  am-webpush  →  Push Service  →  Browser
```

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
API_KEY=your-secret-api-key
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

## Authentication

The `/send` and `/send-many` endpoints are protected with API key authentication. The `/health` endpoint remains public.

All send requests must include the key in the `Authorization` header:

```
Authorization: Bearer your-secret-api-key
```

If the key is missing or incorrect, the server responds with `401`:

```json
{ "error": "Unauthorized" }
```

If no `API_KEY` is configured in the `.env`, the endpoints remain open.

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

## Consuming from your app

Your client apps need these environment variables:

```env
VAPID_PUBLIC_KEY=BNx4a...          # Same public key from the server's .env
PUSH_API_KEY=your-secret-api-key   # Same API_KEY from the server's .env
PUSH_SERVER_URL=https://push.your-domain.com
```

- `VAPID_PUBLIC_KEY` — needed in the frontend to subscribe the browser to push notifications.
- `PUSH_API_KEY` — needed in the backend to authenticate requests to the push server.
- `PUSH_SERVER_URL` — the URL where your am-webpush instance is running.

### TypeScript

```ts
interface PushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

async function sendPush(subscription: PushSubscription) {
  const res = await fetch(`${process.env.PUSH_SERVER_URL}/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.PUSH_API_KEY}`,
    },
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

### JavaScript

```js
await fetch(`${process.env.PUSH_SERVER_URL}/send`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.PUSH_API_KEY}`,
  },
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

### Broadcast to all user devices

#### TypeScript

```ts
interface PushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

const subscriptions: PushSubscription[] = await prisma.pushSubscription.findMany({
  where: { userId },
});

await fetch(`${process.env.PUSH_SERVER_URL}/send-many`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.PUSH_API_KEY}`,
  },
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

await fetch(`${process.env.PUSH_SERVER_URL}/send-many`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.PUSH_API_KEY}`,
  },
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

## Deployment

This server is meant to run behind a reverse proxy (Nginx, Nginx Proxy Manager, Traefik, Caddy, etc.) that handles SSL termination. Do not expose it directly to the internet.

A typical setup:

```
Internet  →  Reverse Proxy (SSL)  →  am-webpush (:5500)
              push.your-domain.com
```

You'll need:

- A domain or subdomain pointed to your server (e.g. `push.your-domain.com`).
- An SSL certificate (Let's Encrypt works fine — most reverse proxies automate this).
- The reverse proxy forwarding HTTPS traffic to the port where am-webpush is running.

The `VAPID_SUBJECT` in your `.env` should be the root domain that identifies your organization (e.g. `https://your-domain.com`), not necessarily the push server URL.

---

## Development

```bash
pnpm install             # Install dependencies
pnpm build               # Compile TypeScript to dist/
pnpm dev                 # Watch mode (recompile on changes)
pnpm start               # Start the server (requires build first)
pnpm run generate:vapid  # Generate VAPID key pair
```

### Project structure

```
src/
  router.ts    ← Core: Express Router with all endpoints + API key middleware
  server.ts    ← Standalone server: dotenv, VAPID config, cors, body parsing, listen
  vapid.ts     ← CLI script to generate VAPID key pairs
index.ts       ← Library entry: exports createPushServer(), createPushRouter(), and types
bin/
  webpush.ts   ← CLI entry point (imports src/server.ts)
dist/          ← Compiled output (generated by pnpm build)
```
