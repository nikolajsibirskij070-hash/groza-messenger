-- ============================================================
-- ГРОЗА — исправление имён пользователей и доставки сообщений
-- Без удаления существующих сообщений.
-- ============================================================

-- 1. Таблица "скрытых" чатов.
-- Удаление чата из списка больше НЕ удаляет chat_members.
create table if not exists public.hidden_chats (
  user_id uuid not null references public.profiles(id) on delete cascade,
  chat_id uuid not null references public.chats(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, chat_id)
);

alter table public.hidden_chats enable row level security;

drop policy if exists "users manage own hidden chats" on public.hidden_chats;
create policy "users manage own hidden chats"
on public.hidden_chats
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());


-- 2. Безопасная функция проверки участника чата.
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


-- 3. Профили должны читаться авторизованными пользователями,
-- иначе приложение не может показать display_name и @username.
alter table public.profiles enable row level security;

drop policy if exists "profiles readable by authenticated" on public.profiles;
create policy "profiles readable by authenticated"
on public.profiles
for select
to authenticated
using (true);


-- 4. Каждый участник может видеть участников своих чатов.
alter table public.chat_members enable row level security;

drop policy if exists "members can read memberships" on public.chat_members;
create policy "members can read memberships"
on public.chat_members
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_chat_member(chat_id, auth.uid())
);


-- 5. Участники могут читать и отправлять сообщения.
alter table public.messages enable row level security;

drop policy if exists "members read messages" on public.messages;
create policy "members read messages"
on public.messages
for select
to authenticated
using (public.is_chat_member(chat_id, auth.uid()));

drop policy if exists "members send messages" on public.messages;
create policy "members send messages"
on public.messages
for insert
to authenticated
with check (
  sender_id = auth.uid()
  and public.is_chat_member(chat_id, auth.uid())
);


-- 6. Realtime для сообщений и memberships.
do $$
begin
  begin
    alter publication supabase_realtime add table public.messages;
  exception when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.chat_members;
  exception when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.profiles;
  exception when duplicate_object then null;
  end;
end $$;

alter table public.messages replica identity full;
alter table public.chat_members replica identity full;


-- 7. Попытка восстановить ОДНОЗНАЧНО определяемые membership.
-- Это безопасно: добавляется участник только если:
--   * в чате сейчас ровно один участник;
--   * в сообщениях есть ровно один другой sender_id.
-- Чаты, где получателя невозможно определить, этот запрос не угадывает.
with one_member as (
  select chat_id, min(user_id) as member_id
  from public.chat_members
  group by chat_id
  having count(*) = 1
),
candidate as (
  select
    om.chat_id,
    om.member_id,
    min(m.sender_id) as missing_user_id
  from one_member om
  join public.messages m
    on m.chat_id = om.chat_id
   and m.sender_id <> om.member_id
  group by om.chat_id, om.member_id
  having count(distinct m.sender_id) = 1
)
insert into public.chat_members(chat_id, user_id, role)
select chat_id, missing_user_id, 'member'
from candidate
on conflict (chat_id, user_id) do nothing;


-- 8. Диагностика: показывает чаты с менее чем двумя участниками.
select
  c.id as chat_id,
  c.type,
  coalesce(c.title, 'Без названия') as title,
  count(cm.user_id) as members_count
from public.chats c
left join public.chat_members cm on cm.chat_id = c.id
group by c.id, c.type, c.title
having count(cm.user_id) < 2
order by c.created_at desc;
