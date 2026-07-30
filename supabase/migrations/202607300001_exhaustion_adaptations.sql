-- Generated migration for adaptations-exhaustion-best-of-seven-v2. Do not edit manually.
-- Development games are intentionally invalidated; structural tables remain intact.
begin;
delete from public.games;

-- Generated from shared/game-rules/catalog.ts. Do not edit manually.

create or replace function public.initial_traits()
returns jsonb language sql immutable as $$
  select jsonb_build_object(
      'FEROCITY', jsonb_build_object('level', 0, 'exhausted', false),
      'ARMOR', jsonb_build_object('level', 0, 'exhausted', false),
      'AGILITY', jsonb_build_object('level', 0, 'exhausted', false),
      'SENSES', jsonb_build_object('level', 0, 'exhausted', false),
      'CAMOUFLAGE', jsonb_build_object('level', 0, 'exhausted', false)
  );
$$;

alter table public.players alter column traits set default public.initial_traits();
create or replace function public.is_valid_adaptation_collection(value jsonb)
returns boolean language sql immutable as $$
  select jsonb_typeof(value) = 'object'
    and (select count(*) from jsonb_object_keys(value)) = 5
    and jsonb_typeof(value->'FEROCITY') = 'object' and value->'FEROCITY' ? 'level' and value->'FEROCITY' ? 'exhausted' and value->'FEROCITY'->>'level' in ('0', '1', '2') and jsonb_typeof(value->'FEROCITY'->'exhausted') = 'boolean'
    and jsonb_typeof(value->'ARMOR') = 'object' and value->'ARMOR' ? 'level' and value->'ARMOR' ? 'exhausted' and value->'ARMOR'->>'level' in ('0', '1', '2') and jsonb_typeof(value->'ARMOR'->'exhausted') = 'boolean'
    and jsonb_typeof(value->'AGILITY') = 'object' and value->'AGILITY' ? 'level' and value->'AGILITY' ? 'exhausted' and value->'AGILITY'->>'level' in ('0', '1', '2') and jsonb_typeof(value->'AGILITY'->'exhausted') = 'boolean'
    and jsonb_typeof(value->'SENSES') = 'object' and value->'SENSES' ? 'level' and value->'SENSES' ? 'exhausted' and value->'SENSES'->>'level' in ('0', '1', '2') and jsonb_typeof(value->'SENSES'->'exhausted') = 'boolean'
    and jsonb_typeof(value->'CAMOUFLAGE') = 'object' and value->'CAMOUFLAGE' ? 'level' and value->'CAMOUFLAGE' ? 'exhausted' and value->'CAMOUFLAGE'->>'level' in ('0', '1', '2') and jsonb_typeof(value->'CAMOUFLAGE'->'exhausted') = 'boolean';
$$;
alter table public.players drop constraint if exists players_traits_adaptation_state_check;
alter table public.players add constraint players_traits_adaptation_state_check check (public.is_valid_adaptation_collection(traits));

alter table public.round_actions drop constraint if exists round_actions_trait_check;
alter table public.round_actions add constraint round_actions_trait_check
  check (trait in ('FEROCITY', 'ARMOR', 'AGILITY', 'SENSES', 'CAMOUFLAGE'));

create or replace function public.validate_round_action_transition()
returns trigger language plpgsql as $$
declare adaptation jsonb; adaptation_level integer; adaptation_exhausted boolean;
begin
  select traits->new.trait into adaptation from public.players where id = new.player_id and game_id = new.game_id;
  if adaptation is null then raise exception 'unknown adaptation state'; end if;
  adaptation_level := (adaptation->>'level')::integer;
  adaptation_exhausted := (adaptation->>'exhausted')::boolean;
  if new.action_type = 'USE' and adaptation_exhausted then raise exception 'adaptation is exhausted'; end if;
  if new.action_type = 'EVOLVE' and adaptation_level >= 2 and not adaptation_exhausted then raise exception 'EVOLVE would produce no transition'; end if;
  return new;
end; $$;
drop trigger if exists round_actions_validate_transition on public.round_actions;
create trigger round_actions_validate_transition before insert on public.round_actions for each row execute function public.validate_round_action_transition();

create or replace function public.generate_round_event_sequence()
returns jsonb language sql as $$
  with shuffled as materialized (
    select event_id, row_number() over () as position
    from (select event_id from unnest(array[
      'VOLCANIC_ASH_WAVE',
      'PROLONGED_ECLIPSE',
      'PREDATOR_PACK_MIGRATION',
      'HEAT_SPIKE',
      'NUTRIENT_COLLAPSE',
      'FLASH_FLOOD'
    ]::text[]) event_id order by random()) randomized
  )
  select jsonb_agg(event_id order by position)
  from (
    select event_id, position from shuffled
    union all
    select event_id, 7 as position from shuffled where position = 1
  ) best_of_seven;
$$;

create or replace function public.create_vs_bot_game(p_nickname text, p_player_id text)
returns table (game_id uuid, room_code text, human_player_id text, bot_player_id text)
language plpgsql security definer set search_path = public as $$
declare v_game_id uuid; v_room_code text; v_bot_player_id text := gen_random_uuid()::text; v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if coalesce(btrim(p_nickname), '') = '' or coalesce(btrim(p_player_id), '') = '' then raise exception 'Nickname and player_id are required.'; end if;
  loop
    select string_agg(substr(v_alphabet, floor(random() * length(v_alphabet))::int + 1, 1), '') into v_room_code from generate_series(1, 5);
    begin
      insert into public.games (room_code, game_mode, status, current_round, world_id, round_event_sequence, started_at)
      values (v_room_code, 'VS_BOT', 'CHOOSING', 1, 'AURELIA_PRIME', public.generate_round_event_sequence(), timezone('utc', now())) returning id into v_game_id;
      exit;
    exception when unique_violation then null; end;
  end loop;
  insert into public.players (id, game_id, nickname, slot, player_type, traits, connected) values
    (p_player_id, v_game_id, btrim(p_nickname), 1, 'HUMAN', public.initial_traits(), true),
    (v_bot_player_id, v_game_id, 'Bot', 2, 'BOT', public.initial_traits(), true);
  update public.games set player_1_id = p_player_id, player_2_id = v_bot_player_id where id = v_game_id;
  return query select v_game_id, v_room_code, p_player_id, v_bot_player_id;
end;
$$;

commit;
