# ГРОЗА v13 — iPhone composer bottom fix
# ГРОЗА — Netlify-ready

## Netlify

Build command: `npm run build`

Publish directory: `dist`

Node: 20 (configured in `netlify.toml`)

SPA fallback is already configured in `netlify.toml`.

### Environment variables

In Netlify → Project configuration → Environment variables add:

- `VITE_SUPABASE_URL` — URL of your Supabase project
- `VITE_SUPABASE_ANON_KEY` — Supabase anon/publishable key

After changing environment variables, trigger a new deploy.

## Supabase

Before using the mobile/realtime features, run `supabase/mobile_realtime.sql` once in the Supabase SQL Editor.

The app expects the existing `create_direct_chat(other_user_id uuid)` RPC from the project schema.


## Netlify note

The app prefers `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` when they are available.
It also contains a fallback to the project's Supabase URL and Publishable key so a Netlify Drop deployment
can connect even when Vite environment variables are not injected into the build. The Publishable key is
designed for browser/client use; never put a Supabase secret/service-role key into the frontend.

## Фотографии

Для отправки фотографий один раз запустите обновлённый файл `supabase/mobile_realtime.sql` в Supabase SQL Editor. Он добавляет поля для медиа и создаёт Storage bucket `chat-media` с ограничением 10 МБ на изображение.

## v36 — голосовые и настоящее удаление медиа
- Удалённое голосовое/фото/файл полностью исчезает из чата.
- Для медиа дополнительно удаляется объект из `chat-media`.
- Голосовые используют MP4/AAC на iPhone/Safari и Opus/WebM на Chrome/Android.
- Запись запрашивает 48 кГц и 128 кбит/с, с подавлением шума/эха.
- Выполните `supabase/v36_media_delete_and_voice.sql` один раз в SQL Editor.
