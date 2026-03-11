# web-push-server

Simple **Web Push notification server** built with Express.

It can be used in two ways:

1. **Standalone service** — run this repo as a microservice and send HTTP requests to it.
2. **Reference implementation** — reuse the endpoint logic inside your own backend (Next.js, Express, etc.).

The server **does not store subscriptions**. Your application is responsible for storing them.

---

# Quick Start

Install dependencies:

```bash
pnpm install
# or
npm install
```

Create a `.env` file:

```env
VAPID_SUBJECT=https://your-domain.com
VAPID_PUBLIC_KEY=BNx4a...
VAPID_PRIVATE_KEY=abc1...
PORT=5500
```

Start the server:

```bash
pnpm start
```

The API will be available at:

```
http://localhost:5500
```

---

# API

## Health check

```
GET /health
```

Response:

```json
{ "status": "ok" }
```

---

## Send notification

Send a notification to a single subscription.

```
POST /send
```

```json
{
  "subscription": {
    "endpoint": "...",
    "keys": {
      "p256dh": "...",
      "auth": "..."
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

## Send to multiple subscriptions

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
  "failed": 0
}
```

---

# Usage

## 1. Standalone server (recommended)

Run this repository as a separate push service.

Your apps send HTTP requests to it whenever they want to deliver a notification.

```
App → HTTP → web-push-server → Push Service → Browser
```

Example:

```js
await fetch("https://your-push-server.com/send", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    subscription,
    payload: {
      title: "Hello",
      body: "New message",
      url: "/"
    }
  })
});
```

This approach is recommended if:

* multiple apps share the same push system
* you want one place to manage VAPID keys
* you prefer a dedicated microservice

---

## 2. Embedded in your backend

If your application already has a backend (Express, Next.js, etc.), you can implement the same endpoints directly instead of running this server separately.

This repository can be used as a **reference implementation** for that logic.

Example with a **Next.js Route Handler**:

```js
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

  await webpush.sendNotification(
    subscription,
    JSON.stringify(payload)
  );

  return Response.json({ success: true });
}
```

---

# Subscription storage

This server **does not store subscriptions**.

Your application must store them in a database so notifications can be sent later.

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

Example **Prisma model**:

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

This allows you to retrieve all subscriptions for a user and send notifications to all their devices.

---

# Example broadcast

```js
await fetch("https://your-push-server.com/send-many", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    subscriptions,
    payload: {
      title: "Announcement",
      body: "Message for everyone",
      url: "/"
    }
  })
});
```

---

# iOS (Safari) note

Push notifications on **iOS Safari (16.4+)** only work if the site is installed as a **PWA**.

Minimal manifest example:

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
<link rel="manifest" href="/manifest.json">
```

Without installing the site on the Home Screen, iOS will ignore push notifications.
