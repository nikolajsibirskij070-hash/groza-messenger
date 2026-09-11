-- ГРОЗА: migration for avatars/statuses/notifications/edit-delete support.
-- Safe for the existing database: every ADD uses IF NOT EXISTS.

alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists online boolean not null default false;
alter table public.profiles add column if not exists last_seen timestamptz default now();

alter table public.messages add column if not exists message_type text not null default 'text';
alter table public.messages add column if not exists edited boolean not null default false;
alter table public.messages add column if not exists deleted_at timestamptz;
alter table public.messages add column if not exists updated_at timestamptz not null default now();

create index if not exists profiles_online_idx on public.profiles(online);
create index if not exists messages_updated_idx on public.messages(updated_at);

-- Keep updated_at current when a message is edited/deleted.
create or replace function public.touch_message_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists messages_touch_updated_at on public.messages;
create trigger messages_touch_updated_at
before update on public.messages
for each row execute procedure public.touch_message_updated_at();

-- Realtime is already enabled for messages/chat_members in this project.
-- Profiles are also enabled here so online status changes propagate immediately.
do $$
begin
  begin alter publication supabase_realtime add table public.profiles; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.messages; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.chat_members; exception when duplicate_object then null; end;
end $$;

-- Фотографии в сообщениях.
alter table public.messages add column if not exists media_url text;
alter table public.messages add column if not exists media_type text;
alter table public.messages drop constraint if exists messages_message_type_check;
alter table public.messages add constraint messages_message_type_check check (message_type in ('text','image'));

-- Public bucket with random object names. Uploads are restricted to members of the chat
-- encoded as the first path segment: <chat_id>/<user_id>/<random>.<ext>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-media', 'chat-media', true, 10485760, array['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif'])
on conflict (id) do update set public = true, file_size_limit = 10485760;

drop policy if exists "chat members upload media" on storage.objects;
create policy "chat members upload media"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'chat-media'
  and (storage.foldername(name))[2] = auth.uid()::text
  and public.is_chat_member(((storage.foldername(name))[1])::uuid, auth.uid())
);

-- Reliable uploads from Safari/iPhone: any signed-in user can add an image to chat-media.
drop policy if exists "chat members upload media" on storage.objects;
drop policy if exists "authenticated upload chat media" on storage.objects;
create policy "authenticated upload chat media"
on storage.objects for insert to authenticated
with check (bucket_id = 'chat-media');


-- v8: iPhone photo uploads. Keep MIME types unrestricted because Safari may report HEIC with an empty/non-standard MIME type.
update storage.buckets
set public = true, file_size_limit = 10485760, allowed_mime_types = null
where id = 'chat-media';

drop policy if exists "authenticated upload chat media" on storage.objects;
create policy "authenticated upload chat media"
on storage.objects for insert to authenticated
with check (bucket_id = 'chat-media');

drop policy if exists "public read chat media" on storage.objects;
create policy "public read chat media"
on storage.objects for select to public
using (bucket_id = 'chat-media');
