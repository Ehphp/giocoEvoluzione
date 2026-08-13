-- Competitive PvP skill rating. This deliberately remains independent from
-- creature XP, level, visual progression and VS_BOT matches.

alter table public.profiles
  add column if not exists skill_rating integer not null default 1000;

create table if not exists public.competitive_rating_events (
  game_id uuid not null references public.games(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  rating_before integer not null,
  delta integer not null,
  rating_after integer not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (game_id, profile_id),
  constraint competitive_rating_events_rating_after_check
    check (rating_after = rating_before + delta)
);

create index if not exists competitive_rating_events_profile_created_at_idx
  on public.competitive_rating_events (profile_id, created_at desc);

-- Elo MVP: K = 32, scale = 400. The caller derives player two's delta as the
-- exact negative of player one's delta, preserving a zero-sum result after
-- integer rounding.
create or replace function public.competitive_elo_delta(
  p_rating integer,
  p_opponent_rating integer,
  p_score numeric
)
returns integer
language sql
immutable
strict
set search_path = public
as $$
  select round(
    32::numeric * (
      p_score - (
        1::numeric / (1::numeric + power(10::numeric, (p_opponent_rating - p_rating)::numeric / 400::numeric))
      )
    )
  )::integer;
$$;

create or replace function public.apply_finished_game_competitive_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_player_1 public.players%rowtype;
  v_player_2 public.players%rowtype;
  v_locked_profile record;
  v_rating_1 integer;
  v_rating_2 integer;
  v_delta_1 integer;
  v_delta_2 integer;
  v_score_1 numeric;
  v_event_count integer;
  v_participant_count integer;
begin
  if new.status <> 'FINISHED' or old.status = 'FINISHED' then
    return new;
  end if;

  if auth.role() <> 'service_role' then
    raise exception 'Only the server may finalize a competitive match.';
  end if;

  -- Bot, guest and legacy/incomplete matches are never competitive matches.
  if new.game_mode <> 'PVP' then
    return new;
  end if;

  if not exists (
    select 1
    from public.round_results
    where game_id = new.id
      and round_number = new.current_round
      and resolution_data ->> 'statusAfter' = 'FINISHED'
      and (resolution_data ->> 'winnerIdAfter') is not distinct from new.winner_id
  ) then
    raise exception 'A competitive match requires a persisted final round resolution.';
  end if;

  select count(*)::integer into v_participant_count
  from public.players
  where game_id = new.id;

  select * into v_player_1
  from public.players
  where game_id = new.id and id = new.player_1_id and slot = 1;
  if not found then
    raise exception 'Competitive match player one is invalid.';
  end if;

  select * into v_player_2
  from public.players
  where game_id = new.id and id = new.player_2_id and slot = 2;
  if not found then
    raise exception 'Competitive match player two is invalid.';
  end if;

  if v_participant_count <> 2
    or v_player_1.player_type <> 'HUMAN'
    or v_player_2.player_type <> 'HUMAN'
    or v_player_1.profile_id is null
    or v_player_2.profile_id is null
    or v_player_1.profile_id = v_player_2.profile_id
    or (new.winner_id is not null and new.winner_id not in (v_player_1.id, v_player_2.id)) then
    raise exception 'Competitive match requires two distinct human profiles.';
  end if;

  -- The game row is already locked by commit_game_round_resolution. Lock the
  -- rating rows in UUID order as well, so concurrent games sharing a player
  -- cannot calculate from stale ratings or deadlock each other.
  for v_locked_profile in
    select id, skill_rating
    from public.profiles
    where id in (v_player_1.profile_id, v_player_2.profile_id)
    order by id
    for update
  loop
    if v_locked_profile.id = v_player_1.profile_id then
      v_rating_1 := v_locked_profile.skill_rating;
    elsif v_locked_profile.id = v_player_2.profile_id then
      v_rating_2 := v_locked_profile.skill_rating;
    end if;
  end loop;

  if v_rating_1 is null or v_rating_2 is null then
    raise exception 'Competitive match profile is invalid.';
  end if;

  select count(*)::integer into v_event_count
  from public.competitive_rating_events
  where game_id = new.id;

  if v_event_count > 0 then
    if v_event_count <> 2 then
      raise exception 'Competitive rating event set is incomplete.';
    end if;

    return new;
  end if;

  v_score_1 := case
    when new.winner_id is null then 0.5::numeric
    when new.winner_id = v_player_1.id then 1::numeric
    else 0::numeric
  end;
  v_delta_1 := public.competitive_elo_delta(v_rating_1, v_rating_2, v_score_1);
  v_delta_2 := -v_delta_1;

  insert into public.competitive_rating_events (
    game_id, profile_id, rating_before, delta, rating_after
  ) values
    (new.id, v_player_1.profile_id, v_rating_1, v_delta_1, v_rating_1 + v_delta_1),
    (new.id, v_player_2.profile_id, v_rating_2, v_delta_2, v_rating_2 + v_delta_2);

  update public.profiles
  set skill_rating = case
    when id = v_player_1.profile_id then v_rating_1 + v_delta_1
    when id = v_player_2.profile_id then v_rating_2 + v_delta_2
    else skill_rating
  end
  where id in (v_player_1.profile_id, v_player_2.profile_id);

  return new;
end;
$$;

drop trigger if exists games_apply_finished_competitive_rating on public.games;
create trigger games_apply_finished_competitive_rating
after update of status on public.games
for each row execute function public.apply_finished_game_competitive_rating();

alter table public.competitive_rating_events enable row level security;
revoke all on table public.competitive_rating_events from public, anon, authenticated;
grant select on table public.competitive_rating_events to authenticated;

drop policy if exists "competitive rating events own read" on public.competitive_rating_events;
create policy "competitive rating events own read"
on public.competitive_rating_events
for select to authenticated
using (profile_id = auth.uid());

-- Existing profile grants only allow updating nickname; state the invariant
-- explicitly in this migration too.
revoke update (skill_rating) on table public.profiles from anon, authenticated;

create or replace function public.get_competitive_leaderboard(p_limit integer default 50)
returns table (rank_position integer, nickname text, skill_rating integer)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
begin
  if auth.uid() is null then
    raise exception 'AUTHENTICATION_REQUIRED';
  end if;

  return query
  select
    row_number() over (order by profile.skill_rating desc, profile.nickname asc, profile.id asc)::integer,
    profile.nickname,
    profile.skill_rating
  from public.profiles profile
  order by profile.skill_rating desc, profile.nickname asc, profile.id asc
  limit v_limit;
end;
$$;

revoke all on function public.competitive_elo_delta(integer, integer, numeric) from public, anon, authenticated;
revoke all on function public.apply_finished_game_competitive_rating() from public, anon, authenticated;
revoke all on function public.get_competitive_leaderboard(integer) from public, anon;
grant execute on function public.get_competitive_leaderboard(integer) to authenticated, service_role;

notify pgrst, 'reload schema';
