-- Five-gene structural schema for adaptations-exhaustion-best-of-seven-v2.
-- Adaptation JSONB defaults, shape constraints, and action-transition guards are
-- generated from shared/game-rules into supabase/generated/game-rules.sql.
create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = timezone('utc', now()); return new; end; $$;

create table public.games (
  id uuid primary key default gen_random_uuid(), room_code text not null unique,
  game_mode text not null default 'PVP' check (game_mode in ('PVP', 'VS_BOT')),
  status text not null check (status in ('WAITING', 'CHOOSING', 'REVEALING', 'ROUND_RESULT', 'FINISHED')),
  current_round integer not null default 1 check (current_round between 1 and 7),
  world_id text not null default 'AURELIA_PRIME', round_event_sequence jsonb not null,
  player_1_id text, player_2_id text, player_1_score integer not null default 0, player_2_score integer not null default 0,
  bot_difficulty text not null default 'NORMAL' check (bot_difficulty in ('EASY', 'NORMAL', 'HARD')),
  winner_id text, started_at timestamptz, finished_at timestamptz, rematch_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now())
);
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check (char_length(btrim(nickname)) between 1 and 20),
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now())
);
create table public.player_creatures (
  id uuid primary key default gen_random_uuid(), profile_id uuid not null unique references public.profiles(id) on delete cascade,
  base_creature_key text not null default 'VERDANT_HATCHLING', name text, level integer not null default 1 check (level >= 1),
  experience integer not null default 0 check (experience >= 0), progression_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now())
);
create table public.players (
  id text primary key, game_id uuid not null references public.games(id) on delete cascade, nickname text not null,
  slot smallint not null check (slot in (1, 2)), player_type text not null default 'HUMAN' check (player_type in ('HUMAN', 'BOT')),
  traits jsonb not null, connected boolean not null default true, profile_id uuid references public.profiles(id) on delete set null,
  creature_id uuid references public.player_creatures(id) on delete set null, creature_snapshot jsonb,
  created_at timestamptz not null default timezone('utc', now()), unique (game_id, slot)
);
create table public.match_rewards (
  id uuid primary key default gen_random_uuid(), game_id uuid not null references public.games(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade, experience_awarded integer not null check (experience_awarded > 0),
  created_at timestamptz not null default timezone('utc', now()), unique (game_id, profile_id)
);
create table public.round_actions (
  id uuid primary key default gen_random_uuid(), game_id uuid not null references public.games(id) on delete cascade,
  round_number integer not null check (round_number between 1 and 7), player_id text not null references public.players(id) on delete cascade,
  trait text not null, action_type text not null check (action_type in ('USE', 'EVOLVE')), created_at timestamptz not null default timezone('utc', now()),
  unique (game_id, round_number, player_id)
);
create table public.round_results (
  id uuid primary key default gen_random_uuid(), game_id uuid not null references public.games(id) on delete cascade,
  round_number integer not null check (round_number between 1 and 7), player_1_value integer not null, player_2_value integer not null,
  winner_id text, resolution_data jsonb not null default '{}'::jsonb, created_at timestamptz not null default timezone('utc', now()), unique (game_id, round_number)
);
create trigger games_set_updated_at before update on public.games for each row execute function public.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger player_creatures_set_updated_at before update on public.player_creatures for each row execute function public.set_updated_at();

create or replace function public.prevent_closed_round_action()
returns trigger language plpgsql as $$
declare current_status text; current_number integer;
begin
  select status, current_round into current_status, current_number from public.games where id = new.game_id;
  if current_status <> 'CHOOSING' or new.round_number <> current_number then raise exception 'round is not open'; end if;
  return new;
end; $$;
create trigger round_actions_only_for_open_round before insert on public.round_actions for each row execute function public.prevent_closed_round_action();

create or replace function public.bootstrap_my_profile()
returns void language plpgsql security definer set search_path = public as $$
declare v_profile_id uuid := auth.uid(); v_nickname text;
begin
  if v_profile_id is null then raise exception 'Authentication is required.'; end if;
  select coalesce(nullif(btrim(raw_user_meta_data ->> 'nickname'), ''), 'Giocatore-' || substr(v_profile_id::text, 1, 6))
    into v_nickname from auth.users where id = v_profile_id;
  if v_nickname is null then raise exception 'Authenticated user not found.'; end if;
  insert into public.profiles (id, nickname) values (v_profile_id, left(v_nickname, 20)) on conflict (id) do nothing;
  insert into public.player_creatures (profile_id, base_creature_key) values (v_profile_id, 'VERDANT_HATCHLING') on conflict (profile_id) do nothing;
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_nickname text := coalesce(nullif(btrim(new.raw_user_meta_data ->> 'nickname'), ''), 'Giocatore-' || substr(new.id::text, 1, 6));
begin
  insert into public.profiles (id, nickname) values (new.id, left(v_nickname, 20)) on conflict (id) do nothing;
  insert into public.player_creatures (profile_id, base_creature_key) values (new.id, 'VERDANT_HATCHLING') on conflict (profile_id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_auth_user();

create or replace function public.validate_player_profile_link()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_nickname text;
begin
  if new.profile_id is null then
    if new.creature_id is not null then raise exception 'A creature requires a profile.'; end if;
    return new;
  end if;
  if new.player_type <> 'HUMAN' then raise exception 'Only human players may have a profile.'; end if;
  if auth.role() <> 'service_role' and auth.uid() is distinct from new.profile_id then raise exception 'Profile does not belong to the authenticated user.'; end if;
  select nickname into v_nickname from public.profiles where id = new.profile_id;
  if v_nickname is null then raise exception 'Profile not found.'; end if;
  if new.creature_id is null or not exists (
    select 1 from public.player_creatures where id = new.creature_id and profile_id = new.profile_id
  ) then raise exception 'Creature does not belong to the profile.'; end if;
  new.nickname := v_nickname;
  return new;
end;
$$;
create trigger players_validate_profile_link before insert or update on public.players for each row execute function public.validate_player_profile_link();

create or replace function public.match_experience_award(p_winner_id text, p_player_id text)
returns integer language sql immutable as $$
  select 10 + case when p_winner_id is null then 3 when p_winner_id = p_player_id then 5 else 0 end;
$$;

create or replace function public.award_finished_game_rewards()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_player record; v_experience integer; v_inserted_rows integer;
begin
  if new.status <> 'FINISHED' or old.status = 'FINISHED' then return new; end if;
  if auth.role() <> 'service_role' then raise exception 'Only the server may finalize a rewarded match.'; end if;
  if not exists (
    select 1 from public.round_results
    where game_id = new.id and round_number = new.current_round
      and resolution_data ->> 'statusAfter' = 'FINISHED'
      and (resolution_data ->> 'winnerIdAfter') is not distinct from new.winner_id
  ) then raise exception 'A match can only be rewarded after a persisted final round resolution.'; end if;
  for v_player in select id, profile_id from public.players where game_id = new.id and player_type = 'HUMAN' and profile_id is not null loop
    v_experience := public.match_experience_award(new.winner_id, v_player.id);
    insert into public.match_rewards (game_id, profile_id, experience_awarded) values (new.id, v_player.profile_id, v_experience)
      on conflict (game_id, profile_id) do nothing;
    get diagnostics v_inserted_rows = row_count;
    if v_inserted_rows > 0 then
      update public.player_creatures
      set experience = experience + v_experience, level = ((experience + v_experience) / 30) + 1
      where profile_id = v_player.profile_id;
    end if;
  end loop;
  return new;
end;
$$;
create trigger games_award_finished_rewards after update of status on public.games for each row execute function public.award_finished_game_rewards();

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
declare
  v_game_id uuid;
  v_room_code text;
  v_bot_player_id text := gen_random_uuid()::text;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_nickname text := btrim(p_nickname);
begin
  if coalesce(v_nickname, '') = '' or coalesce(btrim(p_player_id), '') = '' then raise exception 'Nickname and player_id are required.'; end if;
  if p_bot_difficulty not in ('EASY', 'NORMAL', 'HARD') then raise exception 'Invalid bot difficulty.'; end if;
  if p_profile_id is null then
    if p_creature_id is not null then raise exception 'A creature requires a profile.'; end if;
  else
    if auth.uid() is distinct from p_profile_id then raise exception 'Profile does not belong to the authenticated user.'; end if;
    select nickname into v_nickname from public.profiles where id = p_profile_id;
    if v_nickname is null then raise exception 'Profile not found.'; end if;
    if not exists (select 1 from public.player_creatures where id = p_creature_id and profile_id = p_profile_id) then raise exception 'Creature does not belong to the profile.'; end if;
  end if;
  loop
    select string_agg(substr(v_alphabet, floor(random() * length(v_alphabet))::int + 1, 1), '') into v_room_code from generate_series(1, 5);
    begin
      insert into public.games (room_code, game_mode, bot_difficulty, status, current_round, world_id, round_event_sequence, started_at)
      values (v_room_code, 'VS_BOT', p_bot_difficulty, 'CHOOSING', 1, 'AURELIA_PRIME', public.generate_round_event_sequence(), timezone('utc', now())) returning id into v_game_id;
      exit;
    exception when unique_violation then null; end;
  end loop;
  insert into public.players (id, game_id, nickname, slot, player_type, traits, connected, profile_id, creature_id, creature_snapshot) values
    (p_player_id, v_game_id, v_nickname, 1, 'HUMAN', public.initial_traits(), true, p_profile_id, p_creature_id, p_creature_snapshot),
    (v_bot_player_id, v_game_id, 'Bot', 2, 'BOT', public.initial_traits(), true, null, null, null);
  update public.games set player_1_id = p_player_id, player_2_id = v_bot_player_id where id = v_game_id;
  return query select v_game_id, v_room_code, p_player_id, v_bot_player_id;
end;
$$;

alter table public.games enable row level security; alter table public.players enable row level security;
alter table public.round_actions enable row level security; alter table public.round_results enable row level security;
alter table public.profiles enable row level security; alter table public.player_creatures enable row level security; alter table public.match_rewards enable row level security;
create policy "public games read" on public.games for select to anon, authenticated using (true);
create policy "public games insert" on public.games for insert to anon, authenticated with check (true);
create policy "public games update" on public.games for update to anon, authenticated using (true) with check (true);
create policy "public players read" on public.players for select to anon, authenticated using (true);
create policy "public players insert" on public.players for insert to anon, authenticated with check (true);
create policy "public players update" on public.players for update to anon, authenticated using (true) with check (true);
create policy "public actions read" on public.round_actions for select to anon, authenticated using (true);
create policy "public actions insert" on public.round_actions for insert to anon, authenticated with check (true);
create policy "public results read" on public.round_results for select to anon, authenticated using (true);
create policy "profiles own read" on public.profiles for select to authenticated using (id = auth.uid());
create policy "profiles own update" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "creatures own read" on public.player_creatures for select to authenticated using (profile_id = auth.uid());
create policy "rewards own read" on public.match_rewards for select to authenticated using (profile_id = auth.uid());
create index idx_games_room_code on public.games(room_code); create index idx_players_game_id on public.players(game_id);
create index idx_round_actions_lookup on public.round_actions(game_id, round_number); create index idx_round_results_lookup on public.round_results(game_id, round_number);
create index idx_players_profile_id on public.players(profile_id); create index idx_match_rewards_profile_id on public.match_rewards(profile_id, created_at desc);

grant usage on schema public to anon, authenticated;
grant select, insert, update on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;
grant execute on function public.bootstrap_my_profile() to authenticated;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

do $$ begin if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then create publication supabase_realtime; end if; end $$;
alter publication supabase_realtime add table public.games, public.players, public.round_actions, public.round_results;

-- Apply supabase/generated/game-rules.sql immediately after this structural schema.
