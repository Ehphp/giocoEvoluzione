-- Combat Mutations MVP: fixed per-match runtime state, not a mutation catalog or loadout.

alter table public.players
  add column if not exists combat_mutation_state jsonb not null
  default '{"elasticLimbsUsed": false, "adaptiveCoreStatus": "DORMANT"}'::jsonb;

create or replace function public.is_valid_combat_mutation_state(value jsonb)
returns boolean
language sql
immutable
as $$
  select jsonb_typeof(value) = 'object'
    and (select count(*) from jsonb_object_keys(value)) = 2
    and jsonb_typeof(value->'elasticLimbsUsed') = 'boolean'
    and value->>'adaptiveCoreStatus' in ('DORMANT', 'ARMED', 'CONSUMED');
$$;

alter table public.players
  drop constraint if exists players_combat_mutation_state_check;

alter table public.players
  add constraint players_combat_mutation_state_check
  check (public.is_valid_combat_mutation_state(combat_mutation_state));

-- The Edge Function is the only caller. Replace the old signature rather than
-- leaving an overloaded RPC that PostgREST could resolve ambiguously.
drop function if exists public.commit_game_round_resolution(
  uuid, integer, text, text, jsonb, jsonb, integer, integer, text, text,
  timestamptz, integer, integer, text, jsonb
);

create function public.commit_game_round_resolution(
  p_game_id uuid,
  p_round_number integer,
  p_player_1_id text,
  p_player_2_id text,
  p_player_1_traits jsonb,
  p_player_2_traits jsonb,
  p_player_1_combat_mutation_state jsonb,
  p_player_2_combat_mutation_state jsonb,
  p_player_1_score integer,
  p_player_2_score integer,
  p_status text,
  p_winner_id text,
  p_finished_at timestamptz,
  p_player_1_value integer,
  p_player_2_value integer,
  p_result_winner_id text,
  p_resolution_data jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.games%rowtype;
  v_result public.round_results%rowtype;
  v_updated integer;
begin
  select * into v_game from public.games where id = p_game_id for update;
  if not found then return jsonb_build_object('outcome', 'GAME_NOT_FOUND'); end if;
  if v_game.current_round <> p_round_number then
    return jsonb_build_object('outcome', 'STALE_ROUND', 'stateRevision', v_game.state_revision);
  end if;

  select * into v_result from public.round_results
  where game_id = p_game_id and round_number = p_round_number;
  if found then
    return jsonb_build_object('outcome', 'ALREADY_RESOLVED', 'stateRevision', v_game.state_revision, 'result', to_jsonb(v_result));
  end if;
  if v_game.status <> 'CHOOSING' then
    return jsonb_build_object('outcome', 'ROUND_NOT_OPEN', 'stateRevision', v_game.state_revision);
  end if;
  if p_status not in ('REVEALING', 'FINISHED') then raise exception 'INVALID_RESOLUTION_STATUS'; end if;
  if v_game.player_1_id is distinct from p_player_1_id or v_game.player_2_id is distinct from p_player_2_id then
    raise exception 'RESOLUTION_PLAYERS_MISMATCH';
  end if;

  insert into public.round_results (
    game_id, round_number, player_1_value, player_2_value, winner_id, resolution_data
  ) values (
    p_game_id, p_round_number, p_player_1_value, p_player_2_value, p_result_winner_id, p_resolution_data
  ) returning * into v_result;

  update public.players
  set traits = p_player_1_traits,
      combat_mutation_state = p_player_1_combat_mutation_state,
      connected = true
  where id = p_player_1_id and game_id = p_game_id;
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then raise exception 'RESOLUTION_PLAYER_1_NOT_FOUND'; end if;

  update public.players
  set traits = p_player_2_traits,
      combat_mutation_state = p_player_2_combat_mutation_state,
      connected = true
  where id = p_player_2_id and game_id = p_game_id;
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then raise exception 'RESOLUTION_PLAYER_2_NOT_FOUND'; end if;

  update public.games
  set player_1_score = p_player_1_score,
      player_2_score = p_player_2_score,
      status = p_status,
      winner_id = p_winner_id,
      finished_at = p_finished_at,
      state_revision = state_revision + 1
  where id = p_game_id
  returning state_revision into v_game.state_revision;

  return jsonb_build_object('outcome', 'APPLIED', 'stateRevision', v_game.state_revision, 'result', to_jsonb(v_result));
end;
$$;

revoke all on function public.commit_game_round_resolution(
  uuid, integer, text, text, jsonb, jsonb, jsonb, jsonb, integer, integer,
  text, text, timestamptz, integer, integer, text, jsonb
) from public, anon, authenticated;
grant execute on function public.commit_game_round_resolution(
  uuid, integer, text, text, jsonb, jsonb, jsonb, jsonb, integer, integer,
  text, text, timestamptz, integer, integer, text, jsonb
) to service_role;

notify pgrst, 'reload schema';
