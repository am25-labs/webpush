import express from "express";
import cors from "cors";
import webpush from "web-push";
import dotenv from "dotenv";
import { createPushRouter } from "./router.js";

dotenv.config();

const PORT = process.env.PORT || 5500;

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(createPushRouter(webpush));

app.listen(PORT, () => {
  console.log(`Push server escuchando en puerto ${PORT}`);
});
