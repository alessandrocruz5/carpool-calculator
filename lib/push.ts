import "server-only";
import webpush from "web-push";

let configured = false;

export function getWebPush() {
  if (!configured) {
    const pub = process.env.VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    const subj = process.env.VAPID_SUBJECT || "mailto:driver@example.com";
    if (!pub || !priv) {
      throw new Error("VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not configured");
    }
    webpush.setVapidDetails(subj, pub, priv);
    configured = true;
  }
  return webpush;
}
