import webPush from "web-push";
import type { PushSubscriptionJson } from "@maestro-oss/shared";
import { config } from "./config.js";

let configured = false;

function ensureConfigured(): boolean {
  if (configured) return true;
  const { publicKey, privateKey, subject } = config.vapid;
  if (!publicKey || !privateKey) return false;
  webPush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export async function sendPush(
  subscription: PushSubscriptionJson,
  payload: { title: string; body: string },
): Promise<void> {
  if (!ensureConfigured()) {
    throw new Error(
      "VAPID keys not set — run `npm run gen:vapid` and set VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY",
    );
  }
  await webPush.sendNotification(subscription, JSON.stringify(payload));
}
