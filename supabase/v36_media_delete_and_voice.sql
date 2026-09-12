-- ГРОЗА v36 — удаление медиа + стабильные голосовые
-- Запустить один раз в Supabase → SQL Editor.

update storage.buckets
set public = true,
    file_size_limit = 52428800,
    allowed_mime_types = null
where id = 'chat-media';

drop policy if exists "users delete own chat media" on storage.objects;
create policy "users delete own chat media"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'chat-media'
  and (storage.foldername(name))[2] = auth.uid()::text
);

alter table public.messages replica identity full;
