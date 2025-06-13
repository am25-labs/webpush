import express from "express";
import cors from "cors";
import webpush from "web-push";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Configurar VAPID
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Endpoint de salud
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Endpoint para enviar notificaciones push
app.post("/send", async (req, res) => {
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

app.listen(PORT, () => {
  console.log(`Push server escuchando en puerto ${PORT}`);
});
