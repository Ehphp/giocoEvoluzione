-- Five-gene MVP baseline. This file is intentionally destructive only when used
-- through the reset procedure documented in README.md.
create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = timezone('utc', now()); return new; end; $$;

create table public.games (
  id uuid primary key default gen_random_uuid(), room_code text not null unique,
  game_mode text not null default 'PVP' check (game_mode in ('PVP', 'VS_BOT')),
  status text not null check (status in ('WAITING', 'CHOOSING', 'REVEALING', 'ROUND_RESULT', 'FINISHED')),
  current_round integer not null default 1 check (current_round between 1 and 6),
  world_id text not null default 'AURELIA_PRIME', round_event_sequence jsonb not null,
  player_1_id text, player_2_id text, player_1_score integer not null default 0, player_2_score integer not null default 0,
  winner_id text, started_at timestamptz, finished_at timestamptz, rematch_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()), updated_at timestamptz not null default timezone('utc', now())
);
create table public.players (
  id text primary key, game_id uuid not null references public.games(id) on delete cascade, nickname text not null,
  slot smallint not null check (slot in (1, 2)), player_type text not null default 'HUMAN' check (player_type in ('HUMAN', 'BOT')),
  traits jsonb not null, connected boolean not null default true, created_at timestamptz not null default timezone('utc', now()), unique (game_id, slot)
);
create table public.round_actions (
  id uuid primary key default gen_random_uuid(), game_id uuid not null references public.games(id) on delete cascade,
  round_number integer not null check (round_number between 1 and 6), player_id text not null references public.players(id) on delete cascade,
  trait text not null, action_type text not null check (action_type in ('USE', 'EVOLVE')), created_at timestamptz not null default timezone('utc', now()),
  unique (game_id, round_number, player_id)
);
create table public.round_results (
  id uuid primary key default gen_random_uuid(), game_id uuid not null references public.games(id) on delete cascade,
  round_number integer not null check (round_number between 1 and 6), player_1_value integer not null, player_2_value integer not null,
  winner_id text, resolution_data jsonb not null default '{}'::jsonb, created_at timestamptz not null default timezone('utc', now()), unique (game_id, round_number)
);
create trigger games_set_updated_at before update on public.games for each row execute function public.set_updated_at();

alter table public.games enable row level security; alter table public.players enable row level security;
alter table public.round_actions enable row level security; alter table public.round_results enable row level security;
create policy "public games read" on public.games for select to anon, authenticated using (true);
create policy "public games insert" on public.games for insert to anon, authenticated with check (true);
create policy "public games update" on public.games for update to anon, authenticated using (true) with check (true);
create policy "public players read" on public.players for select to anon, authenticated using (true);
create policy "public players insert" on public.players for insert to anon, authenticated with check (true);
create policy "public players update" on public.players for update to anon, authenticated using (true) with check (true);
create policy "public actions read" on public.round_actions for select to anon, authenticated using (true);
create policy "public actions insert" on public.round_actions for insert to anon, authenticated with check (true);
create policy "public results read" on public.round_results for select to anon, authenticated using (true);
create index idx_games_room_code on public.games(room_code); create index idx_players_game_id on public.players(game_id);
create index idx_round_actions_lookup on public.round_actions(game_id, round_number); create index idx_round_results_lookup on public.round_results(game_id, round_number);

grant usage on schema public to anon, authenticated;
grant select, insert, update on all tables in schema public to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
grant execute on all functions in schema public to anon, authenticated;

do $$ begin if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then create publication supabase_realtime; end if; end $$;
alter publication supabase_realtime add table public.games, public.players, public.round_actions, public.round_results;

-- Apply supabase/generated/game-rules.sql immediately after this baseline.
