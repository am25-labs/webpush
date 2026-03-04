# am-webpush

Servidor de notificaciones Web Push con claves VAPID. Se puede usar de dos formas:

1. **Como servidor standalone** — lo levantás en un VPS y le mandás requests desde cualquier app.
2. **Como librería** — lo importás en tu proyecto Express/Next.js y montás las rutas directamente.

---

## Inicio rápido

### 1. Instalación

```bash
# Con pnpm
pnpm install

# Con npm
npm install
```

### 2. Generar claves VAPID

Las claves VAPID identifican a tu servidor ante los push services de los browsers (Google, Mozilla, Apple). Solo las generás una vez:

```bash
pnpm run generate:vapid
```

Esto imprime dos valores:

```
VAPID_PUBLIC_KEY= BNx4a...
VAPID_PRIVATE_KEY= abc1...
```

Guardalos. La **clave pública** la vas a usar en el frontend (para suscribir al usuario). La **clave privada** solo en el servidor.

---

## Modo 1: Servidor standalone

Ideal si querés un servicio separado al que tus apps le hagan requests. Es la forma recomendada si múltiples apps van a compartir el mismo sistema de push.

### Configurar

Creá un archivo `.env` en la raíz (o configurá las variables en tu plataforma de deploy: Dokploy, Vercel, etc.):

```env
VAPID_SUBJECT=https://tudominio.com
VAPID_PUBLIC_KEY=BNx4a...
VAPID_PRIVATE_KEY=abc1...
PORT=5500
```

`VAPID_SUBJECT` es una URL de contacto (`https://...` o `mailto:...`). Los push services la usan si necesitan contactarte.

### Levantar

```bash
pnpm start
```

El servidor queda escuchando en `http://localhost:5500`.

### Endpoints disponibles

#### `GET /health`

Health check.

```bash
curl http://localhost:5500/health
# → { "status": "ok" }
```

#### `POST /send`

Envía una notificación a un usuario.

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
      "title": "Nuevo capítulo",
      "body": "Se subió el capítulo 42 de One Piece"
    }
  }'
# → { "success": true }
```

#### `POST /send-many`

Envía la misma notificación a múltiples usuarios.

```bash
curl -X POST http://localhost:5500/send-many \
  -H "Content-Type: application/json" \
  -d '{
    "subscriptions": [
      { "endpoint": "...", "keys": { "p256dh": "...", "auth": "..." } },
      { "endpoint": "...", "keys": { "p256dh": "...", "auth": "..." } }
    ],
    "payload": {
      "title": "Mantenimiento",
      "body": "El servidor estará en mantenimiento a las 3am"
    }
  }'
# → { "success": true, "total": 2, "sent": 2, "failed": 0, "results": [...] }
```

---

## Modo 2: Como librería

Ideal si ya tenés un servidor Express o una app Next.js y querés montar las rutas de push directamente ahí, sin levantar otro servicio.

### Express

```js
import express from "express";
import { createPushServer } from "am-webpush";

const app = express();
app.use(express.json());

app.use(
  "/push",
  createPushServer({
    vapidSubject: "https://tudominio.com",
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY,
    vapidPrivateKey: process.env.VAPID_PRIVATE_KEY,
  })
);

app.listen(3000);
// Endpoints disponibles:
// GET  /push/health
// POST /push/send
// POST /push/send-many
```

### Next.js (App Router)

En Next.js no montás un router de Express directamente. En cambio, usás `web-push` directamente dentro de Route Handlers. No necesitás instalar `am-webpush` como dependencia, solo `web-push`:

```bash
pnpm add web-push
```

#### Paso 1: Crear el archivo de configuración

```js
// lib/webpush.js
import webpush from "web-push";

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

export default webpush;
```

#### Paso 2: Crear los Route Handlers

```js
// app/api/push/send/route.js
import webpush from "@/lib/webpush";

export async function POST(request) {
  const { subscription, payload } = await request.json();

  if (!subscription || !payload) {
    return Response.json(
      { error: "subscription y payload son requeridos" },
      { status: 400 }
    );
  }

  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    return Response.json({ success: true });
  } catch (error) {
    console.error("Error enviando notificación:", error);
    return Response.json(
      { error: "Error enviando notificación" },
      { status: 500 }
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
      { error: "Se requiere un arreglo de 'subscriptions' y un 'payload'." },
      { status: 400 }
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
    })
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

#### Paso 3: Variables de entorno

Agregá las claves en tu `.env.local`:

```env
VAPID_SUBJECT=https://tudominio.com
VAPID_PUBLIC_KEY=BNx4a...
VAPID_PRIVATE_KEY=abc1...
```

---

## Persistencia de subscriptions

**El microservicio no almacena subscriptions.** Solo recibe una subscription y envía la notificación. La app que lo consume es responsable de guardar y administrar las subscriptions de sus usuarios.

### ¿Qué es una subscription?

Cuando un usuario acepta recibir notificaciones, el browser genera un objeto `subscription` con esta forma:

```json
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/...",
  "keys": {
    "p256dh": "BNx4a...",
    "auth": "abc1..."
  }
}
```

Tu app debe guardar este objeto para poder enviar notificaciones a ese usuario después.

### Modelo de Prisma

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

- `endpoint` es único por subscription (un browser + un service worker = un endpoint).
- `keys` se guarda como JSON (contiene `p256dh` y `auth`).
- `userId` vincula la subscription al usuario. `onDelete: Cascade` limpia las subscriptions si se elimina el usuario.

### Guardar la subscription (Server Action)

```js
// actions/push.js
"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

export async function subscribePush(subscription) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("No autenticado");

  await prisma.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    update: { keys: subscription.keys },
    create: {
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      userId: session.user.id,
    },
  });
}
```

Se usa `upsert` por `endpoint` para que si el usuario se re-suscribe, se actualicen las keys en vez de crear un duplicado.

### Obtener subscriptions para broadcast

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

### Enviar notificación individual

Desde el frontend, obtenés la subscription del browser actual y la mandás al microservicio:

```js
const registration = await navigator.serviceWorker.ready;
const subscription = await registration.pushManager.getSubscription();

if (subscription) {
  await fetch("https://tu-push-server.com/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subscription,
      payload: { title: "Hola", body: "Notificación individual", url: "/" },
    }),
  });
}
```

### Enviar notificación a todos (broadcast)

Desde el frontend o un server action, obtenés todas las subscriptions de la DB y llamás a `/send-many`:

```js
const { subscriptions } = await getPushSubscriptions();

if (subscriptions?.length) {
  await fetch("https://tu-push-server.com/send-many", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subscriptions,
      payload: { title: "Aviso", body: "Mensaje para todos", url: "/" },
    }),
  });
}
```

---

## El flujo completo (cómo funciona)

```
┌─────────────┐     ①  Pedir permiso     ┌─────────────┐
│             │ ◄──────────────────────── │             │
│   Browser   │     ② subscription obj   │  Tu webapp  │
│  (usuario)  │ ────────────────────────► │  (frontend) │
│             │                          │             │
└──────┬──────┘                          └──────┬──────┘
       │                                        │
       │                                        │ ③ Guardar subscription
       │                                        │    en tu base de datos
       │                                        │
       │                                        ▼
       │                                 ┌─────────────┐
       │                                 │  Tu backend  │
       │                                 │  o API route │
       │                                 └──────┬──────┘
       │                                        │
       │                                        │ ④ POST /send con
       │                                        │    subscription + payload
       │                                        ▼
       │                                 ┌─────────────┐
       │                                 │ am-webpush  │
       │                                 │  (este repo) │
       │                                 └──────┬──────┘
       │                                        │
       │         ⑤ Push cifrado con VAPID       │
       │ ◄──────────────────────────────────────┘
       │      (vía FCM, Mozilla Push, etc.)
       ▼
  🔔 Notificación
```

1. Tu frontend pide permiso al usuario para enviar notificaciones.
2. El browser devuelve un objeto `subscription` (un endpoint URL + claves de cifrado).
3. Guardás esa subscription en tu base de datos (con Prisma).
4. Cuando querés notificar, tu backend le manda la subscription + payload a `am-webpush`.
5. `am-webpush` cifra el mensaje con las claves VAPID y lo envía al push service del browser.

### Ejemplo del frontend (Service Worker)

```js
// Registrar service worker y suscribir al usuario
const registration = await navigator.serviceWorker.register("/sw.js");

const subscription = await registration.pushManager.subscribe({
  userVisibleOnly: true,
  applicationServerKey: "TU_VAPID_PUBLIC_KEY",
});

// Guardar la subscription en tu DB
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
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url));
});
```

### Payload shape

Todas las notificaciones usan este formato:

```json
{
  "title": "Título de la notificación",
  "body": "Cuerpo del mensaje",
  "url": "/ruta-al-hacer-click"
}
```

El Service Worker lee `title` y `body` para mostrar la notificación, y `url` para navegar cuando el usuario hace click.

---

## Nota sobre iOS (Safari)

En Android y desktop (Chrome, Firefox, Edge), las push notifications funcionan solo con registrar un Service Worker — no se necesita nada más.

**En iOS (Safari 16.4+)** hay un requisito adicional: el sitio debe estar instalado como PWA (agregado al Home Screen). Para esto necesitás un manifest mínimo:

```json
// public/manifest.json
{
  "name": "Tu App",
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

Y linkearlo en tu `<head>`:

```html
<link rel="manifest" href="/manifest.json" />
```

Con eso + el Service Worker + que el usuario agregue el sitio al Home Screen, las push notifications funcionan en iOS. Sin el manifest y sin estar instalada, iOS ignora las notificaciones silenciosamente.
