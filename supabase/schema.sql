create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique,
  game_mode text not null default 'PVP' check (game_mode in ('PVP', 'VS_BOT')),
  status text not null check (status in ('WAITING', 'CHOOSING', 'REVEALING', 'ROUND_RESULT', 'FINISHED')),
  current_round integer not null default 1 check (current_round between 1 and 6),
  world_id text not null,
  round_event_sequence jsonb not null,
  player_1_id text,
  player_2_id text,
  player_1_score integer not null default 0,
  player_2_score integer not null default 0,
  winner_id text,
  started_at timestamptz,
  finished_at timestamptz,
  rematch_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.players (
  id text primary key,
  game_id uuid not null references public.games(id) on delete cascade,
  nickname text not null,
  slot smallint not null check (slot in (1, 2)),
  player_type text not null default 'HUMAN' check (player_type in ('HUMAN', 'BOT')),
  traits jsonb not null,
  connected boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  unique (game_id, slot)
);

create table if not exists public.round_actions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  round_number integer not null check (round_number between 1 and 6),
  player_id text not null references public.players(id) on delete cascade,
  trait text not null check (
    trait in (
      'STRENGTH',
      'RESISTANCE',
      'AGILITY',
      'PERCEPTION',
      'METABOLISM',
      'ADAPTATION',
      'GRIP_CLAWS',
      'CAMOUFLAGE',
      'WEBBED_LIMBS',
      'FAT_RESERVES'
    )
  ),
  action_type text not null check (action_type in ('USE', 'EVOLVE')),
  created_at timestamptz not null default timezone('utc', now()),
  unique (game_id, round_number, player_id)
);

create table if not exists public.round_results (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  round_number integer not null check (round_number between 1 and 6),
  player_1_value integer not null,
  player_2_value integer not null,
  winner_id text,
  resolution_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  unique (game_id, round_number)
);

create trigger games_set_updated_at
before update on public.games
for each row
execute function public.set_updated_at();

create or replace function public.generate_round_event_sequence()
returns jsonb
language sql
as $$
  select coalesce(jsonb_agg(event_id), '[]'::jsonb)
  from (
    select event_id
    from unnest(ARRAY[
      'VOLCANIC_ASH_WAVE',
      'PROLONGED_ECLIPSE',
      'PREDATOR_PACK_MIGRATION',
      'HEAT_SPIKE',
      'NUTRIENT_COLLAPSE',
      'FLASH_FLOOD'
    ]::text[]) as event_id
    order by random()
  ) shuffled;
$$;

create or replace function public.create_vs_bot_game(p_nickname text, p_player_id text)
returns table (
  game_id uuid,
  room_code text,
  human_player_id text,
  bot_player_id text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room_code text;
  v_game_id uuid;
  v_bot_player_id text := gen_random_uuid()::text;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if p_nickname is null or btrim(p_nickname) = '' then
    raise exception 'Nickname required.';
  end if;

  if p_player_id is null or btrim(p_player_id) = '' then
    raise exception 'player_id required.';
  end if;

  loop
    select string_agg(substr(v_alphabet, floor(random() * length(v_alphabet))::int + 1, 1), '')
    into v_room_code
    from generate_series(1, 5);

    begin
      insert into public.games (
        room_code,
        game_mode,
        status,
        current_round,
        world_id,
        round_event_sequence,
        player_1_score,
        player_2_score,
        started_at
      ) values (
        v_room_code,
        'VS_BOT',
        'CHOOSING',
        1,
        'AURELIA_PRIME',
        public.generate_round_event_sequence(),
        0,
        0,
        timezone('utc', now())
      )
      returning id into v_game_id;

      exit;
    exception
      when unique_violation then
        null;
    end;
  end loop;

  insert into public.players (
    id,
    game_id,
    nickname,
    slot,
    player_type,
    traits,
    connected
  ) values (
    p_player_id,
    v_game_id,
    btrim(p_nickname),
    1,
    'HUMAN',
    jsonb_build_object(
      'STRENGTH', jsonb_build_object('level', 0, 'cooldown', 0),
      'RESISTANCE', jsonb_build_object('level', 0, 'cooldown', 0),
      'AGILITY', jsonb_build_object('level', 0, 'cooldown', 0),
      'PERCEPTION', jsonb_build_object('level', 0, 'cooldown', 0),
      'METABOLISM', jsonb_build_object('level', 0, 'cooldown', 0),
      'ADAPTATION', jsonb_build_object('level', 0, 'cooldown', 0),
      'GRIP_CLAWS', jsonb_build_object('level', 0, 'cooldown', 0),
      'CAMOUFLAGE', jsonb_build_object('level', 0, 'cooldown', 0),
      'WEBBED_LIMBS', jsonb_build_object('level', 0, 'cooldown', 0),
      'FAT_RESERVES', jsonb_build_object('level', 0, 'cooldown', 0)
    ),
    true
  );

  insert into public.players (
    id,
    game_id,
    nickname,
    slot,
    player_type,
    traits,
    connected
  ) values (
    v_bot_player_id,
    v_game_id,
    'Bot',
    2,
    'BOT',
    jsonb_build_object(
      'STRENGTH', jsonb_build_object('level', 0, 'cooldown', 0),
      'RESISTANCE', jsonb_build_object('level', 0, 'cooldown', 0),
      'AGILITY', jsonb_build_object('level', 0, 'cooldown', 0),
      'PERCEPTION', jsonb_build_object('level', 0, 'cooldown', 0),
      'METABOLISM', jsonb_build_object('level', 0, 'cooldown', 0),
      'ADAPTATION', jsonb_build_object('level', 0, 'cooldown', 0),
      'GRIP_CLAWS', jsonb_build_object('level', 0, 'cooldown', 0),
      'CAMOUFLAGE', jsonb_build_object('level', 0, 'cooldown', 0),
      'WEBBED_LIMBS', jsonb_build_object('level', 0, 'cooldown', 0),
      'FAT_RESERVES', jsonb_build_object('level', 0, 'cooldown', 0)
    ),
    true
  );

  update public.games
  set
    player_1_id = p_player_id,
    player_2_id = v_bot_player_id,
    started_at = timezone('utc', now()),
    status = 'CHOOSING'
  where id = v_game_id;

  return query
  select v_game_id, v_room_code, p_player_id, v_bot_player_id;
end;
$$;

create or replace function public.prevent_second_human_in_vs_bot()
returns trigger
language plpgsql
as $$
declare
  v_game_mode text;
  v_human_count integer;
begin
  select game_mode into v_game_mode
  from public.games
  where id = new.game_id;

  if v_game_mode = 'VS_BOT' and new.player_type = 'HUMAN' then
    select count(*) into v_human_count
    from public.players
    where game_id = new.game_id
      and player_type = 'HUMAN'
      and id <> new.id;

    if v_human_count >= 1 then
      raise exception 'VS_BOT games accept only one human player.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists players_block_second_human_vs_bot on public.players;
create trigger players_block_second_human_vs_bot
before insert or update of game_id, player_type on public.players
for each row
execute function public.prevent_second_human_in_vs_bot();

alter table public.games enable row level security;
alter table public.players enable row level security;
alter table public.round_actions enable row level security;
alter table public.round_results enable row level security;

drop policy if exists "public games read" on public.games;
create policy "public games read"
on public.games
for select
to anon, authenticated
using (true);

drop policy if exists "public games insert" on public.games;
create policy "public games insert"
on public.games
for insert
to anon, authenticated
with check (true);

drop policy if exists "public games update" on public.games;
create policy "public games update"
on public.games
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "public players read" on public.players;
create policy "public players read"
on public.players
for select
to anon, authenticated
using (true);

drop policy if exists "public players insert" on public.players;
create policy "public players insert"
on public.players
for insert
to anon, authenticated
with check (true);

drop policy if exists "public players update" on public.players;
create policy "public players update"
on public.players
for update
to anon, authenticated
using (true)
with check (true);

drop policy if exists "public actions read" on public.round_actions;
create policy "public actions read"
on public.round_actions
for select
to anon, authenticated
using (true);

drop policy if exists "public actions insert" on public.round_actions;
create policy "public actions insert"
on public.round_actions
for insert
to anon, authenticated
with check (true);

drop policy if exists "public results read" on public.round_results;
create policy "public results read"
on public.round_results
for select
to anon, authenticated
using (true);

create index if not exists idx_games_room_code on public.games(room_code);
create index if not exists idx_players_game_id on public.players(game_id);
create index if not exists idx_round_actions_lookup on public.round_actions(game_id, round_number);
create index if not exists idx_round_results_lookup on public.round_results(game_id, round_number);

-- MVP only: permissive RLS and public read/write are intentional for friend testing.
-- The schema also enables Realtime publication so sync works without dashboard steps.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'games'
  ) then
    execute 'alter publication supabase_realtime add table public.games';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'players'
  ) then
    execute 'alter publication supabase_realtime add table public.players';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'round_actions'
  ) then
    execute 'alter publication supabase_realtime add table public.round_actions';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'round_results'
  ) then
    execute 'alter publication supabase_realtime add table public.round_results';
  end if;
end
$$;