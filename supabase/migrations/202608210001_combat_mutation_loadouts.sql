-- Persistent two-of-four Combat Mutation loadouts. The loadout belongs to a creature,
-- is snapshotted on the match player row, and never changes during that match.
begin;

create or replace function public.is_valid_combat_mutation_loadout(value text[])
returns boolean
language sql
immutable
as $$
  select value is not null
    and array_ndims(value) = 1
    and cardinality(value) = 2
    and not exists (
      select 1 from unnest(value) as mutation
      where mutation is null
         or mutation not in ('ELASTIC_LIMBS', 'ADAPTIVE_CORE', 'ARMORED_MEMORY', 'RECOVERY_SURGE')
    )
    and value[1] is distinct from value[2];
$$;

create or replace function public.canonical_combat_mutation_loadout(value text[])
returns text[]
language sql
immutable
as $$
  select array(
    select mutation
    from unnest(array['ELASTIC_LIMBS', 'ADAPTIVE_CORE', 'ARMORED_MEMORY', 'RECOVERY_SURGE']::text[]) as mutation
    where mutation = any(value)
  );
$$;

alter table public.player_creatures
  add column if not exists combat_mutation_loadout text[];
alter table public.players
  add column if not exists combat_mutation_loadout text[];

update public.player_creatures
set combat_mutation_loadout = array['ELASTIC_LIMBS', 'ADAPTIVE_CORE']::text[]
where combat_mutation_loadout is null
   or not public.is_valid_combat_mutation_loadout(combat_mutation_loadout);
update public.players
set combat_mutation_loadout = array['ELASTIC_LIMBS', 'ADAPTIVE_CORE']::text[]
where combat_mutation_loadout is null
   or not public.is_valid_combat_mutation_loadout(combat_mutation_loadout);

update public.player_creatures
set combat_mutation_loadout = public.canonical_combat_mutation_loadout(combat_mutation_loadout);
update public.players
set combat_mutation_loadout = public.canonical_combat_mutation_loadout(combat_mutation_loadout);

alter table public.player_creatures
  alter column combat_mutation_loadout set default array['ELASTIC_LIMBS', 'ADAPTIVE_CORE']::text[],
  alter column combat_mutation_loadout set not null,
  drop constraint if exists player_creatures_combat_mutation_loadout_check,
  add constraint player_creatures_combat_mutation_loadout_check
    check (public.is_valid_combat_mutation_loadout(combat_mutation_loadout));
alter table public.players
  alter column combat_mutation_loadout set default array['ELASTIC_LIMBS', 'ADAPTIVE_CORE']::text[],
  alter column combat_mutation_loadout set not null,
  drop constraint if exists players_combat_mutation_loadout_check,
  add constraint players_combat_mutation_loadout_check
    check (public.is_valid_combat_mutation_loadout(combat_mutation_loadout));

-- Extend the existing runtime state without changing the already-consumed historical effects.
alter table public.players
  drop constraint if exists players_combat_mutation_state_check;
update public.players
set combat_mutation_state = jsonb_build_object(
  'elasticLimbsUsed', coalesce((combat_mutation_state->>'elasticLimbsUsed')::boolean, false),
  'adaptiveCoreStatus', coalesce(combat_mutation_state->>'adaptiveCoreStatus', 'DORMANT'),
  'armoredMemoryUsed', coalesce((combat_mutation_state->>'armoredMemoryUsed')::boolean, false),
  'recoverySurgeUsed', coalesce((combat_mutation_state->>'recoverySurgeUsed')::boolean, false)
);
alter table public.players
  alter column combat_mutation_state set default '{"elasticLimbsUsed": false, "adaptiveCoreStatus": "DORMANT", "armoredMemoryUsed": false, "recoverySurgeUsed": false}'::jsonb;
create or replace function public.is_valid_combat_mutation_state(value jsonb)
returns boolean
language sql
immutable
as $$
  select jsonb_typeof(value) = 'object'
    and (select count(*) from jsonb_object_keys(value)) = 4
    and jsonb_typeof(value->'elasticLimbsUsed') = 'boolean'
    and value->>'adaptiveCoreStatus' in ('DORMANT', 'ARMED', 'CONSUMED')
    and jsonb_typeof(value->'armoredMemoryUsed') = 'boolean'
    and jsonb_typeof(value->'recoverySurgeUsed') = 'boolean';
$$;
alter table public.players
  add constraint players_combat_mutation_state_check
    check (public.is_valid_combat_mutation_state(combat_mutation_state));

create or replace function public.set_my_creature_combat_mutation_loadout(
  p_creature_id uuid,
  p_combat_mutation_loadout text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := auth.uid();
  v_creature public.player_creatures%rowtype;
begin
  if v_profile_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not public.is_valid_combat_mutation_loadout(p_combat_mutation_loadout) then
    raise exception 'INVALID_COMBAT_MUTATION_LOADOUT';
  end if;

  update public.player_creatures
  set combat_mutation_loadout = public.canonical_combat_mutation_loadout(p_combat_mutation_loadout),
      updated_at = timezone('utc', now())
  where id = p_creature_id and profile_id = v_profile_id
  returning * into v_creature;
  if not found then raise exception 'CREATURE_NOT_OWNED'; end if;

  return to_jsonb(v_creature);
end;
$$;

-- P1 and P2 snapshot their active creature's configuration at creation/join time.
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
  insert into public.players(id, game_id, nickname, slot, player_type, traits, connected, profile_id, creature_id, creature_snapshot, combat_mutation_loadout)
  values(p_player_id, v_game_id, v_nickname, 1, 'HUMAN', public.initial_traits(), true, v_profile_id, v_creature.id, jsonb_build_object('id', v_creature.id, 'lineageId', v_creature.lineage_id, 'baseCreatureKey', v_creature.base_creature_key, 'name', v_creature.name, 'level', v_creature.level, 'combatMutationLoadout', v_creature.combat_mutation_loadout), v_creature.combat_mutation_loadout);
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
  insert into public.players(id, game_id, nickname, slot, player_type, traits, connected, profile_id, creature_id, creature_snapshot, combat_mutation_loadout)
  values(p_player_id, v_game.id, v_nickname, 2, 'HUMAN', public.initial_traits(), true, v_profile_id, v_creature.id, jsonb_build_object('id', v_creature.id, 'lineageId', v_creature.lineage_id, 'baseCreatureKey', v_creature.base_creature_key, 'name', v_creature.name, 'level', v_creature.level, 'combatMutationLoadout', v_creature.combat_mutation_loadout), v_creature.combat_mutation_loadout);
  update public.games set player_2_id = p_player_id, status = 'CHOOSING', started_at = timezone('utc', now()) where id = v_game.id;
  return query select v_game.id, v_game.room_code, p_player_id;
end;
$$;

-- Keep the existing six-argument client RPC, but derive creature data and its loadout
-- server-side rather than trusting the optional client snapshot.
create or replace function public.create_vs_bot_game(
  p_nickname text,
  p_player_id text,
  p_bot_difficulty text default 'NORMAL',
  p_profile_id uuid default null,
  p_creature_id uuid default null,
  p_creature_snapshot jsonb default null
)
returns table (game_id uuid, room_code text, human_player_id text, bot_player_id text)
language plpgsql security definer set search_path = public as $$
declare v_profile_id uuid := auth.uid(); v_game_id uuid; v_room_code text; v_bot_player_id text := gen_random_uuid()::text; v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; v_nickname text; v_creature public.player_creatures%rowtype; v_snapshot jsonb;
begin
  if v_profile_id is null or p_profile_id is distinct from v_profile_id then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if coalesce(btrim(p_player_id), '') = '' or char_length(p_player_id) > 128 then raise exception 'INVALID_PLAYER_ID'; end if;
  if p_bot_difficulty not in ('EASY', 'NORMAL', 'HARD') then raise exception 'INVALID_BOT_DIFFICULTY'; end if;
  select nickname into v_nickname from public.profiles where id = v_profile_id;
  select * into v_creature from public.player_creatures where id = p_creature_id and profile_id = v_profile_id;
  if v_nickname is null or not found then raise exception 'PROFILE_NOT_READY'; end if;
  v_snapshot := jsonb_build_object('id', v_creature.id, 'lineageId', v_creature.lineage_id, 'baseCreatureKey', v_creature.base_creature_key, 'name', v_creature.name, 'level', v_creature.level, 'combatMutationLoadout', v_creature.combat_mutation_loadout);
  loop
    select string_agg(substr(v_alphabet, floor(random() * length(v_alphabet))::int + 1, 1), '') into v_room_code from generate_series(1, 5);
    begin
      insert into public.games (room_code, game_mode, bot_difficulty, status, current_round, world_id, round_event_sequence, started_at)
      values (v_room_code, 'VS_BOT', p_bot_difficulty, 'CHOOSING', 1, 'AURELIA_PRIME', public.generate_round_event_sequence(), timezone('utc', now())) returning id into v_game_id;
      exit;
    exception when unique_violation then null; end;
  end loop;
  insert into public.players (id, game_id, nickname, slot, player_type, traits, connected, profile_id, creature_id, creature_snapshot, combat_mutation_loadout) values
    (p_player_id, v_game_id, v_nickname, 1, 'HUMAN', public.initial_traits(), true, v_profile_id, v_creature.id, v_snapshot, v_creature.combat_mutation_loadout),
    (v_bot_player_id, v_game_id, 'Bot', 2, 'BOT', public.initial_traits(), true, null, null, null, array['ELASTIC_LIMBS', 'ADAPTIVE_CORE']::text[]);
  update public.games set player_1_id = p_player_id, player_2_id = v_bot_player_id where id = v_game_id;
  return query select v_game_id, v_room_code, p_player_id, v_bot_player_id;
end;
$$;

revoke all on function public.set_my_creature_combat_mutation_loadout(uuid, text[]) from public, anon;
grant execute on function public.set_my_creature_combat_mutation_loadout(uuid, text[]) to authenticated, service_role;
grant execute on function public.create_pvp_game(text), public.join_pvp_game(text, text), public.create_vs_bot_game(text, text, text, uuid, uuid, jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
