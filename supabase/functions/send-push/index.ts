import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = req.headers.get("Authorization") || "";
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
    const { chat_id, content, message_type } = await req.json();
    if (!chat_id) throw new Error("chat_id is required");
    const admin = createClient(url, service);
    const { data: members, error: membersError } = await admin.from("chat_members").select("user_id").eq("chat_id", chat_id).neq("user_id", user.id);
    if (membersError) throw membersError;
    const recipientIds = (members || []).map((m:any) => m.user_id);
    if (!recipientIds.length) return new Response(JSON.stringify({ sent: 0 }), { headers: { ...cors, "Content-Type": "application/json" } });
    const { data: subscriptions, error: subError } = await admin.from("push_subscriptions").select("id,user_id,endpoint,p256dh,auth").in("user_id", recipientIds);
    if (subError) throw subError;
    const { data: me } = await admin.from("profiles").select("display_name").eq("id", user.id).single();
    webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") || "mailto:admin@example.com", Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);
    let sent = 0;
    for (const sub of subscriptions || []) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify({
          title: me?.display_name || "ГРОЗА", body: message_type === "image" ? "📷 Фото" : message_type === "file" ? `📎 ${content || "Файл"}` : content || "Новое сообщение",
          icon: "/icon-192.png", badge: "/icon-192.png", tag: `groza-${chat_id}`, chatId: chat_id, url: "/"
        }));
        sent++;
      } catch (err:any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) await admin.from("push_subscriptions").delete().eq("id", sub.id);
        else console.error("push failed", err);
      }
    }
    return new Response(JSON.stringify({ sent }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (err:any) {
    return new Response(JSON.stringify({ error: err?.message || String(err) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
