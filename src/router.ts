import { Router, Request, Response, NextFunction } from "express";
import type webpush from "web-push";

export interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  [key: string]: unknown;
}

export interface PushRouterOptions {
  apiKey?: string;
}

interface SendBody {
  subscription: PushSubscription;
  payload: PushPayload;
}

interface SendManyBody {
  subscriptions: PushSubscription[];
  payload: PushPayload;
}

function requireApiKey(apiKey: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;

    if (!header || header !== `Bearer ${apiKey}`) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    next();
  };
}

export function createPushRouter(wp: typeof webpush, options: PushRouterOptions = {}): Router {
  const router = Router();

  router.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  if (options.apiKey) {
    router.use(["/send", "/send-many"], requireApiKey(options.apiKey));
  }

  router.post("/send", async (req: Request, res: Response) => {
    const { subscription, payload } = req.body as SendBody;

    if (!subscription || !payload) {
      res.status(400).json({ error: "subscription y payload son requeridos" });
      return;
    }

    try {
      await wp.sendNotification(subscription, JSON.stringify(payload));
      res.json({ success: true });
    } catch (error) {
      console.error("Error enviando notificación:", error);
      res.status(500).json({ error: "Error enviando notificación" });
    }
  });

  router.post("/send-many", async (req: Request, res: Response) => {
    const { subscriptions, payload } = req.body as SendManyBody;

    if (!Array.isArray(subscriptions) || subscriptions.length === 0 || !payload) {
      res.status(400).json({
        error: "Se requiere un arreglo de 'subscriptions' y un 'payload'.",
      });
      return;
    }

    const results = await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await wp.sendNotification(subscription, JSON.stringify(payload));
          return { success: true as const };
        } catch (error) {
          console.error("Error enviando a una subscripción:", error);
          return {
            success: false as const,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      })
    );

    const successCount = results.filter((r) => r.success).length;
    const errorCount = results.length - successCount;

    res.json({
      success: true,
      total: results.length,
      sent: successCount,
      failed: errorCount,
      results,
    });
  });

  return router;
}
