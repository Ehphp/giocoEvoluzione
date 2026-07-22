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
  status text not null check (status in ('WAITING', 'CHOOSING', 'REVEALING', 'ROUND_RESULT', 'FINISHED')),
  current_round integer not null default 1 check (current_round between 1 and 6),
  environment_sequence jsonb not null,
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