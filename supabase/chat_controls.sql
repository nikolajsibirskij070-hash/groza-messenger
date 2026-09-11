-- ГРОЗА: удаление чатов для себя и блокировка пользователей.
-- Выполните этот файл в Supabase SQL Editor.

create table if not exists public.blocked_users (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index if not exists blocked_users_blocked_idx on public.blocked_users(blocked_id);
alter table public.blocked_users enable row level security;

drop policy if exists "users read own blocks" on public.blocked_users;
drop policy if exists "users create own blocks" on public.blocked_users;
drop policy if exists "users remove own blocks" on public.blocked_users;

create policy "users read own blocks"
on public.blocked_users for select to authenticated
using (blocker_id = auth.uid());

create policy "users create own blocks"
on public.blocked_users for insert to authenticated
with check (blocker_id = auth.uid());

create policy "users remove own blocks"
on public.blocked_users for delete to authenticated
using (blocker_id = auth.uid());

-- A user may remove only their own membership. This deletes the chat from their list,
-- without deleting it for the other participant.
drop policy if exists "users can leave own chats" on public.chat_members;
create policy "users can leave own chats"
on public.chat_members for delete to authenticated
using (user_id = auth.uid());

-- Replace the send policy so blocked users cannot send messages in either direction.
drop policy if exists "members send messages" on public.messages;
create policy "members send messages"
on public.messages for insert to authenticated
with check (
  sender_id = auth.uid()
  and public.is_chat_member(messages.chat_id, auth.uid())
  and not exists (
    select 1
    from public.chat_members other
    join public.blocked_users b
      on (b.blocker_id = other.user_id and b.blocked_id = auth.uid())
      or (b.blocker_id = auth.uid() and b.blocked_id = other.user_id)
    where other.chat_id = messages.chat_id
      and other.user_id <> auth.uid()
  )
);

-- Prevent opening a new direct chat when either participant has blocked the other.
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
  if current_user_id is null then raise exception 'Not authenticated'; end if;
  if other_user_id is null or other_user_id = current_user_id then raise exception 'Invalid other user'; end if;
  if not exists (select 1 from public.profiles where id = other_user_id) then raise exception 'User not found'; end if;
  if exists (
    select 1 from public.blocked_users
    where (blocker_id = current_user_id and blocked_id = other_user_id)
       or (blocker_id = other_user_id and blocked_id = current_user_id)
  ) then raise exception 'Messaging is blocked for this user'; end if;

  lock_key := hashtextextended(least(current_user_id::text, other_user_id::text) || ':' || greatest(current_user_id::text, other_user_id::text), 0);
  perform pg_advisory_xact_lock(lock_key);

  select c.id into existing_chat_id
  from public.chats c
  where c.type = 'direct'
    and exists (select 1 from public.chat_members cm where cm.chat_id = c.id and cm.user_id = current_user_id)
    and exists (select 1 from public.chat_members cm where cm.chat_id = c.id and cm.user_id = other_user_id)
    and 2 = (select count(*) from public.chat_members cm where cm.chat_id = c.id)
  order by c.created_at limit 1;
  if existing_chat_id is not null then return existing_chat_id; end if;

  insert into public.chats(type) values('direct') returning id into new_chat_id;
  insert into public.chat_members(chat_id,user_id) values(new_chat_id,current_user_id),(new_chat_id,other_user_id);
  return new_chat_id;
end;
$$;

grant execute on function public.create_direct_chat(uuid) to authenticated;
