import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY")!;
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY")!;
    const vapidSubject = Deno.env.get("VAPID_SUBJECT")!;
    if (!vapidPublicKey || !vapidPrivateKey || !vapidSubject) throw new Error("VAPID secrets are not configured");

    const authorization = req.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const { chat_id, content, message_type = "text" } = await req.json();
    if (!chat_id) throw new Error("chat_id is required");

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: membership, error: membershipError } = await admin.from("chat_members").select("user_id").eq("chat_id", chat_id).eq("user_id", user.id).maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) return new Response(JSON.stringify({ error: "You are not a member of this chat" }), { status: 403, headers: corsHeaders });

    const { data: members, error: membersError } = await admin.from("chat_members").select("user_id").eq("chat_id", chat_id).neq("user_id", user.id);
    if (membersError) throw membersError;
    const recipientIds = [...new Set((members || []).map((m: { user_id: string }) => m.user_id))];
    if (!recipientIds.length) return new Response(JSON.stringify({ success: true, sent: 0 }), { headers: corsHeaders });

    const { data: subscriptions, error: subscriptionsError } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth, subscription").in("user_id", recipientIds);
    if (subscriptionsError) throw subscriptionsError;

    const { data: profile } = await admin.from("profiles").select("display_name, username").eq("id", user.id).maybeSingle();
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    const body = message_type === "image" || message_type === "photo" ? "📷 Фото" :
      message_type === "voice" || message_type === "audio" ? "🎤 Голосовое сообщение" :
      message_type === "file" ? `📎 ${content || "Файл"}` :
      message_type === "video" ? "🎬 Видео" : content || "Новое сообщение";

    let sent = 0;
    for (const row of subscriptions || []) {
      const stored = row.subscription || {};
      const endpoint = row.endpoint || stored.endpoint;
      const p256dh = row.p256dh || stored?.keys?.p256dh;
      const auth = row.auth || stored?.keys?.auth;
      if (!endpoint || !p256dh || !auth) continue;
      try {
        await webpush.sendNotification({ endpoint, keys: { p256dh, auth } }, JSON.stringify({
          title: profile?.display_name || profile?.username || "ГРОЗА",
          body,
          icon: "/icon-192.png",
          badge: "/icon-192.png",
          tag: `groza-${chat_id}`,
          chatId: chat_id,
          url: `/?chat=${encodeURIComponent(chat_id)}`,
        }));
        sent++;
      } catch (error: any) {
        if (error?.statusCode === 404 || error?.statusCode === 410) await admin.from("push_subscriptions").delete().eq("id", row.id);
        else console.error("Push failed", error);
      }
    }
    return new Response(JSON.stringify({ success: true, sent }), { headers: corsHeaders });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }), { status: 500, headers: corsHeaders });
  }
});
