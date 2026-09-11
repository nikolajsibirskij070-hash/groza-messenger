-- ГРОЗА v17: безопасное исправление статуса «прочитано»
create or replace function public.mark_chat_read(p_chat_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if not public.is_chat_member(p_chat_id, auth.uid()) then
    raise exception 'Not a chat member';
  end if;

  update public.messages
  set delivered_at = coalesce(delivered_at, now()),
      read_at = now()
  where chat_id = p_chat_id
    and sender_id <> auth.uid()
    and deleted_at is null;
end;
$$;

grant execute on function public.mark_chat_read(uuid) to authenticated;
