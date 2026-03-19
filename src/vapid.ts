import webpush from "web-push";

function generateVapidKeys(): void {
  const vapidKeys = webpush.generateVAPIDKeys();
  console.log("VAPID_PUBLIC_KEY=", vapidKeys.publicKey);
  console.log("VAPID_PRIVATE_KEY=", vapidKeys.privateKey);
}

generateVapidKeys();
