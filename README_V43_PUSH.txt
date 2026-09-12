ГРОЗА v43 — НАСТОЯЩИЕ PUSH-УВЕДОМЛЕНИЯ

1. В Supabase SQL Editor запустите supabase/v43_push_final.sql.
2. В Supabase Edge Functions откройте send-push и замените код содержимым:
   supabase/functions/send-push/index.ts
   Затем Deploy.
3. В Cloudflare Pages добавьте VITE_VAPID_PUBLIC_KEY = ваш VAPID_PUBLIC_KEY.
4. Сделайте новый Deploy сайта.
5. На устройстве получателя откройте ГРОЗУ и включите Уведомления.
6. На iPhone добавьте ГРОЗУ на экран Домой и разрешите уведомления из установленного веб-приложения.

PRIVATE VAPID KEY НИКОГДА НЕ ДОБАВЛЯЙТЕ В CLOUDFLARE ИЛИ GITHUB.
