import webpush from "web-push";
import { createPushRouter } from "./src/router.js";

export function createPushServer({ vapidSubject, vapidPublicKey, vapidPrivateKey }) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  return createPushRouter(webpush);
}

export { createPushRouter };
