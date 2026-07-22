-- Structural refactor: environment model -> world + round events.
-- Existing matches can be discarded; keep migration idempotent where practical.

alter table public.games
add column if not exists world_id text;

alter table public.games
add column if not exists round_event_sequence jsonb;

update public.games
set
  world_id = coalesce(world_id, 'AURELIA_PRIME'),
  round_event_sequence = coalesce(
    round_event_sequence,
    '[]'::jsonb
  );

alter table public.games
alter column world_id set not null;

alter table public.games
alter column round_event_sequence set not null;

alter table public.games
drop column if exists environment_sequence;