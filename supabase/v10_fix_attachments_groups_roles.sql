-- ГРОЗА v10: исправление файлов/фото и полноценное управление группами

-- 1) Разрешаем тип file. Это исправляет ошибку messages_message_type_check.
alter table public.messages drop constraint if exists messages_message_type_check;
alter table public.messages add constraint messages_message_type_check
check (message_type in ('text','image','file'));

-- 2) Роли участников.
alter table public.chat_members drop constraint if exists chat_members_role_check;
alter table public.chat_members add constraint chat_members_role_check
check (role in ('admin','moderator','member'));

-- 3) Создание группы сразу с выбранными участниками.
create or replace function public.create_group_chat(p_title text, p_member_ids uuid[] default '{}')
returns uuid language plpgsql security definer set search_path=public as $$
declare v_chat uuid; v_user uuid:=auth.uid(); begin
 if v_user is null then raise exception 'Not authenticated'; end if;
 if coalesce(trim(p_title),'')='' then raise exception 'Group title required'; end if;
 insert into public.chats(type,title) values ('group',trim(p_title)) returning id into v_chat;
 insert into public.chat_members(chat_id,user_id,role) values(v_chat,v_user,'admin');
 if coalesce(array_length(p_member_ids,1),0)>0 then
   insert into public.chat_members(chat_id,user_id,role)
   select v_chat, x, 'member' from unnest(p_member_ids) x
   where x<>v_user and exists(select 1 from public.profiles p where p.id=x)
   on conflict(chat_id,user_id) do nothing;
 end if;
 return v_chat;
end $$;

create or replace function public.group_is_admin(p_chat_id uuid,p_user_id uuid default auth.uid()) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.chat_members where chat_id=p_chat_id and user_id=p_user_id and role='admin');
$$;

create or replace function public.update_group_chat(p_chat_id uuid,p_title text)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.group_is_admin(p_chat_id,auth.uid()) then raise exception 'Только администратор может менять группу'; end if;
 if coalesce(trim(p_title),'')='' then raise exception 'Введите название группы'; end if;
 update public.chats set title=trim(p_title) where id=p_chat_id and type='group';
end $$;

create or replace function public.add_group_members(p_chat_id uuid,p_user_ids uuid[])
returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.group_is_admin(p_chat_id,auth.uid()) then raise exception 'Только администратор может добавлять участников'; end if;
 insert into public.chat_members(chat_id,user_id,role)
 select p_chat_id,x,'member' from unnest(coalesce(p_user_ids,'{}'::uuid[])) x
 where exists(select 1 from public.profiles p where p.id=x)
 on conflict(chat_id,user_id) do nothing;
end $$;

create or replace function public.remove_group_member(p_chat_id uuid,p_user_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.group_is_admin(p_chat_id,auth.uid()) then raise exception 'Только администратор может удалять участников'; end if;
 if p_user_id=auth.uid() then raise exception 'Создатель не может удалить себя из управления'; end if;
 delete from public.chat_members where chat_id=p_chat_id and user_id=p_user_id;
end $$;

create or replace function public.set_group_member_role(p_chat_id uuid,p_user_id uuid,p_role text)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.group_is_admin(p_chat_id,auth.uid()) then raise exception 'Только администратор может менять роли'; end if;
 if p_role not in ('admin','moderator','member') then raise exception 'Недопустимая роль'; end if;
 update public.chat_members set role=p_role where chat_id=p_chat_id and user_id=p_user_id;
end $$;

revoke all on function public.create_group_chat(text,uuid[]) from public;
grant execute on function public.create_group_chat(text,uuid[]) to authenticated;
grant execute on function public.update_group_chat(uuid,text) to authenticated;
grant execute on function public.add_group_members(uuid,uuid[]) to authenticated;
grant execute on function public.remove_group_member(uuid,uuid) to authenticated;
grant execute on function public.set_group_member_role(uuid,uuid,text) to authenticated;
