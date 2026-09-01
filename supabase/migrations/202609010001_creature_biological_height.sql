-- Canonical biological height is data about the creature, not calibration of a rendered PNG.
-- Existing rows receive the neutral starter/reference height; historical match snapshots remain
-- untouched and are normalized by the client when read.
begin;

alter table public.player_creatures
  add column if not exists height_meters numeric;

update public.player_creatures
set height_meters = case upper(base_creature_key)
  when 'VERDANT_HATCHLING' then 1.4
  when 'AMETHYST_HATCHLING' then 1.4
  else 1.4
end
where height_meters is null
  or height_meters <= 0
  or height_meters = 'NaN'::numeric;

alter table public.player_creatures
  alter column height_meters set default 1.4,
  alter column height_meters set not null;

alter table public.player_creatures
  drop constraint if exists player_creatures_height_meters_check,
  add constraint player_creatures_height_meters_check
    check (height_meters > 0 and height_meters <> 'NaN'::numeric);

-- Current match-creation RPCs construct creature_snapshot server-side. Attach the authoritative
-- height at that boundary so all new snapshots carry it without trusting a client payload.
create or replace function public.attach_creature_height_to_match_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_height_meters numeric;
begin
  if new.creature_id is null then
    return new;
  end if;

  select height_meters
  into v_height_meters
  from public.player_creatures
  where id = new.creature_id;

  if v_height_meters is null then
    return new;
  end if;

  new.creature_snapshot := jsonb_set(
    coalesce(new.creature_snapshot, '{}'::jsonb),
    '{heightMeters}',
    to_jsonb(v_height_meters),
    true
  );

  return new;
end;
$$;

drop trigger if exists players_attach_creature_height_to_snapshot on public.players;
create trigger players_attach_creature_height_to_snapshot
before insert or update of creature_id, creature_snapshot on public.players
for each row execute function public.attach_creature_height_to_match_snapshot();

revoke all on function public.attach_creature_height_to_match_snapshot() from public, anon, authenticated;

notify pgrst, 'reload schema';
commit;
