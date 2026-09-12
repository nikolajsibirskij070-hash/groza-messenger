-- ГРОЗА v28: закрепления, опросы и эмодзи-статус
alter table public.profiles add column if not exists emoji_status text;

create table if not exists public.chat_pins (
  chat_id uuid not null references public.chats(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  pinned_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (chat_id, message_id)
);
alter table public.chat_pins enable row level security;
drop policy if exists "members read pins" on public.chat_pins;
create policy "members read pins" on public.chat_pins for select using (public.is_chat_member(chat_id, auth.uid()));
drop policy if exists "members manage pins" on public.chat_pins;
create policy "members manage pins" on public.chat_pins for all using (public.is_chat_member(chat_id, auth.uid())) with check (public.is_chat_member(chat_id, auth.uid()));

alter table public.messages drop constraint if exists messages_message_type_check;
alter table public.messages add constraint messages_message_type_check check (message_type in ('text','image','file','poll','voice','video'));

-- Realtime для закреплений
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
  user_id=auth.uid() and exists (select 1 from public.messages m where m.id=message_id and public.is_chat_member(m.chat_id, auth.uid()))
);
drop policy if exists "members change own poll vote" on public.poll_votes;
create policy "members change own poll vote" on public.poll_votes for update using (user_id=auth.uid()) with check (user_id=auth.uid());
alter table public.poll_votes replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.poll_votes;
exception when duplicate_object then null; end $$;
