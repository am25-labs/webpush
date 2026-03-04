# am-webpush

Servidor de notificaciones Web Push con claves VAPID. Se puede usar de dos formas:

1. **Como servidor standalone** — lo levantás en un VPS y le mandás requests desde cualquier app.
2. **Como librería** — lo importás en tu proyecto Express/Next.js y montás las rutas directamente.

---

## Inicio rápido

### 1. Instalación

```bash
# Con pnpm
pnpm add am-webpush

# Con npm
npm install am-webpush
```

### 2. Generar claves VAPID

Las claves VAPID identifican a tu servidor ante los push services de los browsers (Google, Mozilla, Apple). Solo las generás una vez:

```bash
npx am-webpush-generate-vapid
# o si clonaste el repo:
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

Ideal si querés un servicio separado al que tus apps le hagan requests.

### Configurar

Creá un archivo `.env` en la raíz:

```env
VAPID_SUBJECT=mailto:tu@email.com
VAPID_PUBLIC_KEY=BNx4a...
VAPID_PRIVATE_KEY=abc1...
PORT=5500
```

`VAPID_SUBJECT` es una URL de contacto (email o sitio web). Los push services la usan si necesitan contactarte.

### Levantar

```bash
# Si lo instalaste globalmente:
npx am-webpush

# Si clonaste el repo:
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
    vapidSubject: "mailto:tu@email.com",
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

En Next.js no montás un router de Express directamente. En cambio, importás `createPushRouter` y lo usás dentro de un Route Handler.

#### Paso 1: Crear el archivo de configuración

Creá un archivo `lib/webpush.js` (o `lib/webpush.ts`) en tu proyecto Next.js:

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
VAPID_SUBJECT=mailto:tu@email.com
VAPID_PUBLIC_KEY=BNx4a...
VAPID_PRIVATE_KEY=abc1...
```

#### Paso 4: Agregar `web-push` como dependencia

```bash
pnpm add web-push
```

> **Nota**: En el caso de Next.js, no necesitás instalar `am-webpush` como dependencia. Solo necesitás `web-push` directamente, ya que Next.js usa sus propios Route Handlers en vez de un router de Express. Los ejemplos de arriba replican la misma lógica que tiene `am-webpush` internamente.

---

## El flujo completo (cómo funciona)

Si no tenés claro el panorama general, este es el flujo de Web Push de punta a punta:

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
3. Guardás esa subscription en tu base de datos.
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

// Enviar la subscription a tu backend para guardarla
await fetch("/api/subscribe", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(subscription),
});
```

```js
// sw.js (Service Worker)
self.addEventListener("push", (event) => {
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon,
    })
  );
});
```

---

## Licencia

MIT
