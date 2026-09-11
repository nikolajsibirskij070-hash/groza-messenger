-- ГРОЗА v9: группы, файлы, закрепления и подготовка Push

alter table public.messages add column if not exists message_type text default 'text';
alter table public.messages add column if not exists media_url text;
alter table public.messages add column if not exists media_type text;

create table if not exists public.pinned_messages (
  chat_id uuid primary key references public.chats(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  pinned_by uuid not null references public.profiles(id) on delete cascade,
  pinned_at timestamptz not null default now()
);
alter table public.pinned_messages enable row level security;
drop policy if exists "members read pins" on public.pinned_messages;
create policy "members read pins" on public.pinned_messages for select to authenticated using (public.is_chat_member(chat_id, auth.uid()));
drop policy if exists "admins manage pins" on public.pinned_messages;
create policy "admins manage pins" on public.pinned_messages for all to authenticated using (public.is_chat_member(chat_id, auth.uid())) with check (public.is_chat_member(chat_id, auth.uid()));

create or replace function public.create_group_chat(p_title text) returns uuid language plpgsql security definer set search_path=public as $$
declare v_chat uuid; v_user uuid:=auth.uid(); begin
 if v_user is null then raise exception 'Not authenticated'; end if;
 if coalesce(trim(p_title),'')='' then raise exception 'Group title required'; end if;
 insert into public.chats(type,title) values ('group',trim(p_title)) returning id into v_chat;
 insert into public.chat_members(chat_id,user_id,role) values(v_chat,v_user,'admin');
 return v_chat; end $$;
revoke all on function public.create_group_chat(text) from public;
grant execute on function public.create_group_chat(text) to authenticated;

create table if not exists public.push_subscriptions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade, endpoint text not null unique, subscription jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "users manage own push" on public.push_subscriptions;
create policy "users manage own push" on public.push_subscriptions for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

do $$ begin begin alter publication supabase_realtime add table public.pinned_messages; exception when duplicate_object then null; end; end $$;
