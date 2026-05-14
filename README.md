# @am25/webpush

Self-hosted Web Push notification server. Deploy in seconds and send push notifications from any application.

```
Your App  →  HTTP  →  @am25/webpush  →  Push Service  →  Browser
```

The server **does not store subscriptions**. Your application is responsible for storing them.

---

## Two ways to use it

This project supports two different modes:

### 1. As a published npm package

This is the main product experience.

Use it when you want a standalone push server without cloning this repository:

```bash
pnpm dlx @am25/webpush create-webpush
```

That setup wizard creates a new app, installs `@am25/webpush`, writes the `.env`, and runs the server through the published CLI binary:

```json
{
  "scripts": {
    "start": "webpush"
  }
}
```

In this mode, `webpush` comes from `node_modules/.bin`.

### 2. From this Git repository

Use it when you want to self-host from source, deploy directly from GitHub, or contribute to the project.

In this mode you build the TypeScript source and start the compiled server:

```bash
pnpm install
pnpm build
pnpm start
```

For deployment platforms such as Dokploy, the important distinction is:

- Deploying the npm package means installing `@am25/webpush` into another app.
- Deploying this repository means cloning source code and running the compiled output from `dist/`.

If you are deploying from GitHub, see [SELF-HOSTING.md](SELF-HOSTING.md).

---

## Setup

Run the setup wizard. It generates your VAPID keys and API key automatically, then installs and starts the server.

```bash
# pnpm
pnpm dlx @am25/webpush create-webpush

# npm
npx @am25/webpush create-webpush

# yarn
yarn dlx @am25/webpush create-webpush
```

The wizard will ask for a directory name, a `VAPID_SUBJECT` (a `mailto:` or `https:` URI that identifies you), and an optional port. Everything else is generated automatically.

At the end it prints your **VAPID public key** — you'll need it in your frontend to subscribe users.

---

## API

### Authentication

The `/send` and `/send-many` endpoints require an API key in the `Authorization` header:

```
Authorization: Bearer your-api-key
```

The `/health` endpoint is always public. Missing or incorrect keys return `401`:

```json
{ "error": "Unauthorized" }
```

---

### GET /health

```json
{ "status": "ok" }
```

---

### POST /send

Send a push notification to a single subscription.

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

---

### POST /send-many

Broadcast the same notification to multiple subscriptions in parallel.

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

Your apps need these values from the server's `.env`:

| Variable | Required | Where to use | What it does |
|---|---|---|---|
| `VAPID_SUBJECT` | Yes | Server only | Identifier used in VAPID claims. Must be a `mailto:` or `https:` URI. |
| `VAPID_PUBLIC_KEY` | Yes | Server + frontend | Public key used by the server and exposed to the browser so it can create subscriptions. |
| `VAPID_PRIVATE_KEY` | Yes | Server only | Private key used by the server to sign push requests. Never expose it to the client. |
| `API_KEY` | Yes | Server + your backend | Bearer token that protects `/send` and `/send-many`. Your backend sends it when calling this push server. |
| `PORT` | No | Server only | Port used by the HTTP server. Defaults to `5500`. |

Only `VAPID_PUBLIC_KEY` should reach the frontend.

### TypeScript

```ts
interface PushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

async function sendPush(subscription: PushSubscription) {
  await fetch(`${process.env.PUSH_SERVER_URL}/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.API_KEY}`,
    },
    body: JSON.stringify({
      subscription,
      payload: { title: "Hello", body: "New message", url: "/" },
    }),
  });
}
```

### JavaScript

```js
await fetch(`${process.env.PUSH_SERVER_URL}/send`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.API_KEY}`,
  },
  body: JSON.stringify({
    subscription,
    payload: { title: "Hello", body: "New message", url: "/" },
  }),
});
```

### Broadcast to multiple devices

```ts
const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });

await fetch(`${process.env.PUSH_SERVER_URL}/send-many`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.API_KEY}`,
  },
  body: JSON.stringify({
    subscriptions: subscriptions.map((s) => ({
      endpoint: s.endpoint,
      keys: s.keys as { p256dh: string; auth: string },
    })),
    payload: { title: "Announcement", body: "Message for everyone", url: "/" },
  }),
});
```

---

## Subscription storage

The server does not persist subscriptions. Store them in your own database.

A subscription object from the browser looks like:

```json
{
  "endpoint": "https://push-service/...",
  "keys": {
    "p256dh": "BNx4a...",
    "auth": "abc1..."
  }
}
```

Example Prisma model:

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

## Client setup

To receive push notifications the browser needs a **Service Worker**.

Create `sw.js` and serve it from the root of your site (e.g. `https://your-domain.com/sw.js`). If you already have a Service Worker, add the `push` and `notificationclick` listeners to it instead.

| Framework | Location |
|---|---|
| Next.js | `public/sw.js` |
| Nuxt | `public/sw.js` |
| Astro | `public/sw.js` |
| Vite / React SPA | `public/sw.js` |
| Plain HTML | Root of your site |

```js
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon || "/icons/icon-192x192.png",
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url));
});
```

Register the Service Worker and subscribe the user:

```js
const registration = await navigator.serviceWorker.register("/sw.js");
const subscription = await registration.pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey: VAPID_PUBLIC_KEY,
});

// Send `subscription` to your backend and store it
```

---

## iOS (Safari) note

On **Android and desktop**, a Service Worker is all you need.

On **iOS Safari (16.4+)**, two additional requirements apply:

1. The site must have a **web app manifest** (`manifest.json`).
2. The user must **install the site on the Home Screen**.

Without both, iOS silently ignores push notifications.

Minimal manifest:

```json
{
  "name": "Your App",
  "short_name": "App",
  "start_url": "/",
  "display": "standalone"
}
```

```html
<link rel="manifest" href="/manifest.json" />
```

---

## Deployment

Run the server behind a reverse proxy (Nginx, Traefik, Caddy, etc.) that handles SSL. Do not expose it directly to the internet.

```
Internet  →  Reverse Proxy (SSL)  →  @am25/webpush (:5500)
              push.your-domain.com
```

You'll need a domain or subdomain pointed to your server and an SSL certificate (Let's Encrypt works fine — most reverse proxies automate this).

The `VAPID_SUBJECT` in your `.env` should be a URI that identifies you (e.g. `mailto:you@example.com` or `https://your-domain.com`).

---

## Self-hosting from source

For advanced setups or to contribute, see [SELF-HOSTING.md](SELF-HOSTING.md).
