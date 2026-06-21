import "server-only";
import webpush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

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

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/**
 * Fan-out a push notification to a list of users. Looks up their subscriptions,
 * sends best-effort, and prunes expired endpoints (404/410). No-ops cleanly when
 * VAPID env is absent or the user list is empty.
 */
export async function sendPushToUsers(
  userIds: string[],
  payload: PushPayload
): Promise<void> {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;
  if (userIds.length === 0) return;
  const admin = createAdminClient();
  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .in("user_id", userIds);
  if (!subs || subs.length === 0) return;
  const wp = getWebPush();
  const payloadStr = JSON.stringify(payload);
  const expired: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await wp.sendNotification(
          {
            endpoint: s.endpoint as string,
            keys: { p256dh: s.p256dh as string, auth: s.auth as string },
          },
          payloadStr
        );
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) expired.push(s.endpoint as string);
      }
    })
  );
  if (expired.length > 0) {
    await admin.from("push_subscriptions").delete().in("endpoint", expired);
  }
}
