begin;

create or replace function public.delete_my_creature_lineage(p_lineage_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_profile_id uuid := auth.uid();
  v_active_lineage_id uuid;
  v_replacement_lineage_id uuid;
begin
  if v_profile_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;

  select active_lineage_id into v_active_lineage_id
  from public.profiles
  where id = v_profile_id
  for update;

  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  if not exists (
    select 1 from public.creature_lineages
    where id = p_lineage_id and profile_id = v_profile_id
  ) then raise exception 'LINEAGE_NOT_OWNED'; end if;

  select id into v_replacement_lineage_id
  from public.creature_lineages
  where profile_id = v_profile_id and id <> p_lineage_id
  order by created_at, id
  limit 1;

  if v_replacement_lineage_id is null then raise exception 'CANNOT_DELETE_LAST_LINEAGE'; end if;

  if v_active_lineage_id = p_lineage_id then
    update public.profiles
    set active_lineage_id = v_replacement_lineage_id
    where id = v_profile_id;
    v_active_lineage_id := v_replacement_lineage_id;
  end if;

  delete from public.creature_lineages
  where id = p_lineage_id and profile_id = v_profile_id;

  return v_active_lineage_id;
end;
$$;

revoke execute on function public.delete_my_creature_lineage(uuid) from public, anon;
grant execute on function public.delete_my_creature_lineage(uuid) to authenticated;

commit;