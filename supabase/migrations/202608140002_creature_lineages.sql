-- A profile owns one or more named evolutionary lineages.  A lineage owns exactly
-- one persistent creature record; visual versions and Flux metadata keep their
-- existing creature foreign keys and are annotated with the lineage for integrity.
begin;

create table if not exists public.creature_lineages (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  name text,
  base_creature_key text not null default 'VERDANT_HATCHLING',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists creature_lineages_profile_created_idx
  on public.creature_lineages(profile_id, created_at);

alter table public.player_creatures
  drop constraint if exists player_creatures_profile_id_key,
  add column if not exists lineage_id uuid;

-- Every legacy creature becomes the first lineage of its profile. This only creates
-- relational metadata: asset paths, versions and requests remain the same rows.
insert into public.creature_lineages (profile_id, name, base_creature_key)
select c.profile_id, coalesce(nullif(c.name, ''), 'Stirpe iniziale'), c.base_creature_key
from public.player_creatures c
where c.lineage_id is null
  and not exists (
    select 1 from public.creature_lineages l
    where l.profile_id = c.profile_id and l.base_creature_key = c.base_creature_key
  );

update public.player_creatures c
set lineage_id = (
  select l.id from public.creature_lineages l
  where l.profile_id = c.profile_id and l.base_creature_key = c.base_creature_key
  order by created_at, id
  limit 1
)
where c.lineage_id is null;

alter table public.player_creatures
  alter column lineage_id set not null,
  drop constraint if exists player_creatures_lineage_id_fkey,
  add constraint player_creatures_lineage_id_fkey foreign key (lineage_id)
    references public.creature_lineages(id) on delete cascade;
create unique index if not exists player_creatures_one_creature_per_lineage_idx
  on public.player_creatures(lineage_id);
create index if not exists player_creatures_profile_lineage_idx
  on public.player_creatures(profile_id, lineage_id);

-- Keep the progression domain explicitly scoped to a lineage. Existing RPCs still pass
-- creature IDs, so the trigger derives the same lineage server-side and rejects mismatches.
alter table public.creature_visual_versions add column if not exists lineage_id uuid references public.creature_lineages(id) on delete cascade;
alter table public.creature_visual_progress_tracks add column if not exists lineage_id uuid references public.creature_lineages(id) on delete cascade;
alter table public.creature_transformation_requests add column if not exists lineage_id uuid references public.creature_lineages(id) on delete cascade;
alter table public.creature_evolution_target_progress add column if not exists lineage_id uuid references public.creature_lineages(id) on delete cascade;

update public.creature_visual_versions v set lineage_id = c.lineage_id from public.player_creatures c where c.id = v.creature_id and v.lineage_id is null;
update public.creature_visual_progress_tracks t set lineage_id = c.lineage_id from public.player_creatures c where c.id = t.creature_id and t.lineage_id is null;
update public.creature_transformation_requests r set lineage_id = c.lineage_id from public.player_creatures c where c.id = r.creature_id and r.lineage_id is null;
update public.creature_evolution_target_progress p set lineage_id = c.lineage_id from public.player_creatures c where c.id = p.creature_id and p.lineage_id is null;

create or replace function public.scope_creature_progression_to_lineage()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_lineage_id uuid;
begin
  select lineage_id into v_lineage_id from public.player_creatures where id = new.creature_id and profile_id = new.profile_id;
  if v_lineage_id is null then raise exception 'CREATURE_NOT_OWNED'; end if;
  if new.lineage_id is not null and new.lineage_id <> v_lineage_id then raise exception 'LINEAGE_CREATURE_MISMATCH'; end if;
  new.lineage_id := v_lineage_id;
  return new;
end;
$$;
create or replace function public.scope_target_progression_to_lineage()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_lineage_id uuid;
begin
  select lineage_id into v_lineage_id from public.player_creatures where id = new.creature_id;
  if v_lineage_id is null then raise exception 'CREATURE_NOT_FOUND'; end if;
  if new.lineage_id is not null and new.lineage_id <> v_lineage_id then raise exception 'LINEAGE_CREATURE_MISMATCH'; end if;
  new.lineage_id := v_lineage_id;
  return new;
end;
$$;
drop trigger if exists creature_visual_versions_scope_lineage on public.creature_visual_versions;
create trigger creature_visual_versions_scope_lineage before insert or update of creature_id, profile_id, lineage_id on public.creature_visual_versions for each row execute function public.scope_creature_progression_to_lineage();
drop trigger if exists creature_visual_progress_tracks_scope_lineage on public.creature_visual_progress_tracks;
create trigger creature_visual_progress_tracks_scope_lineage before insert or update of creature_id, profile_id, lineage_id on public.creature_visual_progress_tracks for each row execute function public.scope_creature_progression_to_lineage();
drop trigger if exists creature_transformation_requests_scope_lineage on public.creature_transformation_requests;
create trigger creature_transformation_requests_scope_lineage before insert or update of creature_id, profile_id, lineage_id on public.creature_transformation_requests for each row execute function public.scope_creature_progression_to_lineage();
drop trigger if exists creature_evolution_target_progress_scope_lineage on public.creature_evolution_target_progress;
create trigger creature_evolution_target_progress_scope_lineage before insert or update of creature_id, lineage_id on public.creature_evolution_target_progress for each row execute function public.scope_target_progression_to_lineage();
create index if not exists creature_visual_versions_lineage_history_idx on public.creature_visual_versions(lineage_id, version_number desc);
create index if not exists creature_visual_progress_tracks_lineage_idx on public.creature_visual_progress_tracks(lineage_id, started_at desc);
create index if not exists creature_transformation_requests_lineage_idx on public.creature_transformation_requests(lineage_id, created_at desc);

alter table public.profiles add column if not exists active_lineage_id uuid;
update public.profiles p
set active_lineage_id = (
  select c.lineage_id from public.player_creatures c
  where c.profile_id = p.id
  order by created_at, id
  limit 1
)
where p.active_lineage_id is null;
alter table public.profiles
  drop constraint if exists profiles_active_lineage_id_fkey,
  add constraint profiles_active_lineage_id_fkey foreign key (active_lineage_id)
    references public.creature_lineages(id) on delete restrict;

create or replace function public.assert_creature_lineage_ownership()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.creature_lineages
    where id = new.lineage_id and profile_id = new.profile_id
  ) then raise exception 'LINEAGE_NOT_OWNED'; end if;
  return new;
end;
$$;
drop trigger if exists player_creatures_assert_lineage_ownership on public.player_creatures;
create trigger player_creatures_assert_lineage_ownership
before insert or update of profile_id, lineage_id on public.player_creatures
for each row execute function public.assert_creature_lineage_ownership();

create or replace function public.assert_active_lineage_ownership()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.active_lineage_id is not null and not exists (
    select 1 from public.creature_lineages
    where id = new.active_lineage_id and profile_id = new.id
  ) then raise exception 'ACTIVE_LINEAGE_NOT_OWNED'; end if;
  return new;
end;
$$;
drop trigger if exists profiles_assert_active_lineage_ownership on public.profiles;
create trigger profiles_assert_active_lineage_ownership
before insert or update of active_lineage_id on public.profiles
for each row execute function public.assert_active_lineage_ownership();

-- Recreate the bootstrap path so fresh accounts receive an explicit active lineage.
create or replace function public.create_my_creature_lineage(
  p_base_creature_key text default 'VERDANT_HATCHLING', p_name text default null
)
returns public.player_creatures language plpgsql security definer set search_path = public as $$
declare v_profile_id uuid := auth.uid(); v_lineage public.creature_lineages%rowtype; v_creature public.player_creatures%rowtype;
begin
  if v_profile_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if p_base_creature_key is null or char_length(btrim(p_base_creature_key)) = 0 then raise exception 'BASE_CREATURE_REQUIRED'; end if;
  insert into public.creature_lineages(profile_id, name, base_creature_key)
  values (v_profile_id, nullif(btrim(p_name), ''), btrim(p_base_creature_key)) returning * into v_lineage;
  insert into public.player_creatures(profile_id, lineage_id, base_creature_key, name)
  values (v_profile_id, v_lineage.id, v_lineage.base_creature_key, v_lineage.name) returning * into v_creature;
  update public.profiles set active_lineage_id = coalesce(active_lineage_id, v_lineage.id) where id = v_profile_id;
  return v_creature;
end;
$$;

create or replace function public.set_my_active_creature_lineage(p_lineage_id uuid)
returns public.creature_lineages language plpgsql security definer set search_path = public as $$
declare v_profile_id uuid := auth.uid(); v_lineage public.creature_lineages%rowtype;
begin
  if v_profile_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select * into v_lineage from public.creature_lineages where id = p_lineage_id and profile_id = v_profile_id;
  if not found then raise exception 'LINEAGE_NOT_OWNED'; end if;
  update public.profiles set active_lineage_id = v_lineage.id where id = v_profile_id;
  return v_lineage;
end;
$$;

create or replace function public.bootstrap_my_profile()
returns void language plpgsql security definer set search_path = public as $$
declare v_profile_id uuid := auth.uid(); v_nickname text;
begin
  if v_profile_id is null then raise exception 'Authentication is required.'; end if;
  select coalesce(nullif(btrim(raw_user_meta_data ->> 'nickname'), ''), 'Giocatore-' || substr(v_profile_id::text, 1, 6)) into v_nickname from auth.users where id = v_profile_id;
  if v_nickname is null then raise exception 'Authenticated user not found.'; end if;
  insert into public.profiles(id, nickname) values (v_profile_id, left(v_nickname, 20)) on conflict(id) do nothing;
  if not exists (select 1 from public.player_creatures where profile_id = v_profile_id) then
    perform public.create_my_creature_lineage('VERDANT_HATCHLING', null);
  end if;
  update public.profiles p set active_lineage_id = (
    select c.lineage_id from public.player_creatures c where c.profile_id = p.id order by c.created_at, c.id limit 1
  ) where p.id = v_profile_id and p.active_lineage_id is null;
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_nickname text := coalesce(nullif(btrim(new.raw_user_meta_data ->> 'nickname'), ''), 'Giocatore-' || substr(new.id::text, 1, 6)); v_lineage_id uuid;
begin
  insert into public.profiles(id, nickname) values(new.id, left(v_nickname, 20)) on conflict(id) do nothing;
  insert into public.creature_lineages(profile_id, name, base_creature_key) values(new.id, null, 'VERDANT_HATCHLING') returning id into v_lineage_id;
  insert into public.player_creatures(profile_id, lineage_id, base_creature_key) values(new.id, v_lineage_id, 'VERDANT_HATCHLING');
  update public.profiles set active_lineage_id = v_lineage_id where id = new.id and active_lineage_id is null;
  return new;
end;
$$;

-- A completed match rewards the creature snapshot used in that match, rather than every
-- creature belonging to its owner.
create or replace function public.award_finished_game_rewards()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_player record; v_experience integer; v_inserted_rows integer;
begin
  if new.status <> 'FINISHED' or old.status = 'FINISHED' then return new; end if;
  if auth.role() <> 'service_role' then raise exception 'Only the server may finalize a rewarded match.'; end if;
  for v_player in select id, profile_id, creature_id from public.players where game_id = new.id and player_type = 'HUMAN' and profile_id is not null and creature_id is not null loop
    v_experience := public.match_experience_award(new.winner_id, v_player.id);
    insert into public.match_rewards(game_id, profile_id, experience_awarded) values(new.id, v_player.profile_id, v_experience) on conflict(game_id, profile_id) do nothing;
    get diagnostics v_inserted_rows = row_count;
    if v_inserted_rows > 0 then update public.player_creatures set experience = experience + v_experience, level = ((experience + v_experience) / 30) + 1 where id = v_player.creature_id and profile_id = v_player.profile_id; end if;
  end loop;
  return new;
end;
$$;

-- Match creation resolves the active lineage inside the database. Existing matches retain
-- their creature snapshots untouched, so history stays readable.
create or replace function public.active_profile_creature(p_profile_id uuid)
returns public.player_creatures language sql stable security definer set search_path = public as $$
  select c.* from public.profiles p join public.player_creatures c on c.lineage_id = p.active_lineage_id
  where p.id = p_profile_id
$$;

create or replace function public.require_active_lineage_for_new_match_player()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.profile_id is not null and new.creature_id is not null and not exists (
    select 1 from public.profiles p join public.player_creatures c on c.lineage_id = p.active_lineage_id
    where p.id = new.profile_id and c.id = new.creature_id
  ) then raise exception 'ACTIVE_LINEAGE_CREATURE_REQUIRED'; end if;
  return new;
end;
$$;
drop trigger if exists players_require_active_lineage on public.players;
create trigger players_require_active_lineage
before insert on public.players for each row execute function public.require_active_lineage_for_new_match_player();

create or replace function public.create_pvp_game(p_player_id text)
returns table (game_id uuid, room_code text, human_player_id text)
language plpgsql security definer set search_path = public as $$
declare v_profile_id uuid := auth.uid(); v_game_id uuid; v_room_code text; v_nickname text; v_creature public.player_creatures%rowtype; v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if v_profile_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if coalesce(btrim(p_player_id), '') = '' or char_length(p_player_id) > 128 then raise exception 'INVALID_PLAYER_ID'; end if;
  select nickname into v_nickname from public.profiles where id = v_profile_id;
  select * into v_creature from public.active_profile_creature(v_profile_id);
  if v_nickname is null or not found then raise exception 'PROFILE_NOT_READY'; end if;
  loop
    select string_agg(substr(v_alphabet, floor(random() * length(v_alphabet))::int + 1, 1), '') into v_room_code from generate_series(1, 5);
    begin
      insert into public.games(room_code, game_mode, status, current_round, world_id, round_event_sequence) values(v_room_code, 'PVP', 'WAITING', 1, 'AURELIA_PRIME', public.generate_round_event_sequence()) returning id into v_game_id;
      exit;
    exception when unique_violation then null; end;
  end loop;
  insert into public.players(id, game_id, nickname, slot, player_type, traits, connected, profile_id, creature_id, creature_snapshot)
  values(p_player_id, v_game_id, v_nickname, 1, 'HUMAN', public.initial_traits(), true, v_profile_id, v_creature.id, jsonb_build_object('id', v_creature.id, 'lineageId', v_creature.lineage_id, 'baseCreatureKey', v_creature.base_creature_key, 'name', v_creature.name, 'level', v_creature.level));
  update public.games set player_1_id = p_player_id where id = v_game_id;
  return query select v_game_id, v_room_code, p_player_id;
end;
$$;

create or replace function public.join_pvp_game(p_room_code text, p_player_id text)
returns table (game_id uuid, room_code text, human_player_id text)
language plpgsql security definer set search_path = public as $$
declare v_profile_id uuid := auth.uid(); v_game public.games%rowtype; v_existing public.players%rowtype; v_nickname text; v_creature public.player_creatures%rowtype;
begin
  if v_profile_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if coalesce(btrim(p_player_id), '') = '' or char_length(p_player_id) > 128 then raise exception 'INVALID_PLAYER_ID'; end if;
  select * into v_game from public.games where games.room_code = upper(btrim(p_room_code)) for update;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;
  if v_game.game_mode <> 'PVP' or v_game.status = 'FINISHED' then raise exception 'GAME_NOT_JOINABLE'; end if;
  select * into v_existing from public.players where players.game_id = v_game.id and profile_id = v_profile_id and player_type = 'HUMAN' limit 1;
  if found then update public.players set connected = true where id = v_existing.id; return query select v_game.id, v_game.room_code, v_existing.id; return; end if;
  if v_game.status <> 'WAITING' or v_game.player_2_id is not null or exists(select 1 from public.players where players.game_id = v_game.id and slot = 2) then raise exception 'GAME_FULL'; end if;
  select nickname into v_nickname from public.profiles where id = v_profile_id;
  select * into v_creature from public.active_profile_creature(v_profile_id);
  if v_nickname is null or not found then raise exception 'PROFILE_NOT_READY'; end if;
  insert into public.players(id, game_id, nickname, slot, player_type, traits, connected, profile_id, creature_id, creature_snapshot)
  values(p_player_id, v_game.id, v_nickname, 2, 'HUMAN', public.initial_traits(), true, v_profile_id, v_creature.id, jsonb_build_object('id', v_creature.id, 'lineageId', v_creature.lineage_id, 'baseCreatureKey', v_creature.base_creature_key, 'name', v_creature.name, 'level', v_creature.level));
  update public.games set player_2_id = p_player_id, status = 'CHOOSING', started_at = timezone('utc', now()) where id = v_game.id;
  return query select v_game.id, v_game.room_code, p_player_id;
end;
$$;

alter table public.creature_lineages enable row level security;
create policy "lineages own read" on public.creature_lineages for select to authenticated using (profile_id = auth.uid());
create policy "lineages own insert" on public.creature_lineages for insert to authenticated with check (profile_id = auth.uid());
create policy "lineages own update" on public.creature_lineages for update to authenticated using (profile_id = auth.uid()) with check (profile_id = auth.uid());
grant select, insert, update on public.creature_lineages to authenticated;
grant execute on function public.create_my_creature_lineage(text, text), public.set_my_active_creature_lineage(uuid) to authenticated;

commit;
