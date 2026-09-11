create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (username ~ '^[A-Za-z0-9_]{3,32}$'),
  display_name text not null check (char_length(display_name) between 1 and 80),
  avatar_url text,
  bio text,
  online boolean not null default false,
  last_seen timestamptz default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'direct' check (type in ('direct','group')),
  name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.chat_members (
  chat_id uuid references public.chats(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key(chat_id,user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid references public.chats(id) on delete cascade not null,
  sender_id uuid references public.profiles(id) on delete cascade not null,
  content text not null check (char_length(content) between 1 and 4000),
  created_at timestamptz not null default now(),
  edited boolean not null default false,
  deleted_at timestamptz,
  message_type text not null default 'text' check (message_type in ('text','image')),
  media_url text,
  media_type text
);

create index if not exists messages_chat_created_idx on public.messages(chat_id,created_at);
create index if not exists chat_members_user_idx on public.chat_members(user_id);

alter table public.profiles add column if not exists online boolean not null default false;
alter table public.profiles add column if not exists last_seen timestamptz default now();
alter table public.profiles enable row level security;
alter table public.chats enable row level security;
alter table public.chat_members enable row level security;
alter table public.messages add column if not exists message_type text not null default 'text';
alter table public.messages add column if not exists media_url text;
alter table public.messages add column if not exists media_type text;
alter table public.messages enable row level security;

-- Recreate policies so this script can safely be run on an existing project.
drop policy if exists "profiles readable by authenticated" on public.profiles;
drop policy if exists "own profile insert" on public.profiles;
drop policy if exists "own profile update" on public.profiles;
drop policy if exists "members can read chats" on public.chats;
drop policy if exists "authenticated can create chats" on public.chats;
drop policy if exists "members can read memberships" on public.chat_members;
drop policy if exists "users can join chats" on public.chat_members;
drop policy if exists "chat creators can add members" on public.chat_members;
drop policy if exists "members read messages" on public.messages;
drop policy if exists "members send messages" on public.messages;
drop policy if exists "own messages update" on public.messages;
drop policy if exists "own messages delete" on public.messages;

-- SECURITY DEFINER helper prevents recursive RLS checks when a policy needs to
-- ask whether the current user belongs to a chat.
create or replace function public.is_chat_member(p_chat_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.chat_members cm
    where cm.chat_id = p_chat_id
      and cm.user_id = p_user_id
  );
$$;

revoke all on function public.is_chat_member(uuid, uuid) from public;
grant execute on function public.is_chat_member(uuid, uuid) to authenticated;

create policy "profiles readable by authenticated"
on public.profiles for select to authenticated
using (true);

create policy "own profile insert"
on public.profiles for insert to authenticated
with check (id = auth.uid());

create policy "own profile update"
on public.profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- Clients do NOT insert chats directly. Chat creation is done by create_direct_chat().
create policy "members can read chats"
on public.chats for select to authenticated
using (public.is_chat_member(chats.id, auth.uid()));

create policy "members can read memberships"
on public.chat_members for select to authenticated
using (user_id = auth.uid() or public.is_chat_member(chat_members.chat_id, auth.uid()));

-- No direct INSERT policy on chat_members. Membership is created atomically by the RPC.

create policy "members read messages"
on public.messages for select to authenticated
using (public.is_chat_member(messages.chat_id, auth.uid()));

create policy "members send messages"
on public.messages for insert to authenticated
with check (sender_id = auth.uid() and public.is_chat_member(messages.chat_id, auth.uid()));

create policy "own messages update"
on public.messages for update to authenticated
using (sender_id = auth.uid())
with check (sender_id = auth.uid());

create policy "own messages delete"
on public.messages for delete to authenticated
using (sender_id = auth.uid());

-- Keep profiles in sync with Supabase Auth. This also avoids relying on a client-side
-- profile insert immediately after signup, when the auth transaction may still be settling.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_display_name text;
begin
  v_username := lower(trim(coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1), 'user')));
  v_username := regexp_replace(v_username, '[^a-z0-9_]', '', 'g');
  if length(v_username) < 3 then
    v_username := 'user_' || substr(replace(new.id::text, '-', ''), 1, 12);
  end if;
  v_username := left(v_username, 32);

  v_display_name := trim(coalesce(
    new.raw_user_meta_data ->> 'display_name',
    new.raw_user_meta_data ->> 'username',
    v_username,
    'Пользователь'
  ));

  insert into public.profiles (id, username, display_name)
  values (new.id, v_username, left(v_display_name, 80))
  on conflict (id) do update
    set display_name = excluded.display_name;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- The only way the browser creates a direct chat.
-- It is atomic: chat + both members are created in one database transaction.
create or replace function public.create_direct_chat(other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  existing_chat_id uuid;
  new_chat_id uuid;
  lock_key bigint;
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if other_user_id is null or other_user_id = current_user_id then
    raise exception 'Invalid other user';
  end if;

  if not exists (select 1 from public.profiles where id = other_user_id) then
    raise exception 'User not found';
  end if;

  -- Serialize creation for the same pair so two fast clicks cannot create duplicates.
  lock_key := hashtextextended(
    least(current_user_id::text, other_user_id::text) || ':' ||
    greatest(current_user_id::text, other_user_id::text),
    0
  );
  perform pg_advisory_xact_lock(lock_key);

  select c.id
    into existing_chat_id
  from public.chats c
  where c.type = 'direct'
    and exists (
      select 1 from public.chat_members cm
      where cm.chat_id = c.id and cm.user_id = current_user_id
    )
    and exists (
      select 1 from public.chat_members cm
      where cm.chat_id = c.id and cm.user_id = other_user_id
    )
    and 2 = (
      select count(*) from public.chat_members cm where cm.chat_id = c.id
    )
  order by c.created_at
  limit 1;

  if existing_chat_id is not null then
    return existing_chat_id;
  end if;

  insert into public.chats (type)
  values ('direct')
  returning id into new_chat_id;

  insert into public.chat_members (chat_id, user_id)
  values
    (new_chat_id, current_user_id),
    (new_chat_id, other_user_id);

  return new_chat_id;
end;
$$;

grant execute on function public.create_direct_chat(uuid) to authenticated;

-- Realtime setup without failing if the tables are already members of the publication.
do $$
begin
  begin
    alter publication supabase_realtime add table public.messages;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.profiles;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.chat_members;
  exception when duplicate_object then null;
  end;
end $$;


-- Photo storage (run as part of the schema).
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
