import { Router } from "express";

export function createPushRouter(webpush) {
  const router = Router();

  router.get("/health", (req, res) => {
    res.json({ status: "ok" });
  });

  router.post("/send", async (req, res) => {
    const { subscription, payload } = req.body;

    if (!subscription || !payload) {
      return res
        .status(400)
        .json({ error: "subscription y payload son requeridos" });
    }

    try {
      await webpush.sendNotification(subscription, JSON.stringify(payload));
      res.json({ success: true });
    } catch (error) {
      console.error("Error enviando notificación:", error);
      res.status(500).json({ error: "Error enviando notificación" });
    }
  });

  router.post("/send-many", async (req, res) => {
    const { subscriptions, payload } = req.body;

    if (!Array.isArray(subscriptions) || subscriptions.length === 0 || !payload) {
      return res.status(400).json({
        error: "Se requiere un arreglo de 'subscriptions' y un 'payload'.",
      });
    }

    const results = await Promise.all(
      subscriptions.map(async (subscription) => {
        try {
          await webpush.sendNotification(subscription, JSON.stringify(payload));
          return { success: true };
        } catch (error) {
          console.error("Error enviando a una subscripción:", error);
          return { success: false, error: error.message };
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
