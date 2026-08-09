-- Battle-start evolution draft.
--
-- Each player is offered two anatomical targets when they join a match and picks one. Winning
-- the match credits one win to the chosen target's own counter; losing or drawing credits
-- nothing. Accumulation is per target, so progress on one is never lost by working on another.
--
-- The draw and the choice live here, not on the client: resolve-round reads the stored choice
-- when it credits the win.

begin;

-- ---------------------------------------------------------------------------
-- 1. Draft state on the player row
-- ---------------------------------------------------------------------------

alter table public.players
  add column if not exists evolution_draft_options text[],
  add column if not exists chosen_evolution_target_id text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'players_evolution_draft_options_valid') then
    alter table public.players add constraint players_evolution_draft_options_valid
      check (
        evolution_draft_options is null
        or (
          array_length(evolution_draft_options, 1) between 1 and 6
          and evolution_draft_options <@ array['TAIL','FORELIMBS','HIND_LIMBS','HEAD_AND_SENSES','TORSO_AND_BACK','SKIN']::text[]
        )
      );
  end if;

  -- A choice is only ever one of the options this player was actually offered.
  if not exists (select 1 from pg_constraint where conname = 'players_chosen_evolution_target_offered') then
    alter table public.players add constraint players_chosen_evolution_target_offered
      check (
        chosen_evolution_target_id is null
        or (evolution_draft_options is not null and chosen_evolution_target_id = any(evolution_draft_options))
      );
  end if;
end;
$$;

create or replace function public.draw_evolution_draft_options(p_count integer default 2)
returns text[]
language sql
volatile
set search_path = public
as $$
  select array(
    select target
    from unnest(array['TAIL','FORELIMBS','HIND_LIMBS','HEAD_AND_SENSES','TORSO_AND_BACK','SKIN']) as target
    order by random()
    limit greatest(1, least(coalesce(p_count, 2), 6))
  );
$$;

-- Filled by a trigger so create_pvp_game, create_vs_bot_game and join_pvp_game stay untouched.
create or replace function public.set_player_evolution_draft()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.evolution_draft_options is null then
    new.evolution_draft_options := public.draw_evolution_draft_options(2);
  end if;

  return new;
end;
$$;

drop trigger if exists players_set_evolution_draft on public.players;
create trigger players_set_evolution_draft
  before insert on public.players
  for each row execute function public.set_player_evolution_draft();

-- Existing rows keep working: a match already in flight simply has no draft.
update public.players
set evolution_draft_options = public.draw_evolution_draft_options(2)
where evolution_draft_options is null;

-- ---------------------------------------------------------------------------
-- 2. Per-target win counters
-- ---------------------------------------------------------------------------

create table if not exists public.creature_evolution_target_progress (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  creature_id uuid not null references public.player_creatures(id) on delete cascade,
  evolution_target_id text not null check (evolution_target_id in ('TAIL','FORELIMBS','HIND_LIMBS','HEAD_AND_SENSES','TORSO_AND_BACK','SKIN')),
  wins integer not null default 0 check (wins >= 0),
  target integer not null check (target between 1 and 100),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (creature_id, evolution_target_id)
);

create index if not exists creature_evolution_target_progress_creature_idx
  on public.creature_evolution_target_progress (creature_id);

-- One credit per player per match, whatever the retry behaviour upstream.
create table if not exists public.creature_evolution_target_progress_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  creature_id uuid not null references public.player_creatures(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  evolution_target_id text,
  outcome text not null check (outcome in ('WIN','LOSS','DRAW')),
  awarded_wins integer not null default 0 check (awarded_wins >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  unique (profile_id, game_id)
);

alter table public.creature_evolution_target_progress enable row level security;
alter table public.creature_evolution_target_progress_events enable row level security;
revoke all on table public.creature_evolution_target_progress from public, anon, authenticated;
revoke all on table public.creature_evolution_target_progress_events from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Choosing a target at the start of a match
-- ---------------------------------------------------------------------------

create or replace function public.choose_evolution_draft_target(
  p_game_id uuid,
  p_evolution_target_id text
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
begin
  if v_profile_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;

  select * into v_game from public.games where id = p_game_id;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;
  if v_game.status = 'FINISHED' then raise exception 'EVOLUTION_DRAFT_CLOSED'; end if;

  select * into v_player
  from public.players
  where game_id = p_game_id and profile_id = v_profile_id and player_type = 'HUMAN'
  for update;
  if not found then raise exception 'GAME_PARTICIPANT_REQUIRED'; end if;

  -- Idempotent: replaying the same choice is a no-op, changing it after the fact is refused.
  if v_player.chosen_evolution_target_id is not null then
    if v_player.chosen_evolution_target_id = p_evolution_target_id then
      return to_jsonb(v_player);
    end if;
    raise exception 'EVOLUTION_DRAFT_ALREADY_CHOSEN';
  end if;

  if v_player.evolution_draft_options is null or not (p_evolution_target_id = any(v_player.evolution_draft_options)) then
    raise exception 'EVOLUTION_TARGET_NOT_OFFERED';
  end if;

  update public.players
  set chosen_evolution_target_id = p_evolution_target_id
  where id = v_player.id
  returning * into v_player;

  return to_jsonb(v_player);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Crediting the win, from resolve-round only
-- ---------------------------------------------------------------------------

create or replace function public.record_evolution_target_win_from_match_completion(
  p_game_id uuid,
  p_profile_id uuid,
  p_creature_id uuid,
  p_outcome text,
  p_target integer,
  p_completed_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_choice text;
  v_awarded integer;
  v_inserted integer;
  v_progress public.creature_evolution_target_progress%rowtype;
begin
  if p_outcome not in ('WIN','LOSS','DRAW') then raise exception 'EVOLUTION_TARGET_STATE_CONFLICT'; end if;
  if p_target < 1 or p_target > 100 then raise exception 'EVOLUTION_TARGET_STATE_CONFLICT'; end if;

  select chosen_evolution_target_id into v_choice
  from public.players
  where game_id = p_game_id and profile_id = p_profile_id and player_type = 'HUMAN'
  limit 1;

  v_awarded := case when p_outcome = 'WIN' and v_choice is not null then 1 else 0 end;

  insert into public.creature_evolution_target_progress_events(
    profile_id, creature_id, game_id, evolution_target_id, outcome, awarded_wins, created_at
  )
  values (
    p_profile_id, p_creature_id, p_game_id, v_choice, p_outcome, v_awarded,
    coalesce(p_completed_at, timezone('utc', now()))
  )
  on conflict (profile_id, game_id) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then return jsonb_build_object('outcome', 'ALREADY_RECORDED'); end if;
  if v_awarded = 0 then return jsonb_build_object('outcome', 'NO_AWARD', 'chosenTarget', v_choice); end if;

  insert into public.creature_evolution_target_progress(profile_id, creature_id, evolution_target_id, wins, target)
  values (p_profile_id, p_creature_id, v_choice, 1, p_target)
  on conflict (creature_id, evolution_target_id) do update
    set wins = public.creature_evolution_target_progress.wins + 1,
        updated_at = timezone('utc', now())
  returning * into v_progress;

  return jsonb_build_object('outcome', 'RECORDED', 'progress', to_jsonb(v_progress));
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Reading a creature's counters
-- ---------------------------------------------------------------------------

create or replace function public.get_creature_evolution_target_progress(
  p_creature_id uuid,
  p_target integer default 3
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := auth.uid();
begin
  if v_profile_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not exists (select 1 from public.player_creatures where id = p_creature_id and profile_id = v_profile_id) then
    raise exception 'CREATURE_NOT_OWNED';
  end if;

  -- Every target is reported, including those never accumulated on.
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'evolutionTargetId', catalogue.target,
      'wins', coalesce(stored.wins, 0),
      'target', coalesce(stored.target, greatest(1, least(coalesce(p_target, 3), 100)))
    ) order by catalogue.ordinality), '[]'::jsonb)
    from unnest(array['TAIL','FORELIMBS','HIND_LIMBS','HEAD_AND_SENSES','TORSO_AND_BACK','SKIN'])
      with ordinality as catalogue(target, ordinality)
    left join public.creature_evolution_target_progress stored
      on stored.creature_id = p_creature_id and stored.evolution_target_id = catalogue.target
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Spending a full counter to open a transformation
-- ---------------------------------------------------------------------------

-- The accumulator and the generation workflow stay separate: this consumes the wins banked on
-- one target and opens an already-READY track, so the existing generate/adopt pipeline runs
-- unchanged from there.
create or replace function public.open_evolution_track_from_ready_target(
  p_creature_id uuid,
  p_evolution_target_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := auth.uid();
  v_progress public.creature_evolution_target_progress%rowtype;
  v_track public.creature_visual_progress_tracks%rowtype;
begin
  if v_profile_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if p_evolution_target_id not in ('TAIL','FORELIMBS','HIND_LIMBS','HEAD_AND_SENSES','TORSO_AND_BACK','SKIN') then
    raise exception 'EVOLUTION_TARGET_INVALID';
  end if;
  if not exists (select 1 from public.player_creatures where id = p_creature_id and profile_id = v_profile_id) then
    raise exception 'CREATURE_NOT_OWNED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('visual-track:' || p_creature_id::text, 0));

  if exists (
    select 1 from public.creature_visual_progress_tracks
    where creature_id = p_creature_id and status in ('ACTIVE','READY','GENERATING','POST_PROCESSING','GENERATED')
  ) then
    raise exception 'VISUAL_TRACK_ALREADY_ACTIVE';
  end if;

  select * into v_progress
  from public.creature_evolution_target_progress
  where creature_id = p_creature_id and evolution_target_id = p_evolution_target_id
  for update;
  if not found or v_progress.wins < v_progress.target then raise exception 'EVOLUTION_TARGET_NOT_READY'; end if;

  -- Surplus wins carry over to the next transformation on the same target.
  update public.creature_evolution_target_progress
  set wins = v_progress.wins - v_progress.target,
      updated_at = timezone('utc', now())
  where id = v_progress.id;

  insert into public.creature_visual_progress_tracks(
    profile_id, creature_id, visual_trait_id, evolution_target_id, status, progress, target, ready_at
  )
  values (
    v_profile_id, p_creature_id, null, p_evolution_target_id, 'READY',
    v_progress.target, v_progress.target, timezone('utc', now())
  )
  returning * into v_track;

  return to_jsonb(v_track);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Grants
-- ---------------------------------------------------------------------------

revoke all on function public.draw_evolution_draft_options(integer) from public, anon, authenticated;
grant execute on function public.draw_evolution_draft_options(integer) to service_role;

revoke all on function public.choose_evolution_draft_target(uuid, text) from public, anon;
grant execute on function public.choose_evolution_draft_target(uuid, text) to authenticated, service_role;

revoke all on function public.record_evolution_target_win_from_match_completion(uuid, uuid, uuid, text, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.record_evolution_target_win_from_match_completion(uuid, uuid, uuid, text, integer, timestamptz) to service_role;

revoke all on function public.get_creature_evolution_target_progress(uuid, integer) from public, anon;
grant execute on function public.get_creature_evolution_target_progress(uuid, integer) to authenticated, service_role;

revoke all on function public.open_evolution_track_from_ready_target(uuid, text) from public, anon;
grant execute on function public.open_evolution_track_from_ready_target(uuid, text) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
