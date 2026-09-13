-- ГРОЗА v45 — надёжные опросы в группах и видимые закрепления
-- Выполните этот файл в Supabase SQL Editor один раз.

alter table public.messages drop constraint if exists messages_message_type_check;
alter table public.messages add constraint messages_message_type_check
  check (message_type in ('text','image','file','poll','voice','video'));

create table if not exists public.chat_pins (
  chat_id uuid not null references public.chats(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  pinned_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (chat_id, message_id)
);
alter table public.chat_pins enable row level security;
drop policy if exists "members read pins" on public.chat_pins;
create policy "members read pins" on public.chat_pins for select
using (public.is_chat_member(chat_id, auth.uid()));
drop policy if exists "members create pins" on public.chat_pins;
create policy "members create pins" on public.chat_pins for insert
with check (pinned_by = auth.uid() and public.is_chat_member(chat_id, auth.uid()));
drop policy if exists "members delete pins" on public.chat_pins;
create policy "members delete pins" on public.chat_pins for delete
using (pinned_by = auth.uid() or public.is_chat_member(chat_id, auth.uid()));
alter table public.chat_pins replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.chat_pins;
exception when duplicate_object then null; end $$;

create table if not exists public.poll_votes (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  option_index integer not null check (option_index >= 0 and option_index < 20),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
alter table public.poll_votes enable row level security;
drop policy if exists "members read poll votes" on public.poll_votes;
create policy "members read poll votes" on public.poll_votes for select using (
  exists (select 1 from public.messages m where m.id=message_id and public.is_chat_member(m.chat_id, auth.uid()))
);
drop policy if exists "members vote polls" on public.poll_votes;
create policy "members vote polls" on public.poll_votes for insert with check (
  user_id=auth.uid() and exists (
    select 1 from public.messages m where m.id=message_id and public.is_chat_member(m.chat_id, auth.uid())
  )
);
drop policy if exists "members change own poll vote" on public.poll_votes;
create policy "members change own poll vote" on public.poll_votes for update using (user_id=auth.uid()) with check (user_id=auth.uid());
alter table public.poll_votes replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.poll_votes;
exception when duplicate_object then null; end $$;
