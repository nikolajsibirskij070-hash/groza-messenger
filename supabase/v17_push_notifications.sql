-- ГРОЗА v17: подписки Web Push
create table if not exists public.push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "users manage own push subscriptions" on public.push_subscriptions;
create policy "users manage own push subscriptions" on public.push_subscriptions
for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Optional cleanup helper for invalid subscriptions.
create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions(user_id);
