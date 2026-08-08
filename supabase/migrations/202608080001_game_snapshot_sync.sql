-- Canonical game-state synchronization. Realtime publishes only games revisions;
-- clients hydrate every visible field through get_game_snapshot.

alter table public.games
  add column if not exists state_revision bigint not null default 0;

-- Existing games predate the column. Give every persisted state a valid baseline.
update public.games set state_revision = 0 where state_revision is null;

-- New command RPCs increment explicitly. This fallback keeps legacy create/join
-- functions and future server-side changes visible without allowing two bumps
-- for a command that already supplied the next revision.
create or replace function public.bump_game_state_revision_on_legacy_update()
returns trigger
language plpgsql
as $$
begin
  if new.state_revision = old.state_revision
    and (
      new.game_mode, new.bot_difficulty, new.status, new.current_round,
      new.world_id, new.round_event_sequence, new.player_1_id, new.player_2_id,
      new.player_1_score, new.player_2_score, new.winner_id, new.started_at,
      new.finished_at, new.rematch_count
    ) is distinct from (
      old.game_mode, old.bot_difficulty, old.status, old.current_round,
      old.world_id, old.round_event_sequence, old.player_1_id, old.player_2_id,
      old.player_1_score, old.player_2_score, old.winner_id, old.started_at,
      old.finished_at, old.rematch_count
    ) then
    new.state_revision := old.state_revision + 1;
  end if;
  return new;
end;
$$;
drop trigger if exists games_bump_state_revision_on_legacy_update on public.games;
create trigger games_bump_state_revision_on_legacy_update
before update on public.games
for each row execute function public.bump_game_state_revision_on_legacy_update();

drop function if exists public.get_game_snapshot(uuid);
create function public.get_game_snapshot(p_game_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_game public.games%rowtype;
  v_me public.players%rowtype;
  v_opponent public.players%rowtype;
  v_my_action public.round_actions%rowtype;
  v_current_result public.round_results%rowtype;
  v_submitted_count integer;
  v_players jsonb;
  v_results jsonb;
begin
  if auth.uid() is null or not public.is_game_participant(p_game_id) then
    raise exception 'GAME_PARTICIPANT_REQUIRED';
  end if;

  select * into v_game from public.games where id = p_game_id;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;

  select * into v_me
  from public.players
  where game_id = p_game_id and profile_id = auth.uid() and player_type = 'HUMAN'
  limit 1;
  if not found then raise exception 'GAME_PARTICIPANT_REQUIRED'; end if;

  select * into v_opponent from public.players
  where game_id = p_game_id and id <> v_me.id
  order by slot
  limit 1;

  select coalesce(jsonb_agg(to_jsonb(player) order by player.slot), '[]'::jsonb)
  into v_players
  from public.players player where player.game_id = p_game_id;

  select count(*)::integer into v_submitted_count
  from public.round_actions
  where game_id = p_game_id and round_number = v_game.current_round;

  select * into v_my_action
  from public.round_actions
  where game_id = p_game_id and round_number = v_game.current_round and player_id = v_me.id;

  select * into v_current_result
  from public.round_results
  where game_id = p_game_id and round_number = v_game.current_round;

  select coalesce(jsonb_agg(to_jsonb(result) order by result.round_number), '[]'::jsonb)
  into v_results
  from public.round_results result where result.game_id = p_game_id;

  return jsonb_build_object(
    'game', to_jsonb(v_game),
    'players', v_players,
    'me', to_jsonb(v_me),
    'opponent', case when v_opponent.id is null then null else to_jsonb(v_opponent) end,
    'actionsSubmitted', v_submitted_count,
    -- The own action is intentionally the only action exposed while CHOOSING.
    'myCurrentAction', case when v_my_action.id is null then null else to_jsonb(v_my_action) end,
    'currentRoundResult', case when v_current_result.id is null then null else to_jsonb(v_current_result) end,
    'roundResults', v_results,
    'stateRevision', v_game.state_revision
  );
end;
$$;

drop function if exists public.submit_game_round_action(uuid, integer, text, text);
create function public.submit_game_round_action(
  p_game_id uuid, p_round_number integer, p_trait text, p_action_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := auth.uid();
  v_player public.players%rowtype;
  v_game public.games%rowtype;
  v_changed boolean := false;
  v_inserted integer;
  v_count integer;
begin
  if v_profile_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if p_trait not in ('FEROCITY','ARMOR','AGILITY','SENSES','CAMOUFLAGE')
    or p_action_type not in ('USE','EVOLVE') then raise exception 'INVALID_ACTION'; end if;

  select * into v_game from public.games where id = p_game_id for update;
  if not found or v_game.status <> 'CHOOSING' or v_game.current_round <> p_round_number then
    raise exception 'ROUND_NOT_OPEN';
  end if;
  select * into v_player from public.players
  where game_id = p_game_id and profile_id = v_profile_id and player_type = 'HUMAN'
  limit 1;
  if not found then raise exception 'GAME_PARTICIPANT_REQUIRED'; end if;

  insert into public.round_actions (game_id, round_number, player_id, trait, action_type)
  values (p_game_id, p_round_number, v_player.id, p_trait, p_action_type)
  on conflict (game_id, round_number, player_id) do nothing;
  get diagnostics v_inserted = row_count;
  v_changed := v_inserted > 0;

  if v_changed then
    update public.games set state_revision = state_revision + 1 where id = p_game_id
    returning state_revision into v_game.state_revision;
  end if;

  select count(*)::integer into v_count
  from public.round_actions where game_id = p_game_id and round_number = p_round_number;

  return jsonb_build_object(
    'stateRevision', v_game.state_revision,
    'changed', v_changed,
    'resolveRequired', v_changed and (v_game.game_mode = 'VS_BOT' or v_count >= 2)
  );
end;
$$;

drop function if exists public.acknowledge_game_reveal(uuid);
create function public.acknowledge_game_reveal(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_revision bigint; v_changed boolean := false;
begin
  if not public.is_game_participant(p_game_id) then raise exception 'GAME_PARTICIPANT_REQUIRED'; end if;
  update public.games
  set status = 'ROUND_RESULT', state_revision = state_revision + 1
  where id = p_game_id and status = 'REVEALING'
  returning state_revision into v_revision;
  v_changed := found;
  if not v_changed then select state_revision into v_revision from public.games where id = p_game_id; end if;
  return jsonb_build_object('stateRevision', v_revision, 'changed', v_changed);
end;
$$;

drop function if exists public.advance_game_round(uuid);
create function public.advance_game_round(p_game_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_revision bigint; v_changed boolean := false;
begin
  if not public.is_game_participant(p_game_id) then raise exception 'GAME_PARTICIPANT_REQUIRED'; end if;
  update public.games
  set current_round = current_round + 1, status = 'CHOOSING', state_revision = state_revision + 1
  where id = p_game_id and status = 'ROUND_RESULT' and current_round < 7
  returning state_revision into v_revision;
  v_changed := found;
  if not v_changed then select state_revision into v_revision from public.games where id = p_game_id; end if;
  return jsonb_build_object('stateRevision', v_revision, 'changed', v_changed);
end;
$$;

drop function if exists public.touch_game_participant(uuid, text);
create function public.touch_game_participant(p_game_id uuid, p_player_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_revision bigint; v_changed boolean := false;
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  update public.players set connected = true
  where id = p_player_id and game_id = p_game_id and profile_id = auth.uid()
    and connected is distinct from true;
  v_changed := found;
  if not found and not exists (
    select 1 from public.players where id = p_player_id and game_id = p_game_id and profile_id = auth.uid()
  ) then raise exception 'GAME_PARTICIPANT_REQUIRED'; end if;
  if v_changed then
    update public.games set state_revision = state_revision + 1 where id = p_game_id
    returning state_revision into v_revision;
  else
    select state_revision into v_revision from public.games where id = p_game_id;
  end if;
  return jsonb_build_object('stateRevision', v_revision, 'changed', v_changed);
end;
$$;

-- Service-role only: the Edge Function computes the deterministic rules, while
-- this function atomically validates and persists the resulting state.
create or replace function public.commit_game_round_resolution(
  p_game_id uuid,
  p_round_number integer,
  p_player_1_id text,
  p_player_2_id text,
  p_player_1_traits jsonb,
  p_player_2_traits jsonb,
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

  update public.players set traits = p_player_1_traits, connected = true
  where id = p_player_1_id and game_id = p_game_id;
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then raise exception 'RESOLUTION_PLAYER_1_NOT_FOUND'; end if;
  update public.players set traits = p_player_2_traits, connected = true
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

revoke all on function public.get_game_snapshot(uuid) from public, anon;
grant execute on function public.get_game_snapshot(uuid) to authenticated, service_role;
revoke all on function public.commit_game_round_resolution(uuid, integer, text, text, jsonb, jsonb, integer, integer, text, text, timestamptz, integer, integer, text, jsonb) from public, anon, authenticated;
grant execute on function public.commit_game_round_resolution(uuid, integer, text, text, jsonb, jsonb, integer, integer, text, text, timestamptz, integer, integer, text, jsonb) to service_role;

revoke all on function public.submit_game_round_action(uuid, integer, text, text), public.acknowledge_game_reveal(uuid), public.advance_game_round(uuid), public.touch_game_participant(uuid, text) from public, anon;
grant execute on function public.submit_game_round_action(uuid, integer, text, text), public.acknowledge_game_reveal(uuid), public.advance_game_round(uuid), public.touch_game_participant(uuid, text) to authenticated, service_role;
