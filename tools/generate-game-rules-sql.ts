import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ADAPTATION_IDS, MAX_ADAPTATION_LEVEL, ROUND_EVENT_DEFINITIONS } from '../shared/game-rules/index.ts'
const outputPath = resolve(import.meta.dirname, '../supabase/generated/game-rules.sql')
const adaptationIds = ADAPTATION_IDS.map((adaptation) => `'${adaptation}'`).join(', ')
const initialAdaptations = ADAPTATION_IDS.map(
    (adaptation) => `'${adaptation}', jsonb_build_object('level', 0, 'exhausted', false)`,
).join(',\n      ')
const adaptationStateChecks = ADAPTATION_IDS.map(
    (adaptation) =>
        `jsonb_typeof(value->'${adaptation}') = 'object' and value->'${adaptation}' ? 'level' and value->'${adaptation}' ? 'exhausted' and value->'${adaptation}'->>'level' in ('0', '1', '2') and jsonb_typeof(value->'${adaptation}'->'exhausted') = 'boolean'`,
).join('\n    and ')
const eventIds = ROUND_EVENT_DEFINITIONS.map((roundEvent) => `'${roundEvent.id}'`).join(',\n      ')
const generated = `-- Generated from shared/game-rules/catalog.ts. Do not edit manually.

create or replace function public.initial_traits()
returns jsonb language sql immutable as $$
  select jsonb_build_object(
      ${initialAdaptations}
  );
$$;

alter table public.players alter column traits set default public.initial_traits();
create or replace function public.is_valid_adaptation_collection(value jsonb)
returns boolean language sql immutable as $$
  select jsonb_typeof(value) = 'object'
    and (select count(*) from jsonb_object_keys(value)) = ${ADAPTATION_IDS.length}
    and ${adaptationStateChecks};
$$;
alter table public.players drop constraint if exists players_traits_adaptation_state_check;
alter table public.players add constraint players_traits_adaptation_state_check check (public.is_valid_adaptation_collection(traits));

alter table public.round_actions drop constraint if exists round_actions_trait_check;
alter table public.round_actions add constraint round_actions_trait_check
  check (trait in (${adaptationIds}));

create or replace function public.validate_round_action_transition()
returns trigger language plpgsql as $$
declare adaptation jsonb; adaptation_level integer; adaptation_exhausted boolean;
begin
  select traits->new.trait into adaptation from public.players where id = new.player_id and game_id = new.game_id;
  if adaptation is null then raise exception 'unknown adaptation state'; end if;
  adaptation_level := (adaptation->>'level')::integer;
  adaptation_exhausted := (adaptation->>'exhausted')::boolean;
  if new.action_type = 'USE' and adaptation_exhausted then raise exception 'adaptation is exhausted'; end if;
  if new.action_type = 'EVOLVE' and adaptation_level >= ${MAX_ADAPTATION_LEVEL} and not adaptation_exhausted then raise exception 'EVOLVE would produce no transition'; end if;
  return new;
end; $$;
drop trigger if exists round_actions_validate_transition on public.round_actions;
create trigger round_actions_validate_transition before insert on public.round_actions for each row execute function public.validate_round_action_transition();

create or replace function public.generate_round_event_sequence()
returns jsonb language sql as $$
  with shuffled as materialized (
    select event_id, row_number() over () as position
    from (select event_id from unnest(array[
      ${eventIds}
    ]::text[]) event_id order by random()) randomized
  )
  select jsonb_agg(event_id order by position)
  from (
    select event_id, position from shuffled
    union all
    select event_id, 7 as position from shuffled where position = 1
  ) best_of_seven;
$$;

-- Bot game creation is structural and lives in supabase/schema.sql.
`
if (process.argv.includes('--check')) {
    if (readFileSync(outputPath, 'utf8') !== generated)
        throw new Error('supabase/generated/game-rules.sql is stale. Run npm run rules:generate.')
} else writeFileSync(outputPath, generated)
