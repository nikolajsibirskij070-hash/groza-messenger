begin;

alter table public.push_subscriptions
  add column if not exists endpoint text;

alter table public.push_subscriptions
  add column if not exists p256dh text;

alter table public.push_subscriptions
  add column if not exists auth text;

alter table public.push_subscriptions
  add column if not exists updated_at timestamptz not null default now();

create index if not exists push_subscriptions_user_id_idx_v44
  on public.push_subscriptions(user_id);

commit;
