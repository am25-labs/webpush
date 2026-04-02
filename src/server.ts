import express from "express";
import cors from "cors";
import webpush from "web-push";
import dotenv from "dotenv";
import { createPushRouter } from "./router.js";

dotenv.config();

const required = ["VAPID_SUBJECT", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "API_KEY"] as const;
const missing = required.filter((k) => !process.env[k]);

if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(", ")}`);
  console.error("Copy .env.example to .env and fill in the values, or run: create-webpush");
  process.exit(1);
}

const PORT = process.env.PORT || 5500;

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(createPushRouter(webpush, { apiKey: process.env.API_KEY }));

app.listen(PORT, () => {
  console.log(`Push server running on port ${PORT}`);
});
