import { createClient } from "@supabase/supabase-js";

// Vite/Netlify variables are preferred. The fallback values keep the Drop deployment
// usable when environment variables were not embedded into the client build.
const envUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
const envKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();

const url = envUrl || "https://xfqstyhaoqkbskszrnyg.supabase.co";
const key = envKey || "sb_publishable_06-XuQi5QNc_cwPQY1kFQw_KgkQpRrV";

export let supabase: ReturnType<typeof createClient> | null = null;
export let configured = false;

try {
  if (url && key) {
    supabase = createClient(url, key);
    configured = true;
  }
} catch (err) {
  console.error("ГРОЗА: не удалось инициализировать Supabase", err);
}
