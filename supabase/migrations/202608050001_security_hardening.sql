-- Security hardening: authenticated game access, server-controlled mutations,
-- invitation-only accounts and atomic economic limits for real image generation.

alter table public.profiles
  add column if not exists can_generate_images boolean not null default false;

-- A player may only edit the visible nickname. The generation capability is
-- assigned by an administrator/service role and must never be self-service.
revoke update on table public.profiles from authenticated;
grant update (nickname) on table public.profiles to authenticated;

-- Remove the MVP's public gameplay API. RLS below permits only authenticated
-- participants to read a game's rows; all writes use the guarded RPCs.
revoke all privileges on table public.games, public.players, public.round_actions, public.round_results from public, anon, authenticated;
grant select on table public.games, public.players, public.round_actions, public.round_results to authenticated;

create or replace function public.is_game_participant(p_game_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.players participant
      where participant.game_id = p_game_id
        and participant.profile_id = auth.uid()
    );
$$;

revoke all on function public.is_game_participant(uuid) from public, anon;
grant execute on function public.is_game_participant(uuid) to authenticated, service_role;

drop policy if exists "public games read" on public.games;
drop policy if exists "public games insert" on public.games;
drop policy if exists "public games update" on public.games;
drop policy if exists "public players read" on public.players;
drop policy if exists "public players insert" on public.players;
drop policy if exists "public players update" on public.players;
drop policy if exists "public actions read" on public.round_actions;
drop policy if exists "public actions insert" on public.round_actions;
drop policy if exists "public results read" on public.round_results;

create policy "game participants read games"
on public.games for select to authenticated
using (public.is_game_participant(id));

create policy "game participants read players"
on public.players for select to authenticated
using (public.is_game_participant(game_id));

-- During CHOOSING a player sees only their own action. Once the round is no
-- longer choosing, both participants may inspect the completed round history.
create policy "game participants read allowed actions"
on public.round_actions for select to authenticated
using (
  exists (
    select 1 from public.players own_player
    where own_player.id = round_actions.player_id
      and own_player.profile_id = auth.uid()
  )
  or (
    public.is_game_participant(game_id)
    and exists (
      select 1 from public.games game
      where game.id = round_actions.game_id
        and game.status <> 'CHOOSING'
    )
  )
);

create policy "game participants read results"
on public.round_results for select to authenticated
using (public.is_game_participant(game_id));

create or replace function public.create_pvp_game(p_player_id text)
returns table (game_id uuid, room_code text, human_player_id text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := auth.uid();
  v_game_id uuid;
  v_room_code text;
  v_nickname text;
  v_creature public.player_creatures%rowtype;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if v_profile_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if coalesce(btrim(p_player_id), '') = '' or char_length(p_player_id) > 128 then raise exception 'INVALID_PLAYER_ID'; end if;
  select nickname into v_nickname from public.profiles where id = v_profile_id;
  select * into v_creature from public.player_creatures where profile_id = v_profile_id;
  if v_nickname is null or not found then raise exception 'PROFILE_NOT_READY'; end if;

  loop
    select string_agg(substr(v_alphabet, floor(random() * length(v_alphabet))::int + 1, 1), '')
      into v_room_code
    from generate_series(1, 5);
    begin
      insert into public.games (room_code, game_mode, status, current_round, world_id, round_event_sequence)
      values (v_room_code, 'PVP', 'WAITING', 1, 'AURELIA_PRIME', public.generate_round_event_sequence())
      returning id into v_game_id;
      exit;
    exception when unique_violation then null;
    end;
  end loop;

  insert into public.players (id, game_id, nickname, slot, player_type, traits, connected, profile_id, creature_id, creature_snapshot)
  values (
    p_player_id, v_game_id, v_nickname, 1, 'HUMAN', public.initial_traits(), true, v_profile_id, v_creature.id,
    jsonb_build_object('id', v_creature.id, 'baseCreatureKey', v_creature.base_creature_key, 'name', v_creature.name, 'level', v_creature.level)
  );
  update public.games set player_1_id = p_player_id where id = v_game_id;
  return query select v_game_id, v_room_code, p_player_id;
end;
$$;

create or replace function public.join_pvp_game(p_room_code text, p_player_id text)
returns table (game_id uuid, room_code text, human_player_id text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := auth.uid();
  v_game public.games%rowtype;
  v_existing public.players%rowtype;
  v_nickname text;
  v_creature public.player_creatures%rowtype;
begin
  if v_profile_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if coalesce(btrim(p_player_id), '') = '' or char_length(p_player_id) > 128 then raise exception 'INVALID_PLAYER_ID'; end if;
  select * into v_game from public.games where room_code = upper(btrim(p_room_code)) for update;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;
  if v_game.game_mode <> 'PVP' or v_game.status = 'FINISHED' then raise exception 'GAME_NOT_JOINABLE'; end if;
  select * into v_existing from public.players where game_id = v_game.id and profile_id = v_profile_id and player_type = 'HUMAN' limit 1;
  if found then
    update public.players set connected = true where id = v_existing.id;
    return query select v_game.id, v_game.room_code, v_existing.id;
    return;
  end if;
  if v_game.status <> 'WAITING' or v_game.player_2_id is not null or exists (select 1 from public.players where game_id = v_game.id and slot = 2) then
    raise exception 'GAME_FULL';
  end if;
  select nickname into v_nickname from public.profiles where id = v_profile_id;
  select * into v_creature from public.player_creatures where profile_id = v_profile_id;
  if v_nickname is null or not found then raise exception 'PROFILE_NOT_READY'; end if;
  insert into public.players (id, game_id, nickname, slot, player_type, traits, connected, profile_id, creature_id, creature_snapshot)
  values (
    p_player_id, v_game.id, v_nickname, 2, 'HUMAN', public.initial_traits(), true, v_profile_id, v_creature.id,
    jsonb_build_object('id', v_creature.id, 'baseCreatureKey', v_creature.base_creature_key, 'name', v_creature.name, 'level', v_creature.level)
  );
  update public.games set player_2_id = p_player_id, status = 'CHOOSING', started_at = timezone('utc', now()) where id = v_game.id;
  return query select v_game.id, v_game.room_code, p_player_id;
end;
$$;

create or replace function public.submit_game_round_action(
  p_game_id uuid, p_round_number integer, p_trait text, p_action_type text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := auth.uid();
  v_player public.players%rowtype;
  v_game public.games%rowtype;
begin
  if v_profile_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if p_trait not in ('FEROCITY','ARMOR','AGILITY','SENSES','CAMOUFLAGE')
    or p_action_type not in ('USE','EVOLVE') then raise exception 'INVALID_ACTION'; end if;
  select * into v_game from public.games where id = p_game_id for share;
  if not found or v_game.status <> 'CHOOSING' or v_game.current_round <> p_round_number then raise exception 'ROUND_NOT_OPEN'; end if;
  select * into v_player from public.players where game_id = p_game_id and profile_id = v_profile_id and player_type = 'HUMAN' limit 1;
  if not found then raise exception 'GAME_PARTICIPANT_REQUIRED'; end if;
  insert into public.round_actions (game_id, round_number, player_id, trait, action_type)
  values (p_game_id, p_round_number, v_player.id, p_trait, p_action_type)
  on conflict (game_id, round_number, player_id) do nothing;
end;
$$;

create or replace function public.acknowledge_game_reveal(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_game_participant(p_game_id) then raise exception 'GAME_PARTICIPANT_REQUIRED'; end if;
  update public.games set status = 'ROUND_RESULT' where id = p_game_id and status = 'REVEALING';
end;
$$;

create or replace function public.advance_game_round(p_game_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_game_participant(p_game_id) then raise exception 'GAME_PARTICIPANT_REQUIRED'; end if;
  update public.games
  set current_round = current_round + 1, status = 'CHOOSING'
  where id = p_game_id and status = 'ROUND_RESULT' and current_round < 7;
end;
$$;

create or replace function public.touch_game_participant(p_game_id uuid, p_player_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  update public.players
  set connected = true
  where id = p_player_id and game_id = p_game_id and profile_id = auth.uid();
  if not found then raise exception 'GAME_PARTICIPANT_REQUIRED'; end if;
end;
$$;

create or replace function public.get_game_round_action_state(p_game_id uuid, p_round_number integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player_id text;
  v_action public.round_actions%rowtype;
  v_submitted_count integer;
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select id into v_player_id from public.players
  where game_id = p_game_id and profile_id = auth.uid() and player_type = 'HUMAN'
  limit 1;
  if v_player_id is null then raise exception 'GAME_PARTICIPANT_REQUIRED'; end if;
  select count(*)::integer into v_submitted_count
  from public.round_actions where game_id = p_game_id and round_number = p_round_number;
  select * into v_action from public.round_actions
  where game_id = p_game_id and round_number = p_round_number and player_id = v_player_id;
  return jsonb_build_object('submitted_count', v_submitted_count, 'my_action', case when found then to_jsonb(v_action) else null end);
end;
$$;

-- Preserve the existing signature for the client, but prohibit guest creation
-- and derive nickname/creature information from the authenticated profile.
create or replace function public.create_vs_bot_game(
  p_nickname text,
  p_player_id text,
  p_bot_difficulty text default 'NORMAL',
  p_profile_id uuid default null,
  p_creature_id uuid default null,
  p_creature_snapshot jsonb default null
)
returns table (game_id uuid, room_code text, human_player_id text, bot_player_id text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := auth.uid();
  v_game_id uuid;
  v_room_code text;
  v_bot_player_id text := gen_random_uuid()::text;
  v_nickname text;
  v_creature public.player_creatures%rowtype;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if v_profile_id is null or p_profile_id is distinct from v_profile_id then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if coalesce(btrim(p_player_id), '') = '' or char_length(p_player_id) > 128 then raise exception 'INVALID_PLAYER_ID'; end if;
  if p_bot_difficulty not in ('EASY','NORMAL','HARD') then raise exception 'INVALID_BOT_DIFFICULTY'; end if;
  select nickname into v_nickname from public.profiles where id = v_profile_id;
  select * into v_creature from public.player_creatures where profile_id = v_profile_id and id = p_creature_id;
  if v_nickname is null or not found then raise exception 'PROFILE_NOT_READY'; end if;
  loop
    select string_agg(substr(v_alphabet, floor(random() * length(v_alphabet))::int + 1, 1), '') into v_room_code from generate_series(1, 5);
    begin
      insert into public.games (room_code, game_mode, bot_difficulty, status, current_round, world_id, round_event_sequence, started_at)
      values (v_room_code, 'VS_BOT', p_bot_difficulty, 'CHOOSING', 1, 'AURELIA_PRIME', public.generate_round_event_sequence(), timezone('utc', now())) returning id into v_game_id;
      exit;
    exception when unique_violation then null;
    end;
  end loop;
  insert into public.players (id, game_id, nickname, slot, player_type, traits, connected, profile_id, creature_id, creature_snapshot) values
    (p_player_id, v_game_id, v_nickname, 1, 'HUMAN', public.initial_traits(), true, v_profile_id, v_creature.id,
      jsonb_build_object('id', v_creature.id, 'baseCreatureKey', v_creature.base_creature_key, 'name', v_creature.name, 'level', v_creature.level)),
    (v_bot_player_id, v_game_id, 'Bot', 2, 'BOT', public.initial_traits(), true, null, null, null);
  update public.games set player_1_id = p_player_id, player_2_id = v_bot_player_id where id = v_game_id;
  return query select v_game_id, v_room_code, p_player_id, v_bot_player_id;
end;
$$;

revoke all on function public.create_pvp_game(text), public.join_pvp_game(text, text), public.submit_game_round_action(uuid, integer, text, text), public.acknowledge_game_reveal(uuid), public.advance_game_round(uuid), public.touch_game_participant(uuid, text), public.get_game_round_action_state(uuid, integer), public.create_vs_bot_game(text, text, text, uuid, uuid, jsonb) from public, anon;
grant execute on function public.create_pvp_game(text), public.join_pvp_game(text, text), public.submit_game_round_action(uuid, integer, text, text), public.acknowledge_game_reveal(uuid), public.advance_game_round(uuid), public.touch_game_participant(uuid, text), public.get_game_round_action_state(uuid, integer), public.create_vs_bot_game(text, text, text, uuid, uuid, jsonb) to authenticated, service_role;

-- Real image reservations are both idempotent and economically bounded. A
-- reservation is intentionally not refunded after a provider failure: it may
-- already have reached OpenAI, and retaining it prevents retry-spend loops.
alter table public.creature_transformation_requests
  add column if not exists request_fingerprint text,
  add column if not exists request_day date not null default (timezone('utc', now())::date);
alter table public.creature_transformation_requests
  drop constraint if exists creature_transformation_requests_request_fingerprint_check;
alter table public.creature_transformation_requests
  add constraint creature_transformation_requests_request_fingerprint_check
  check (request_fingerprint is null or request_fingerprint ~ '^[a-f0-9]{64}$');
create unique index if not exists creature_transformation_requests_real_image_fingerprint_day_key
  on public.creature_transformation_requests (profile_id, request_day, request_fingerprint)
  where image_provider_mode = 'REAL' and request_fingerprint is not null;
create index if not exists creature_transformation_requests_real_image_day_status_idx
  on public.creature_transformation_requests (request_day, status)
  where image_provider_mode = 'REAL';

drop function if exists public.reserve_creature_transformation_request(uuid, uuid, text, text, text, smallint, text, text, numeric, integer, numeric, text, text, text, uuid, uuid);
create function public.reserve_creature_transformation_request(
  p_profile_id uuid, p_creature_id uuid, p_idempotency_key text, p_operation text,
  p_visual_trait_id text, p_intensity smallint, p_concept_mode text, p_image_provider_mode text,
  p_estimated_cost_usd numeric, p_daily_request_limit integer, p_daily_budget_usd numeric,
  p_benchmark_case_id text default null, p_generation_profile_id text default null, p_concept_seed text default null,
  p_visual_progress_track_id uuid default null, p_source_visual_version_id uuid default null,
  p_request_fingerprint text default null, p_daily_real_image_limit integer default null,
  p_global_daily_real_image_limit integer default null, p_global_concurrent_real_image_limit integer default null,
  p_real_image_cooldown_seconds integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.creature_transformation_requests%rowtype;
  v_day_start timestamptz := date_trunc('day', timezone('utc', now())) at time zone 'utc';
  v_day date := timezone('utc', now())::date;
  v_count integer;
  v_cost numeric(12,6);
  v_last_created_at timestamptz;
begin
  if (p_benchmark_case_id is null) <> (p_generation_profile_id is null) then raise exception 'benchmark case and generation profile must be paired'; end if;
  if p_benchmark_case_id is not null and p_concept_seed is null then raise exception 'benchmark concept seed is required'; end if;
  if p_request_fingerprint is not null and p_request_fingerprint !~ '^[a-f0-9]{64}$' then raise exception 'invalid request fingerprint'; end if;
  if not exists (select 1 from public.player_creatures where id = p_creature_id and profile_id = p_profile_id) then return jsonb_build_object('outcome','CREATURE_NOT_OWNED'); end if;
  if p_visual_progress_track_id is not null and not exists (select 1 from public.creature_visual_progress_tracks where id = p_visual_progress_track_id and profile_id = p_profile_id and creature_id = p_creature_id) then raise exception 'VISUAL_TRACK_NOT_FOUND'; end if;
  if p_source_visual_version_id is not null and not exists (select 1 from public.creature_visual_versions where id = p_source_visual_version_id and profile_id = p_profile_id and creature_id = p_creature_id and status = 'ACTIVE') then raise exception 'CREATURE_VISUAL_VERSION_CONFLICT'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_profile_id::text || ':' || p_idempotency_key, 0));
  select * into v_request from public.creature_transformation_requests where profile_id = p_profile_id and idempotency_key = p_idempotency_key;
  if found then
    if v_request.request_fingerprint is not null and p_request_fingerprint is not null and v_request.request_fingerprint <> p_request_fingerprint then
      return jsonb_build_object('outcome','IDEMPOTENCY_KEY_REUSED');
    end if;
    return jsonb_build_object('outcome','EXISTING','record',to_jsonb(v_request));
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_profile_id::text || ':' || v_day::text, 1));
  if p_image_provider_mode = 'REAL' then
    if p_daily_real_image_limit is null or p_daily_real_image_limit < 1
      or p_global_daily_real_image_limit is null or p_global_daily_real_image_limit < 1
      or p_global_concurrent_real_image_limit is null or p_global_concurrent_real_image_limit < 1
      or p_real_image_cooldown_seconds < 0 then
      raise exception 'real image limits are not configured';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('real-image-global:' || v_day::text, 2));
    if p_request_fingerprint is not null then
      select * into v_request from public.creature_transformation_requests
      where profile_id = p_profile_id and request_day = v_day and request_fingerprint = p_request_fingerprint and image_provider_mode = 'REAL'
      limit 1;
      if found then return jsonb_build_object('outcome','EXISTING','record',to_jsonb(v_request)); end if;
    end if;
    select count(*)::integer, max(created_at) into v_count, v_last_created_at
    from public.creature_transformation_requests
    where profile_id = p_profile_id and request_day = v_day and image_provider_mode = 'REAL';
    if v_count >= p_daily_real_image_limit then return jsonb_build_object('outcome','REAL_IMAGE_USER_LIMIT_REACHED'); end if;
    select count(*)::integer into v_count from public.creature_transformation_requests
    where profile_id = p_profile_id and request_day = v_day and image_provider_mode = 'REAL' and status in ('RESERVED','RUNNING');
    if v_count >= 1 then return jsonb_build_object('outcome','REAL_IMAGE_USER_CONCURRENCY_REACHED'); end if;
    if v_last_created_at is not null and timezone('utc', now()) < v_last_created_at + make_interval(secs => p_real_image_cooldown_seconds) then
      return jsonb_build_object('outcome','REAL_IMAGE_COOLDOWN_ACTIVE');
    end if;
    select count(*)::integer into v_count from public.creature_transformation_requests where request_day = v_day and image_provider_mode = 'REAL';
    if v_count >= p_global_daily_real_image_limit then return jsonb_build_object('outcome','REAL_IMAGE_GLOBAL_LIMIT_REACHED'); end if;
    select count(*)::integer into v_count from public.creature_transformation_requests
    where request_day = v_day and image_provider_mode = 'REAL' and status in ('RESERVED','RUNNING');
    if v_count >= p_global_concurrent_real_image_limit then return jsonb_build_object('outcome','REAL_IMAGE_GLOBAL_CONCURRENCY_REACHED'); end if;
  end if;

  select count(*)::integer, coalesce(sum(coalesce(actual_cost_usd, estimated_cost_usd, 0)),0)::numeric(12,6)
    into v_count, v_cost
  from public.creature_transformation_requests where profile_id = p_profile_id and created_at >= v_day_start;
  if p_daily_request_limit < 1 or v_count >= p_daily_request_limit then return jsonb_build_object('outcome','DAILY_LIMIT_REACHED'); end if;
  if coalesce(v_cost,0) + coalesce(p_estimated_cost_usd,0) > coalesce(p_daily_budget_usd,0) then return jsonb_build_object('outcome','DAILY_BUDGET_REACHED'); end if;

  insert into public.creature_transformation_requests(
    profile_id, creature_id, idempotency_key, operation, status, visual_trait_id, intensity, concept_mode, image_provider_mode,
    estimated_cost_usd, benchmark_case_id, generation_profile_id, concept_seed, visual_progress_track_id, source_visual_version_id,
    request_fingerprint, request_day
  ) values (
    p_profile_id, p_creature_id, p_idempotency_key, p_operation, 'RESERVED', p_visual_trait_id, p_intensity, p_concept_mode, p_image_provider_mode,
    p_estimated_cost_usd, p_benchmark_case_id, p_generation_profile_id, p_concept_seed, p_visual_progress_track_id, p_source_visual_version_id,
    p_request_fingerprint, v_day
  ) returning * into v_request;
  return jsonb_build_object('outcome','CREATED','record',to_jsonb(v_request));
end;
$$;

revoke all on function public.reserve_creature_transformation_request(uuid, uuid, text, text, text, smallint, text, text, numeric, integer, numeric, text, text, text, uuid, uuid, text, integer, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.reserve_creature_transformation_request(uuid, uuid, text, text, text, smallint, text, text, numeric, integer, numeric, text, text, text, uuid, uuid, text, integer, integer, integer, integer) to service_role;

-- Defense in depth for the unlikely case that public signup is re-enabled by
-- mistake. The hook serializes checks across concurrent signups and the limit
-- is configurable by changing the MAX_REGISTERED_USERS row with service_role
-- or in the SQL editor. Existing users are never removed or disabled.
create table if not exists public.auth_security_settings (
  setting_name text primary key,
  integer_value integer not null check (integer_value between 1 and 100000)
);
insert into public.auth_security_settings (setting_name, integer_value)
values ('MAX_REGISTERED_USERS', 5)
on conflict (setting_name) do nothing;
alter table public.auth_security_settings enable row level security;
revoke all privileges on table public.auth_security_settings from public, anon, authenticated;
grant all privileges on table public.auth_security_settings to service_role;

create or replace function public.hook_enforce_registered_user_limit(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_limit integer;
  v_registered_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('MAX_REGISTERED_USERS', 0));
  select integer_value into v_limit
  from public.auth_security_settings
  where setting_name = 'MAX_REGISTERED_USERS';
  if v_limit is null then
    return jsonb_build_object('error', jsonb_build_object('http_code', 503, 'message', 'Signup limit configuration is unavailable.'));
  end if;
  select count(*)::integer into v_registered_count from auth.users;
  if v_registered_count >= v_limit then
    return jsonb_build_object('error', jsonb_build_object('http_code', 403, 'message', 'The registered user limit has been reached.'));
  end if;
  return '{}'::jsonb;
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_enforce_registered_user_limit(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_enforce_registered_user_limit(jsonb) from public, anon, authenticated;
