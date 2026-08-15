begin;

create or replace function public.validate_player_profile_link()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nickname text;
begin
  if new.profile_id is null then
    if new.creature_id is not null then
      raise exception 'A creature requires a profile.';
    end if;

    return new;
  end if;

  if new.player_type <> 'HUMAN' then
    raise exception 'Only human players may have a profile.';
  end if;

  if auth.role() <> 'service_role' and auth.uid() is distinct from new.profile_id then
    raise exception 'Profile does not belong to the authenticated user.';
  end if;

  select nickname into v_nickname from public.profiles where id = new.profile_id;
  if v_nickname is null then
    raise exception 'Profile not found.';
  end if;

  if new.creature_id is not null and not exists (
    select 1 from public.player_creatures where id = new.creature_id and profile_id = new.profile_id
  ) then
    raise exception 'Creature does not belong to the profile.';
  end if;

  new.nickname := v_nickname;
  return new;
end;
$$;

commit;