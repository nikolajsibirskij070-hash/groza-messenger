-- ГРОЗА v30 — исправление закрепления сообщений
-- Без emoji_status и без изменения настроек цвета сообщений.

create table if not exists public.chat_pins (
  chat_id uuid not null references public.chats(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  pinned_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (chat_id, message_id)
);

alter table public.chat_pins enable row level security;

drop policy if exists "members read pins" on public.chat_pins;
create policy "members read pins"
on public.chat_pins for select
using (public.is_chat_member(chat_id, auth.uid()));

drop policy if exists "members create pins" on public.chat_pins;
create policy "members create pins"
on public.chat_pins for insert
with check (
  pinned_by = auth.uid()
  and public.is_chat_member(chat_id, auth.uid())
);

drop policy if exists "members delete pins" on public.chat_pins;
create policy "members delete pins"
on public.chat_pins for delete
using (
  pinned_by = auth.uid()
  or public.is_chat_member(chat_id, auth.uid())
);

alter table public.chat_pins replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.chat_pins;
exception when duplicate_object then null;
end $$;
