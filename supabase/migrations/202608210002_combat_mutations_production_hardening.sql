-- Combat Mutations production hardening: strict snapshot validation, immutable
-- rule versioning and stable visual slot order. Mechanics remain shared code.
begin;

-- A valid loadout is exactly two known distinct ids.  Unlike the original MVP
-- helper this preserves value[1]/value[2], which are Slot 1 / Slot 2 in the UI.
create or replace function public.is_valid_combat_mutation_loadout(value text[])
returns boolean
language sql
immutable
as $$
  select case
    when value is null or array_ndims(value) is distinct from 1 or cardinality(value) is distinct from 2 then false
    else coalesce(
      value[1] is not null
      and value[2] is not null
      and value[1] is distinct from value[2]
      and value[1] = any(array['ELASTIC_LIMBS', 'ADAPTIVE_CORE', 'ARMORED_MEMORY', 'RECOVERY_SURGE']::text[])
      and value[2] = any(array['ELASTIC_LIMBS', 'ADAPTIVE_CORE', 'ARMORED_MEMORY', 'RECOVERY_SURGE']::text[]),
      false
    )
  end;
$$;

create or replace function public.canonical_combat_mutation_loadout(value text[])
returns text[]
language sql
immutable
as $$
  select value;
$$;

alter table public.player_creatures
  drop constraint if exists player_creatures_combat_mutation_loadout_check,
  add constraint player_creatures_combat_mutation_loadout_check
    check (public.is_valid_combat_mutation_loadout(combat_mutation_loadout) is true);
alter table public.players
  drop constraint if exists players_combat_mutation_loadout_check,
  add constraint players_combat_mutation_loadout_check
    check (public.is_valid_combat_mutation_loadout(combat_mutation_loadout) is true);

-- This verifier must be total. PostgreSQL CHECK accepts NULL, so every branch
-- below is explicit and malformed JSON never gets a permissive NULL result.
create or replace function public.is_valid_combat_mutation_state(value jsonb)
returns boolean
language sql
immutable
as $$
  select case
    when jsonb_typeof(value) is distinct from 'object' then false
    else coalesce(
      value ?& array['elasticLimbsUsed', 'adaptiveCoreStatus', 'armoredMemoryUsed', 'recoverySurgeUsed']
      and not exists (
        select 1
        from jsonb_object_keys(value) as key
        where key <> all (array['elasticLimbsUsed', 'adaptiveCoreStatus', 'armoredMemoryUsed', 'recoverySurgeUsed'])
      )
      and jsonb_typeof(value -> 'elasticLimbsUsed') = 'boolean'
      and jsonb_typeof(value -> 'adaptiveCoreStatus') = 'string'
      and (value ->> 'adaptiveCoreStatus') in ('DORMANT', 'ARMED', 'CONSUMED')
      and jsonb_typeof(value -> 'armoredMemoryUsed') = 'boolean'
      and jsonb_typeof(value -> 'recoverySurgeUsed') = 'boolean',
      false
    )
  end;
$$;

alter table public.players
  alter column combat_mutation_state set not null,
  drop constraint if exists players_combat_mutation_state_check,
  add constraint players_combat_mutation_state_check
    check (public.is_valid_combat_mutation_state(combat_mutation_state) is true);

-- Rule version is frozen when the game row is created. Existing games already
-- use this implementation, so the one-time backfill preserves their ruleset.
alter table public.games add column if not exists rule_version text;
update public.games
set rule_version = 'combat-mutations-loadout-mvp-v1'
where rule_version is null;
alter table public.games
  alter column rule_version set default 'combat-mutations-loadout-mvp-v1',
  alter column rule_version set not null,
  drop constraint if exists games_rule_version_not_blank_check,
  add constraint games_rule_version_not_blank_check check (btrim(rule_version) <> '');

-- The RPC owns creature configuration. It deliberately stores the supplied
-- order instead of catalog order, retaining the visual Slot 1/Slot 2 contract.
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
  if public.is_valid_combat_mutation_loadout(p_combat_mutation_loadout) is not true then
    raise exception 'INVALID_COMBAT_MUTATION_LOADOUT';
  end if;

  update public.player_creatures
  set combat_mutation_loadout = p_combat_mutation_loadout,
      updated_at = timezone('utc', now())
  where id = p_creature_id and profile_id = v_profile_id
  returning * into v_creature;
  if not found then raise exception 'CREATURE_NOT_OWNED'; end if;

  return to_jsonb(v_creature);
end;
$$;

-- P1 freezes both the ruleset and their creature loadout. P2 only joins a
-- match with that already-selected ruleset; neither match snapshot is mutable.
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
  if public.is_valid_combat_mutation_loadout(v_creature.combat_mutation_loadout) is not true then raise exception 'INVALID_CREATURE_COMBAT_MUTATION_LOADOUT'; end if;
  loop
    select string_agg(substr(v_alphabet, floor(random() * length(v_alphabet))::int + 1, 1), '') into v_room_code from generate_series(1, 5);
    begin
      insert into public.games(room_code, game_mode, status, current_round, world_id, round_event_sequence, rule_version)
      values(v_room_code, 'PVP', 'WAITING', 1, 'AURELIA_PRIME', public.generate_round_event_sequence(), 'combat-mutations-loadout-mvp-v1')
      returning id into v_game_id;
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
  if v_game.rule_version <> 'combat-mutations-loadout-mvp-v1' then raise exception 'UNSUPPORTED_GAME_RULE_VERSION'; end if;
  if v_game.game_mode <> 'PVP' or v_game.status = 'FINISHED' then raise exception 'GAME_NOT_JOINABLE'; end if;
  select * into v_existing from public.players where players.game_id = v_game.id and profile_id = v_profile_id and player_type = 'HUMAN' limit 1;
  if found then update public.players set connected = true where id = v_existing.id; return query select v_game.id, v_game.room_code, v_existing.id; return; end if;
  if v_game.status <> 'WAITING' or v_game.player_2_id is not null or exists(select 1 from public.players where players.game_id = v_game.id and slot = 2) then raise exception 'GAME_FULL'; end if;
  select nickname into v_nickname from public.profiles where id = v_profile_id;
  select * into v_creature from public.active_profile_creature(v_profile_id);
  if v_nickname is null or not found then raise exception 'PROFILE_NOT_READY'; end if;
  if public.is_valid_combat_mutation_loadout(v_creature.combat_mutation_loadout) is not true then raise exception 'INVALID_CREATURE_COMBAT_MUTATION_LOADOUT'; end if;
  insert into public.players(id, game_id, nickname, slot, player_type, traits, connected, profile_id, creature_id, creature_snapshot, combat_mutation_loadout)
  values(p_player_id, v_game.id, v_nickname, 2, 'HUMAN', public.initial_traits(), true, v_profile_id, v_creature.id, jsonb_build_object('id', v_creature.id, 'lineageId', v_creature.lineage_id, 'baseCreatureKey', v_creature.base_creature_key, 'name', v_creature.name, 'level', v_creature.level, 'combatMutationLoadout', v_creature.combat_mutation_loadout), v_creature.combat_mutation_loadout);
  update public.games set player_2_id = p_player_id, status = 'CHOOSING', started_at = timezone('utc', now()) where id = v_game.id;
  return query select v_game.id, v_game.room_code, p_player_id;
end;
$$;

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
  if public.is_valid_combat_mutation_loadout(v_creature.combat_mutation_loadout) is not true then raise exception 'INVALID_CREATURE_COMBAT_MUTATION_LOADOUT'; end if;
  v_snapshot := jsonb_build_object('id', v_creature.id, 'lineageId', v_creature.lineage_id, 'baseCreatureKey', v_creature.base_creature_key, 'name', v_creature.name, 'level', v_creature.level, 'combatMutationLoadout', v_creature.combat_mutation_loadout);
  loop
    select string_agg(substr(v_alphabet, floor(random() * length(v_alphabet))::int + 1, 1), '') into v_room_code from generate_series(1, 5);
    begin
      insert into public.games (room_code, game_mode, bot_difficulty, status, current_round, world_id, round_event_sequence, started_at, rule_version)
      values (v_room_code, 'VS_BOT', p_bot_difficulty, 'CHOOSING', 1, 'AURELIA_PRIME', public.generate_round_event_sequence(), timezone('utc', now()), 'combat-mutations-loadout-mvp-v1') returning id into v_game_id;
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

-- The Edge Function remains the only caller. The transaction rejects a stale
-- or forged resolution whose frozen game version and payload do not agree.
create or replace function public.commit_game_round_resolution(
  p_game_id uuid, p_round_number integer, p_player_1_id text, p_player_2_id text,
  p_player_1_traits jsonb, p_player_2_traits jsonb,
  p_player_1_combat_mutation_state jsonb, p_player_2_combat_mutation_state jsonb,
  p_player_1_score integer, p_player_2_score integer, p_status text, p_winner_id text,
  p_finished_at timestamptz, p_player_1_value integer, p_player_2_value integer,
  p_result_winner_id text, p_resolution_data jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_game public.games%rowtype; v_result public.round_results%rowtype; v_updated integer;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found then return jsonb_build_object('outcome', 'GAME_NOT_FOUND'); end if;
  if v_game.current_round <> p_round_number then return jsonb_build_object('outcome', 'STALE_ROUND', 'stateRevision', v_game.state_revision); end if;
  select * into v_result from public.round_results where game_id = p_game_id and round_number = p_round_number;
  if found then return jsonb_build_object('outcome', 'ALREADY_RESOLVED', 'stateRevision', v_game.state_revision, 'result', to_jsonb(v_result)); end if;
  if v_game.status <> 'CHOOSING' then return jsonb_build_object('outcome', 'ROUND_NOT_OPEN', 'stateRevision', v_game.state_revision); end if;
  if p_status not in ('REVEALING', 'FINISHED') then raise exception 'INVALID_RESOLUTION_STATUS'; end if;
  if v_game.player_1_id is distinct from p_player_1_id or v_game.player_2_id is distinct from p_player_2_id then raise exception 'RESOLUTION_PLAYERS_MISMATCH'; end if;
  if jsonb_typeof(p_resolution_data) is distinct from 'object' or (p_resolution_data ->> 'ruleVersion') is distinct from v_game.rule_version then raise exception 'RESOLUTION_RULE_VERSION_MISMATCH'; end if;
  if public.is_valid_combat_mutation_state(p_player_1_combat_mutation_state) is not true then raise exception 'INVALID_PLAYER_1_COMBAT_MUTATION_STATE'; end if;
  if public.is_valid_combat_mutation_state(p_player_2_combat_mutation_state) is not true then raise exception 'INVALID_PLAYER_2_COMBAT_MUTATION_STATE'; end if;

  insert into public.round_results (game_id, round_number, player_1_value, player_2_value, winner_id, resolution_data)
  values (p_game_id, p_round_number, p_player_1_value, p_player_2_value, p_result_winner_id, p_resolution_data) returning * into v_result;
  update public.players set traits = p_player_1_traits, combat_mutation_state = p_player_1_combat_mutation_state, connected = true where id = p_player_1_id and game_id = p_game_id;
  get diagnostics v_updated = row_count; if v_updated <> 1 then raise exception 'RESOLUTION_PLAYER_1_NOT_FOUND'; end if;
  update public.players set traits = p_player_2_traits, combat_mutation_state = p_player_2_combat_mutation_state, connected = true where id = p_player_2_id and game_id = p_game_id;
  get diagnostics v_updated = row_count; if v_updated <> 1 then raise exception 'RESOLUTION_PLAYER_2_NOT_FOUND'; end if;
  update public.games set player_1_score = p_player_1_score, player_2_score = p_player_2_score, status = p_status, winner_id = p_winner_id, finished_at = p_finished_at, state_revision = state_revision + 1 where id = p_game_id returning state_revision into v_game.state_revision;
  return jsonb_build_object('outcome', 'APPLIED', 'stateRevision', v_game.state_revision, 'result', to_jsonb(v_result));
end;
$$;

revoke all on function public.set_my_creature_combat_mutation_loadout(uuid, text[]) from public, anon;
grant execute on function public.set_my_creature_combat_mutation_loadout(uuid, text[]) to authenticated, service_role;
revoke all on function public.commit_game_round_resolution(uuid, integer, text, text, jsonb, jsonb, jsonb, jsonb, integer, integer, text, text, timestamptz, integer, integer, text, jsonb) from public, anon, authenticated;
grant execute on function public.commit_game_round_resolution(uuid, integer, text, text, jsonb, jsonb, jsonb, jsonb, integer, integer, text, text, timestamptz, integer, integer, text, jsonb) to service_role;

notify pgrst, 'reload schema';
commit;
