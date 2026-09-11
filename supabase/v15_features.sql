-- ГРОЗА v15: ответы, реакции, статусы, печатает, приватность
alter table public.messages add column if not exists reply_to_id uuid references public.messages(id) on delete set null;
alter table public.messages add column if not exists delivered_at timestamptz;
alter table public.messages add column if not exists read_at timestamptz;

create table if not exists public.message_reactions (
 message_id uuid not null references public.messages(id) on delete cascade,
 chat_id uuid not null references public.chats(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 emoji text not null check (char_length(emoji) between 1 and 16),
 created_at timestamptz not null default now(),
 primary key(message_id,user_id,emoji)
);
alter table public.message_reactions enable row level security;
drop policy if exists "members read reactions" on public.message_reactions;
drop policy if exists "members manage own reactions" on public.message_reactions;
create policy "members read reactions" on public.message_reactions for select to authenticated using (public.is_chat_member(chat_id,auth.uid()));
create policy "members manage own reactions" on public.message_reactions for all to authenticated using (user_id=auth.uid() and public.is_chat_member(chat_id,auth.uid())) with check (user_id=auth.uid() and public.is_chat_member(chat_id,auth.uid()));

create table if not exists public.typing_status (
 chat_id uuid not null references public.chats(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 is_typing boolean not null default false,
 updated_at timestamptz not null default now(),
 primary key(chat_id,user_id)
);
alter table public.typing_status enable row level security;
drop policy if exists "members read typing" on public.typing_status;
drop policy if exists "members update own typing" on public.typing_status;
create policy "members read typing" on public.typing_status for select to authenticated using (public.is_chat_member(chat_id,auth.uid()));
create policy "members update own typing" on public.typing_status for all to authenticated using (user_id=auth.uid() and public.is_chat_member(chat_id,auth.uid())) with check (user_id=auth.uid() and public.is_chat_member(chat_id,auth.uid()));

create table if not exists public.privacy_settings (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 allow_messages text not null default 'everyone' check (allow_messages in ('everyone','contacts','nobody')),
 show_online boolean not null default true,
 show_last_seen boolean not null default true,
 updated_at timestamptz not null default now()
);
alter table public.privacy_settings enable row level security;
drop policy if exists "read own privacy" on public.privacy_settings;
drop policy if exists "manage own privacy" on public.privacy_settings;
create policy "read own privacy" on public.privacy_settings for select to authenticated using (user_id=auth.uid());
create policy "manage own privacy" on public.privacy_settings for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());

-- allow username changes while preserving uniqueness from profiles.username unique constraint

do $$ begin
 begin alter publication supabase_realtime add table public.message_reactions; exception when duplicate_object then null; end;
 begin alter publication supabase_realtime add table public.typing_status; exception when duplicate_object then null; end;
end $$;
