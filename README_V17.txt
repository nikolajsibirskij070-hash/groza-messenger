ГРОЗА v17

Исправлено:
1. На мобильных интерфейс занимает весь экран до самого низа, без белой полосы.
2. Добавлен настоящий Web Push через Service Worker. Уведомления могут приходить при закрытой вкладке/сайте, если браузер и ОС поддерживают Web Push и приложение разрешило уведомления.

ВАЖНО ДЛЯ PUSH:
Нужен один Supabase SQL-файл: supabase/v17_push_notifications.sql
И Edge Function: supabase/functions/send-push/index.ts
Также нужно задать VAPID_PUBLIC_KEY в Cloudflare как VITE_VAPID_PUBLIC_KEY и VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/VAPID_SUBJECT в Supabase secrets.

После этого Cloudflare Pages автоматически собирает фронтенд.
