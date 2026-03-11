# web-push-server

Web Push notification server. It can be used in two ways:

1. **As a standalone server** — run it on a VPS and send requests to it from any app.
2. **As a library** — import it into your Express/Next.js project and mount the routes directly.

---

## Quick Start

### 1. Install

```bash
# With pnpm
pnpm install

# With npm
npm install
```

### 2. Generate VAPID keys

VAPID keys identify your server to browser push services (Google, Mozilla, Apple). You only generate them once:

```bash
pnpm run generate:vapid
```

This prints two values:

```
VAPID_PUBLIC_KEY= BNx4a...
VAPID_PRIVATE_KEY= abc1...
```

Save them. The **public key** is used on the frontend (to subscribe users). The **private key** stays on the server.

---

## Mode 1: Standalone server

Use this when you want a separate service that your apps call. It's recommended if multiple apps share the same push system.

### Configuration

Create a `.env` file at the project root (or set the variables in your deployment platform):

```env
VAPID_SUBJECT=https://your-domain.com
VAPID_PUBLIC_KEY=BNx4a...
VAPID_PRIVATE_KEY=abc1...
PORT=5500
```

`VAPID_SUBJECT` should be a contact URL (`https://...` or `mailto:...`). Push services use it if they need to contact you.

### Start

```bash
pnpm start
```

The server listens on `http://localhost:5500` by default.

### Available endpoints

#### `GET /health`

Health check.

```bash
curl http://localhost:5500/health
# → { "status": "ok" }
```

#### `POST /send`

Send a notification to a single subscription.

```bash
curl -X POST http://localhost:5500/send \
  -H "Content-Type: application/json" \
  -d '{
    "subscription": {
      "endpoint": "https://fcm.googleapis.com/fcm/send/...",
      "keys": {
        "p256dh": "...",
        "auth": "..."
      }
    },
    "payload": {
      "title": "New episode",
      "body": "Episode 42 has been uploaded"
    }
  }'
# → { "success": true }
```

#### `POST /send-many`

Send the same notification to multiple subscriptions.

```bash
curl -X POST http://localhost:5500/send-many \
  -H "Content-Type: application/json" \
  -d '{
    "subscriptions": [
      { "endpoint": "...", "keys": { "p256dh": "...", "auth": "..." } },
      { "endpoint": "...", "keys": { "p256dh": "...", "auth": "..." } }
    ],
    "payload": {
      "title": "Maintenance",
      "body": "The server will be down for maintenance at 3am"
    }
  }'
# → { "success": true, "total": 2, "sent": 2, "failed": 0, "results": [...] }
```

---

## Mode 2: As a library

Use this if you already have an Express server or a Next.js app and want to mount the push routes directly without running a separate service.

### Express

```js
import express from "express";
import { createPushServer } from "web-push-server";

const app = express();
app.use(express.json());

app.use(
  "/push",
  createPushServer({
    vapidSubject: "https://your-domain.com",
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY,
    vapidPrivateKey: process.env.VAPID_PRIVATE_KEY,
  }),
);

app.listen(3000);
// Available endpoints:
// GET  /push/health
// POST /push/send
// POST /push/send-many
```

### Next.js (App Router)

You don't mount an Express router inside Next.js. Instead, use `web-push` directly in Route Handlers. You don't need `web-push-server` as a dependency, only `web-push`:

```bash
pnpm add web-push
```

#### Step 1: Create the configuration file

```js
// lib/webpush.js
import webpush from "web-push";

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY,
);

export default webpush;
```

#### Step 2: Create Route Handlers

```js
// app/api/push/send/route.js
import webpush from "@/lib/webpush";

export async function POST(request) {
  const { subscription, payload } = await request.json();

  if (!subscription || !payload) {
    return Response.json(
      { error: "subscription and payload are required" },
      { status: 400 },
    );
  }

  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return Response.json({ success: true });
  } catch (error) {
    console.error("Error sending notification:", error);
    return Response.json(
      { error: "Error sending notification" },
      { status: 500 },
    );
  }
}
```

```js
// app/api/push/send-many/route.js
import webpush from "@/lib/webpush";

export async function POST(request) {
  const { subscriptions, payload } = await request.json();

  if (!Array.isArray(subscriptions) || subscriptions.length === 0 || !payload) {
    return Response.json(
      { error: "An array of 'subscriptions' and a 'payload' are required." },
      { status: 400 },
    );
  }

  const results = await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(subscription, JSON.stringify(payload));
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }),
  );

  const successCount = results.filter((r) => r.success).length;

  return Response.json({
    success: true,
    total: results.length,
    sent: successCount,
    failed: results.length - successCount,
    results,
  });
}
```

#### Step 3: Environment variables

Add the keys to your `.env.local`:

```env
VAPID_SUBJECT=https://your-domain.com
VAPID_PUBLIC_KEY=BNx4a...
VAPID_PRIVATE_KEY=abc1...
PUSH_SERVER_URL=http://localhost:5500
```

---

## Subscription persistence

This microservice does not store subscriptions. It accepts a subscription and sends a notification. The consuming app is responsible for storing and managing user subscriptions.

### What is a subscription?

When a user consents to notifications the browser returns a `subscription` object shaped like:

```json
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/...",
  "keys": {
    "p256dh": "BNx4a...",
    "auth": "abc1..."
  }
}
```

Your app must store this object to be able to send notifications to that user later.

### Prisma model

#### With local users (app has a `User` table)

```prisma
model PushSubscription {
  id        String   @id @default(cuid())
  endpoint  String   @unique
  keys      Json
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId    String

  @@index([userId])
}
```

- `@relation` links the subscription to a local user. `onDelete: Cascade` removes subscriptions when the user is deleted.

#### With external SSO/IdP (no local `User` table)

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

- `userId` is the user ID from the IdP/SSO (e.g., the `sub` claim). It is stored as a plain string since the users table lives in the IdP.

#### Common fields

- `endpoint` is unique per subscription (a browser + service worker = one endpoint).
- `keys` is stored as JSON (contains `p256dh` and `auth`).
- `userId` allows finding "all subscriptions for user X" to send notifications to all that user's devices.

#### Save subscription (Server Action)

```js
// actions/push.js
"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function subscribePush(subscription) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not authenticated");

  await prisma.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    update: { keys: subscription.keys },
    create: {
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      userId: session.user.id,
    },
  });

  // Send a confirmation notification
  await fetch(process.env.PUSH_SERVER_URL + "/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subscription,
      payload: {
        title: "Notifications enabled",
        body: "You will now receive notifications.",
        url: "/",
      },
    }),
  });
}
```

`upsert` is used by `endpoint` so re-subscriptions update keys instead of creating duplicates. After saving, a confirmation notification is sent.

### Get subscriptions for broadcast

```js
// actions/push.js
"use server";

export async function getPushSubscriptions() {
  const subscriptions = await prisma.pushSubscription.findMany({
    select: { endpoint: true, keys: true },
  });
  return { subscriptions };
}
```

### Send a single notification

From the frontend, get the current browser subscription and POST it to the microservice:

```js
const registration = await navigator.serviceWorker.ready;
const subscription = await registration.pushManager.getSubscription();

if (subscription) {
  await fetch("https://your-push-server.com/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subscription,
      payload: { title: "Hello", body: "Single notification", url: "/" },
    }),
  });
}
```

### Send to all (broadcast)

Get all subscriptions from your DB and call `/send-many`:

```js
const { subscriptions } = await getPushSubscriptions();

if (subscriptions?.length) {
  await fetch("https://your-push-server.com/send-many", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subscriptions,
      payload: {
        title: "Announcement",
        body: "Message for everyone",
        url: "/",
      },
    }),
  });
}
```

---

## Full flow (how it works)

```
┌─────────────┐     ①  Ask permission     ┌─────────────┐
│             │ ◄──────────────────────── │             │
│   Browser   │     ② subscription obj   │   Webapp    │
│  (user)     │ ────────────────────────► │  (frontend) │
│             │                          │             │
└──────┬──────┘                          └──────┬──────┘
       │                                        │
       │                                        │ ③ Save subscription
       │                                        │    to your database
       │                                        │
       │                                        ▼
       │                                 ┌─────────────┐
       │                                 │  Your backend│
       │                                 │  or API route│
       │                                 └──────┬──────┘
       │                                        │
       │                                        │ ④ POST /send with
       │                                        │    subscription + payload
       │                                        ▼
       │                                 ┌─────────────┐
      │                                 │ web-push-server │
      │                                 │  (this repo)    │
       │                                 └──────┬──────┘
       │                                        │
       │         ⑤ Encrypted push with VAPID     │
       │ ◄──────────────────────────────────────┘
       │      (via FCM, Mozilla Push, etc.)
       ▼
  🔔 Notification
```

1. Your frontend asks for permission to send notifications.
2. The browser returns a `subscription` (endpoint URL + encryption keys).
3. You save that subscription in your database (e.g., with Prisma).
4. When you want to notify, your backend sends the subscription + payload to `web-push-server`.
5. `web-push-server` encrypts the message with VAPID keys and sends it to the browser's push service.

### Frontend example (Service Worker)

```js
// Register service worker and subscribe the user
const registration = await navigator.serviceWorker.register("/sw.js");

const subscription = await registration.pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey: "YOUR_VAPID_PUBLIC_KEY",
});

// Save subscription in your DB
await subscribePush(subscription);
```

```js
// sw.js (Service Worker)
self.addEventListener("push", (event) => {
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url));
});
```

### Payload shape

All notifications use this format:

```json
{
  "title": "Notification title",
  "body": "Message body",
  "url": "/click-target"
}
```

The Service Worker reads `title` and `body` to display the notification and `url` to navigate when the user clicks.

---

## Note about iOS (Safari)

On Android and desktop (Chrome, Firefox, Edge), push notifications work by registering a Service Worker — nothing else is required.

**On iOS (Safari 16.4+)** there is an additional requirement: the site must be installed as a PWA (added to the Home Screen). You need a minimal manifest for this:

```json
// public/manifest.json
{
  "name": "Your App",
  "short_name": "App",
  "start_url": "/",
  "display": "standalone",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    }
  ]
}
```

And include it in your `<head>`:

```html
<link rel="manifest" href="/manifest.json" />
```

With that + a Service Worker + the user adding the site to the Home Screen, push notifications work on iOS. Without the manifest and installation, iOS will silently ignore notifications.
