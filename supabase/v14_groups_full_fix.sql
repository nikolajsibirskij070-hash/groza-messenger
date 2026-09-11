-- ГРОЗА v14 — полное исправление групп, участников и данных группы
-- Запустить ОДИН РАЗ в Supabase SQL Editor.

-- Нужные поля группы.
alter table public.chats add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.chats add column if not exists avatar_url text;

-- Роли.
alter table public.chat_members drop constraint if exists chat_members_role_check;
alter table public.chat_members add constraint chat_members_role_check
check (role in ('owner','admin','moderator','member'));

-- Восстанавливаем owner для групп, где created_by уже известен.
update public.chat_members cm
set role='owner'
from public.chats c
where c.id=cm.chat_id and c.type='group' and c.created_by=cm.user_id and cm.role <> 'owner';

-- Безопасная функция создания группы: создатель + выбранные участники добавляются одной транзакцией.
create or replace function public.create_group_chat(p_title text, p_member_ids uuid[] default '{}')
returns uuid language plpgsql security definer set search_path=public as $$
declare v_chat uuid; v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Not authenticated'; end if;
  if coalesce(trim(p_title),'')='' then raise exception 'Введите название группы'; end if;

  insert into public.chats(type,title,created_by)
  values ('group',trim(p_title),v_user)
  returning id into v_chat;

  insert into public.chat_members(chat_id,user_id,role)
  values (v_chat,v_user,'owner');

  insert into public.chat_members(chat_id,user_id,role)
  select v_chat, x, 'member'
  from unnest(coalesce(p_member_ids,'{}'::uuid[])) x
  where x is not null and x <> v_user
    and exists(select 1 from public.profiles p where p.id=x)
  on conflict(chat_id,user_id) do nothing;

  return v_chat;
end $$;

create or replace function public.group_is_creator(p_chat_id uuid,p_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.chats where id=p_chat_id and type='group' and created_by=p_user_id)
$$;

-- Создатель управляет названием.
create or replace function public.update_group_chat(p_chat_id uuid,p_title text)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.group_is_creator(p_chat_id,auth.uid()) then raise exception 'Только создатель может менять группу'; end if;
 if coalesce(trim(p_title),'')='' then raise exception 'Введите название группы'; end if;
 update public.chats set title=trim(p_title) where id=p_chat_id and type='group';
end $$;

create or replace function public.add_group_members(p_chat_id uuid,p_user_ids uuid[])
returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.group_is_creator(p_chat_id,auth.uid()) then raise exception 'Только создатель может добавлять участников'; end if;
 insert into public.chat_members(chat_id,user_id,role)
 select p_chat_id,x,'member' from unnest(coalesce(p_user_ids,'{}'::uuid[])) x
 where x is not null and exists(select 1 from public.profiles p where p.id=x)
 on conflict(chat_id,user_id) do nothing;
end $$;

create or replace function public.remove_group_member(p_chat_id uuid,p_user_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.group_is_creator(p_chat_id,auth.uid()) then raise exception 'Только создатель может удалять участников'; end if;
 if exists(select 1 from public.chats where id=p_chat_id and created_by=p_user_id) then raise exception 'Нельзя удалить создателя'; end if;
 delete from public.chat_members where chat_id=p_chat_id and user_id=p_user_id;
end $$;

create or replace function public.set_group_member_role(p_chat_id uuid,p_user_id uuid,p_role text)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.group_is_creator(p_chat_id,auth.uid()) then raise exception 'Только создатель может менять роли'; end if;
 if exists(select 1 from public.chats where id=p_chat_id and created_by=p_user_id) then raise exception 'Роль создателя менять нельзя'; end if;
 if p_role not in ('admin','moderator','member') then raise exception 'Недопустимая роль'; end if;
 update public.chat_members set role=p_role where chat_id=p_chat_id and user_id=p_user_id;
end $$;

-- RLS: участник группы может видеть состав своей группы.
alter table public.chat_members enable row level security;
drop policy if exists "members can read memberships" on public.chat_members;
create policy "members can read memberships" on public.chat_members
for select to authenticated
using (public.is_chat_member(chat_id,auth.uid()));

-- Realtime обновляет список и счётчик участников.
do $$ begin
  begin alter publication supabase_realtime add table public.chat_members; exception when duplicate_object then null; end;
end $$;
alter table public.chat_members replica identity full;

-- Права на функции.
revoke all on function public.create_group_chat(text,uuid[]) from public;
grant execute on function public.create_group_chat(text,uuid[]) to authenticated;
grant execute on function public.update_group_chat(uuid,text) to authenticated;
grant execute on function public.add_group_members(uuid,uuid[]) to authenticated;
grant execute on function public.remove_group_member(uuid,uuid) to authenticated;
grant execute on function public.set_group_member_role(uuid,uuid,text) to authenticated;

-- Диагностика: каждая группа и фактическое число участников.
select c.id, c.title, c.created_by, count(cm.user_id) as members_count
from public.chats c
left join public.chat_members cm on cm.chat_id=c.id
where c.type='group'
group by c.id,c.title,c.created_by
order by c.created_at desc;
