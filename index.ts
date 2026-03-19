import webpush from "web-push";
import { createPushRouter } from "./src/router.js";

export type { PushSubscription, PushPayload } from "./src/router.js";
export { createPushRouter } from "./src/router.js";

export interface PushServerOptions {
  vapidSubject: string;
  vapidPublicKey: string;
  vapidPrivateKey: string;
}

export function createPushServer({
  vapidSubject,
  vapidPublicKey,
  vapidPrivateKey,
}: PushServerOptions) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  return createPushRouter(webpush);
}
