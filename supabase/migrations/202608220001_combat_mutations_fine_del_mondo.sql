-- FINE_DEL_MONDO: active, match-scoped duration mutation. Existing matches
-- retain their frozen rule version and seven persisted events.
begin;

create or replace function public.is_valid_combat_mutation_loadout(value text[])
returns boolean language sql immutable as $$
  select case when value is null or array_ndims(value) is distinct from 1 or cardinality(value) is distinct from 2 then false
  else coalesce(value[1] is not null and value[2] is not null and value[1] is distinct from value[2]
    and value[1] = any(array['ELASTIC_LIMBS','ADAPTIVE_CORE','ARMORED_MEMORY','RECOVERY_SURGE','SYMBIOSIS','FINE_DEL_MONDO']::text[])
    and value[2] = any(array['ELASTIC_LIMBS','ADAPTIVE_CORE','ARMORED_MEMORY','RECOVERY_SURGE','SYMBIOSIS','FINE_DEL_MONDO']::text[]), false) end;
$$;

alter table public.player_creatures drop constraint if exists player_creatures_combat_mutation_loadout_check;
alter table public.player_creatures add constraint player_creatures_combat_mutation_loadout_check check (public.is_valid_combat_mutation_loadout(combat_mutation_loadout) is true);
alter table public.players drop constraint if exists players_combat_mutation_loadout_check;
alter table public.players add constraint players_combat_mutation_loadout_check check (public.is_valid_combat_mutation_loadout(combat_mutation_loadout) is true);

create or replace function public.is_valid_scheduled_rounds(value integer)
returns boolean language sql immutable as $$ select value between 5 and 10; $$;

create or replace function public.is_valid_fine_del_mondo_activations(value jsonb)
returns boolean language sql immutable as $$
  select case when jsonb_typeof(value) is distinct from 'array' or jsonb_array_length(value) > 2 then false else coalesce(
    not exists (
      select 1 from jsonb_array_elements(value) as activation
      where jsonb_typeof(activation) is distinct from 'object'
         or not (activation ?& array['ownerPlayerId','activatedRound','outcome'])
         or exists (select 1 from jsonb_object_keys(activation) as key where key <> all (array['ownerPlayerId','activatedRound','outcome']))
         or jsonb_typeof(activation->'ownerPlayerId') <> 'string' or coalesce(activation->>'ownerPlayerId','') = ''
         or jsonb_typeof(activation->'activatedRound') <> 'number' or activation->>'activatedRound' !~ '^(?:[3-9]|10)$'
         or activation->>'outcome' not in ('FINE_DEL_MONDO','ERA_PROSPERA')
    )
    and (select count(*) from jsonb_array_elements(value)) = (select count(distinct activation->>'ownerPlayerId') from jsonb_array_elements(value) as activation), false) end;
$$;

alter table public.games
  add column if not exists scheduled_rounds integer not null default 7,
  add column if not exists fine_del_mondo_activations jsonb not null default '[]'::jsonb;
update public.games set scheduled_rounds = 7 where scheduled_rounds is null;
update public.games set fine_del_mondo_activations = '[]'::jsonb where fine_del_mondo_activations is null;
alter table public.games drop constraint if exists games_scheduled_rounds_check;
alter table public.games add constraint games_scheduled_rounds_check check (public.is_valid_scheduled_rounds(scheduled_rounds) is true);
alter table public.games drop constraint if exists games_fine_del_mondo_activations_check;
alter table public.games add constraint games_fine_del_mondo_activations_check check (public.is_valid_fine_del_mondo_activations(fine_del_mondo_activations) is true);
alter table public.games drop constraint if exists games_current_round_check;
alter table public.games add constraint games_current_round_check check (current_round between 1 and 10);
alter table public.round_actions drop constraint if exists round_actions_round_number_check;
alter table public.round_actions add constraint round_actions_round_number_check check (round_number between 1 and 10);
alter table public.round_results drop constraint if exists round_results_round_number_check;
alter table public.round_results add constraint round_results_round_number_check check (round_number between 1 and 10);

create or replace function public.is_valid_symbiosis_links(value jsonb)
returns boolean language sql immutable as $$
  select case when jsonb_typeof(value) is distinct from 'array' or jsonb_array_length(value) > 2 then false else coalesce(
    not exists (
      select 1 from jsonb_array_elements(value) as link
      where jsonb_typeof(link) is distinct from 'object'
         or not (link ?& array['ownerPlayerId','sourceTrait','targetPlayerId','targetTrait','activatedRound'])
         or exists (select 1 from jsonb_object_keys(link) as key where key <> all (array['ownerPlayerId','sourceTrait','targetPlayerId','targetTrait','activatedRound']))
         or jsonb_typeof(link->'ownerPlayerId') <> 'string' or coalesce(link->>'ownerPlayerId','') = ''
         or jsonb_typeof(link->'targetPlayerId') <> 'string' or coalesce(link->>'targetPlayerId','') = ''
         or link->>'sourceTrait' not in ('FEROCITY','ARMOR','AGILITY','SENSES','CAMOUFLAGE')
         or link->>'targetTrait' not in ('FEROCITY','ARMOR','AGILITY','SENSES','CAMOUFLAGE')
         or jsonb_typeof(link->'activatedRound') <> 'number'
         or (link->>'activatedRound') !~ '^(?:[1-9]|10)$'
    )
    and (select count(*) from jsonb_array_elements(value)) = (select count(distinct link->>'ownerPlayerId') from jsonb_array_elements(value) as link), false) end;
$$;

alter table public.round_actions alter column trait drop not null;
alter table public.round_actions drop constraint if exists round_actions_action_payload_check;
alter table public.round_actions add constraint round_actions_action_payload_check check (
  (action_type in ('USE','EVOLVE') and trait is not null and mutation_id is null and target_trait is null)
  or (action_type = 'ACTIVATE_MUTATION' and mutation_id = 'SYMBIOSIS' and trait is not null and target_trait is not null)
  or (action_type = 'ACTIVATE_MUTATION' and mutation_id = 'FINE_DEL_MONDO' and trait is null and target_trait is null)
);

-- FINE_DEL_MONDO has no trait payload, so the older direct-action guard must
-- deliberately bypass it before reading new.trait.
create or replace function public.validate_round_action_transition()
returns trigger language plpgsql as $$
declare adaptation jsonb; adaptation_level integer; adaptation_exhausted boolean;
begin
  if new.action_type = 'ACTIVATE_MUTATION' then return new; end if;
  select traits->new.trait into adaptation from public.players where id = new.player_id and game_id = new.game_id;
  if adaptation is null then raise exception 'unknown adaptation state'; end if;
  adaptation_level := (adaptation->>'level')::integer;
  adaptation_exhausted := (adaptation->>'exhausted')::boolean;
  if new.action_type = 'USE' and adaptation_exhausted then raise exception 'adaptation is exhausted'; end if;
  if new.action_type = 'EVOLVE' and adaptation_level >= 2 and not adaptation_exhausted then raise exception 'EVOLVE would produce no transition'; end if;
  return new;
end;
$$;

create or replace function public.generate_round_event_sequence()
returns jsonb language sql as $$
  with shuffled as materialized (
    select event_id, row_number() over () as position
    from (select event_id from unnest(array[
      'VOLCANIC_ASH_WAVE','PROLONGED_ECLIPSE','PREDATOR_PACK_MIGRATION',
      'HEAT_SPIKE','NUTRIENT_COLLAPSE','FLASH_FLOOD'
    ]::text[]) event_id order by random()) randomized
  )
  select jsonb_agg(shuffled.event_id order by round_number)
  from generate_series(1, 10) as rounds(round_number)
  join shuffled on shuffled.position = ((rounds.round_number - 1) % 6) + 1;
$$;

create or replace function public.bump_game_state_revision_on_legacy_update()
returns trigger language plpgsql as $$
begin
  if new.state_revision = old.state_revision
    and (
      new.game_mode, new.bot_difficulty, new.status, new.current_round,
      new.world_id, new.round_event_sequence, new.player_1_id, new.player_2_id,
      new.player_1_score, new.player_2_score, new.winner_id, new.started_at,
      new.finished_at, new.rematch_count, new.scheduled_rounds,
      new.fine_del_mondo_activations, new.symbiosis_links
    ) is distinct from (
      old.game_mode, old.bot_difficulty, old.status, old.current_round,
      old.world_id, old.round_event_sequence, old.player_1_id, old.player_2_id,
      old.player_1_score, old.player_2_score, old.winner_id, old.started_at,
      old.finished_at, old.rematch_count, old.scheduled_rounds,
      old.fine_del_mondo_activations, old.symbiosis_links
    ) then
    new.state_revision := old.state_revision + 1;
  end if;
  return new;
end;
$$;

drop function if exists public.submit_game_round_action(uuid, integer, text, text, text, text);
create function public.submit_game_round_action(
  p_game_id uuid, p_round_number integer, p_trait text, p_action_type text,
  p_mutation_id text default null, p_target_trait text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_profile_id uuid := auth.uid(); v_player public.players%rowtype; v_game public.games%rowtype; v_changed boolean := false; v_inserted integer; v_count integer;
begin
  if v_profile_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if p_action_type not in ('USE','EVOLVE','ACTIVATE_MUTATION') then raise exception 'INVALID_ACTION'; end if;
  if (p_action_type in ('USE','EVOLVE') and (p_trait not in ('FEROCITY','ARMOR','AGILITY','SENSES','CAMOUFLAGE') or p_mutation_id is not null or p_target_trait is not null))
    or (p_action_type = 'ACTIVATE_MUTATION' and p_mutation_id = 'SYMBIOSIS' and (p_trait not in ('FEROCITY','ARMOR','AGILITY','SENSES','CAMOUFLAGE') or p_target_trait not in ('FEROCITY','ARMOR','AGILITY','SENSES','CAMOUFLAGE')))
    or (p_action_type = 'ACTIVATE_MUTATION' and p_mutation_id = 'FINE_DEL_MONDO' and (p_trait is not null or p_target_trait is not null))
    or (p_action_type = 'ACTIVATE_MUTATION' and (p_mutation_id is null or p_mutation_id not in ('SYMBIOSIS','FINE_DEL_MONDO'))) then raise exception 'INVALID_ACTION_PAYLOAD'; end if;
  select * into v_game from public.games where id = p_game_id for update;
  if not found or v_game.status <> 'CHOOSING' or v_game.current_round <> p_round_number or p_round_number > v_game.scheduled_rounds then raise exception 'ROUND_NOT_OPEN'; end if;
  if v_game.player_1_score > v_game.player_2_score + (v_game.scheduled_rounds - v_game.current_round + 1)
    or v_game.player_2_score > v_game.player_1_score + (v_game.scheduled_rounds - v_game.current_round + 1) then raise exception 'MATCH_ALREADY_CLINCHED'; end if;
  select * into v_player from public.players where game_id = p_game_id and profile_id = v_profile_id and player_type = 'HUMAN' limit 1;
  if not found then raise exception 'GAME_PARTICIPANT_REQUIRED'; end if;
  if p_action_type = 'ACTIVATE_MUTATION' and p_mutation_id = 'SYMBIOSIS' then
    if v_game.rule_version not in ('combat-mutations-symbiosis-v1','combat-mutations-fine-del-mondo-v1') then raise exception 'SYMBIOSIS_UNAVAILABLE_FOR_RULE_VERSION'; end if;
    if not ('SYMBIOSIS' = any(v_player.combat_mutation_loadout)) then raise exception 'SYMBIOSIS_NOT_EQUIPPED'; end if;
    if exists (select 1 from jsonb_array_elements(v_game.symbiosis_links) as link where link->>'ownerPlayerId' = v_player.id) then raise exception 'SYMBIOSIS_ALREADY_CONSUMED'; end if;
  end if;
  if p_action_type = 'ACTIVATE_MUTATION' and p_mutation_id = 'FINE_DEL_MONDO' then
    if v_game.rule_version <> 'combat-mutations-fine-del-mondo-v1' then raise exception 'FINE_DEL_MONDO_UNAVAILABLE_FOR_RULE_VERSION'; end if;
    if not ('FINE_DEL_MONDO' = any(v_player.combat_mutation_loadout)) then raise exception 'FINE_DEL_MONDO_NOT_EQUIPPED'; end if;
    if v_game.current_round < 3 then raise exception 'FINE_DEL_MONDO_UNAVAILABLE_BEFORE_ROUND_3'; end if;
    if exists (select 1 from jsonb_array_elements(v_game.fine_del_mondo_activations) as activation where activation->>'ownerPlayerId' = v_player.id) then raise exception 'FINE_DEL_MONDO_ALREADY_CONSUMED'; end if;
    if v_game.current_round > v_game.scheduled_rounds - 2 then raise exception 'FINE_DEL_MONDO_TOO_LATE'; end if;
  end if;
  insert into public.round_actions(game_id, round_number, player_id, trait, action_type, mutation_id, target_trait)
  values(p_game_id, p_round_number, v_player.id, p_trait, p_action_type, p_mutation_id, p_target_trait)
  on conflict(game_id, round_number, player_id) do nothing;
  get diagnostics v_inserted = row_count; v_changed := v_inserted > 0;
  if v_changed then update public.games set state_revision = state_revision + 1 where id = p_game_id returning state_revision into v_game.state_revision; end if;
  select count(*)::integer into v_count from public.round_actions where game_id = p_game_id and round_number = p_round_number;
  return jsonb_build_object('stateRevision', v_game.state_revision, 'changed', v_changed, 'resolveRequired', v_changed and (v_game.game_mode = 'VS_BOT' or v_count >= 2));
end;
$$;

drop function if exists public.advance_game_round(uuid);
create function public.advance_game_round(p_game_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_revision bigint; v_changed boolean := false;
begin
  if not public.is_game_participant(p_game_id) then raise exception 'GAME_PARTICIPANT_REQUIRED'; end if;
  update public.games set current_round = current_round + 1, status = 'CHOOSING', state_revision = state_revision + 1
  where id = p_game_id and status = 'ROUND_RESULT' and current_round < scheduled_rounds
  returning state_revision into v_revision;
  v_changed := found;
  if not v_changed then select state_revision into v_revision from public.games where id = p_game_id; end if;
  return jsonb_build_object('stateRevision', v_revision, 'changed', v_changed);
end;
$$;

drop function if exists public.commit_game_round_resolution(uuid,integer,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,integer,integer,text,text,timestamptz,integer,integer,text,jsonb);
create function public.commit_game_round_resolution(
  p_game_id uuid,p_round_number integer,p_player_1_id text,p_player_2_id text,p_player_1_traits jsonb,p_player_2_traits jsonb,p_player_1_combat_mutation_state jsonb,p_player_2_combat_mutation_state jsonb,p_symbiosis_links jsonb,p_scheduled_rounds integer,p_fine_del_mondo_activations jsonb,p_player_1_score integer,p_player_2_score integer,p_status text,p_winner_id text,p_finished_at timestamptz,p_player_1_value integer,p_player_2_value integer,p_result_winner_id text,p_resolution_data jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare v_game public.games%rowtype; v_result public.round_results%rowtype; v_updated integer;
begin
  select * into v_game from public.games where id=p_game_id for update;
  if not found then return jsonb_build_object('outcome','GAME_NOT_FOUND'); end if;
  if v_game.current_round<>p_round_number then return jsonb_build_object('outcome','STALE_ROUND','stateRevision',v_game.state_revision); end if;
  select * into v_result from public.round_results where game_id=p_game_id and round_number=p_round_number; if found then return jsonb_build_object('outcome','ALREADY_RESOLVED','stateRevision',v_game.state_revision,'result',to_jsonb(v_result)); end if;
  if v_game.status<>'CHOOSING' then return jsonb_build_object('outcome','ROUND_NOT_OPEN','stateRevision',v_game.state_revision); end if;
  if p_status not in ('REVEALING','FINISHED') then raise exception 'INVALID_RESOLUTION_STATUS'; end if;
  if v_game.player_1_id is distinct from p_player_1_id or v_game.player_2_id is distinct from p_player_2_id then raise exception 'RESOLUTION_PLAYERS_MISMATCH'; end if;
  if jsonb_typeof(p_resolution_data) is distinct from 'object' or (p_resolution_data->>'ruleVersion') is distinct from v_game.rule_version then raise exception 'RESOLUTION_RULE_VERSION_MISMATCH'; end if;
  if (p_resolution_data->>'scheduledRoundsBefore') is distinct from v_game.scheduled_rounds::text or (p_resolution_data->>'scheduledRoundsAfter') is distinct from p_scheduled_rounds::text then raise exception 'RESOLUTION_SCHEDULED_ROUNDS_MISMATCH'; end if;
  if (p_resolution_data->'fineDelMondoActivationsBefore') is distinct from v_game.fine_del_mondo_activations or (p_resolution_data->'fineDelMondoActivationsAfter') is distinct from p_fine_del_mondo_activations then raise exception 'RESOLUTION_FINE_DEL_MONDO_ACTIVATIONS_MISMATCH'; end if;
  if public.is_valid_scheduled_rounds(p_scheduled_rounds) is not true or public.is_valid_fine_del_mondo_activations(p_fine_del_mondo_activations) is not true then raise exception 'INVALID_FINE_DEL_MONDO_MATCH_STATE'; end if;
  if public.is_valid_combat_mutation_state(p_player_1_combat_mutation_state) is not true or public.is_valid_combat_mutation_state(p_player_2_combat_mutation_state) is not true then raise exception 'INVALID_COMBAT_MUTATION_STATE'; end if;
  if public.is_valid_symbiosis_links(p_symbiosis_links) is not true then raise exception 'INVALID_SYMBIOSIS_LINKS'; end if;
  if exists(select 1 from jsonb_array_elements(p_symbiosis_links) as link where (link->>'ownerPlayerId'=p_player_1_id and link->>'targetPlayerId'<>p_player_2_id) or (link->>'ownerPlayerId'=p_player_2_id and link->>'targetPlayerId'<>p_player_1_id) or link->>'ownerPlayerId' not in (p_player_1_id,p_player_2_id)) then raise exception 'INVALID_SYMBIOSIS_LINK_PARTICIPANT'; end if;
  if exists(select 1 from jsonb_array_elements(p_fine_del_mondo_activations) as activation where activation->>'ownerPlayerId' not in (p_player_1_id,p_player_2_id)) then raise exception 'INVALID_FINE_DEL_MONDO_PARTICIPANT'; end if;
  insert into public.round_results(game_id,round_number,player_1_value,player_2_value,winner_id,resolution_data) values(p_game_id,p_round_number,p_player_1_value,p_player_2_value,p_result_winner_id,p_resolution_data) returning * into v_result;
  update public.players set traits=p_player_1_traits,combat_mutation_state=p_player_1_combat_mutation_state,connected=true where id=p_player_1_id and game_id=p_game_id; get diagnostics v_updated=row_count; if v_updated<>1 then raise exception 'RESOLUTION_PLAYER_1_NOT_FOUND'; end if;
  update public.players set traits=p_player_2_traits,combat_mutation_state=p_player_2_combat_mutation_state,connected=true where id=p_player_2_id and game_id=p_game_id; get diagnostics v_updated=row_count; if v_updated<>1 then raise exception 'RESOLUTION_PLAYER_2_NOT_FOUND'; end if;
  update public.games set player_1_score=p_player_1_score,player_2_score=p_player_2_score,status=p_status,winner_id=p_winner_id,finished_at=p_finished_at,symbiosis_links=p_symbiosis_links,scheduled_rounds=p_scheduled_rounds,fine_del_mondo_activations=p_fine_del_mondo_activations,state_revision=state_revision+1 where id=p_game_id returning state_revision into v_game.state_revision;
  return jsonb_build_object('outcome','APPLIED','stateRevision',v_game.state_revision,'result',to_jsonb(v_result));
end;
$$;

create or replace function public.create_pvp_game(p_player_id text)
returns table (game_id uuid, room_code text, human_player_id text)
language plpgsql security definer set search_path = public as $$
declare v_profile_id uuid := auth.uid(); v_game_id uuid; v_room_code text; v_nickname text; v_creature public.player_creatures%rowtype; v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if v_profile_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if coalesce(btrim(p_player_id),'') = '' or char_length(p_player_id)>128 then raise exception 'INVALID_PLAYER_ID'; end if;
  select nickname into v_nickname from public.profiles where id = v_profile_id; select * into v_creature from public.active_profile_creature(v_profile_id);
  if v_nickname is null or not found then raise exception 'PROFILE_NOT_READY'; end if;
  if public.is_valid_combat_mutation_loadout(v_creature.combat_mutation_loadout) is not true then raise exception 'INVALID_CREATURE_COMBAT_MUTATION_LOADOUT'; end if;
  loop
    select string_agg(substr(v_alphabet,floor(random()*length(v_alphabet))::int+1,1),'') into v_room_code from generate_series(1,5);
    begin insert into public.games(room_code,game_mode,status,current_round,world_id,round_event_sequence,rule_version,scheduled_rounds) values(v_room_code,'PVP','WAITING',1,'AURELIA_PRIME',public.generate_round_event_sequence(),'combat-mutations-fine-del-mondo-v1',7) returning id into v_game_id; exit; exception when unique_violation then null; end;
  end loop;
  insert into public.players(id,game_id,nickname,slot,player_type,traits,connected,profile_id,creature_id,creature_snapshot,combat_mutation_loadout) values(p_player_id,v_game_id,v_nickname,1,'HUMAN',public.initial_traits(),true,v_profile_id,v_creature.id,jsonb_build_object('id',v_creature.id,'lineageId',v_creature.lineage_id,'baseCreatureKey',v_creature.base_creature_key,'name',v_creature.name,'level',v_creature.level,'combatMutationLoadout',v_creature.combat_mutation_loadout),v_creature.combat_mutation_loadout);
  update public.games set player_1_id = p_player_id where id = v_game_id;
  return query select v_game_id,v_room_code,p_player_id;
end;
$$;

create or replace function public.join_pvp_game(p_room_code text, p_player_id text)
returns table (game_id uuid, room_code text, human_player_id text)
language plpgsql security definer set search_path = public as $$
declare v_profile_id uuid := auth.uid(); v_game public.games%rowtype; v_existing public.players%rowtype; v_nickname text; v_creature public.player_creatures%rowtype;
begin
  if v_profile_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if coalesce(btrim(p_player_id),'') = '' or char_length(p_player_id)>128 then raise exception 'INVALID_PLAYER_ID'; end if;
  select * into v_game from public.games where games.room_code=upper(btrim(p_room_code)) for update;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;
  if v_game.rule_version not in ('combat-mutations-loadout-mvp-v1','combat-mutations-symbiosis-v1','combat-mutations-fine-del-mondo-v1') then raise exception 'UNSUPPORTED_GAME_RULE_VERSION'; end if;
  if v_game.game_mode <> 'PVP' or v_game.status='FINISHED' then raise exception 'GAME_NOT_JOINABLE'; end if;
  select * into v_existing from public.players where players.game_id=v_game.id and profile_id=v_profile_id and player_type='HUMAN' limit 1;
  if found then update public.players set connected=true where id=v_existing.id; return query select v_game.id,v_game.room_code,v_existing.id; return; end if;
  if v_game.status<>'WAITING' or v_game.player_2_id is not null or exists(select 1 from public.players where players.game_id=v_game.id and slot=2) then raise exception 'GAME_FULL'; end if;
  select nickname into v_nickname from public.profiles where id=v_profile_id; select * into v_creature from public.active_profile_creature(v_profile_id);
  if v_nickname is null or not found then raise exception 'PROFILE_NOT_READY'; end if;
  if public.is_valid_combat_mutation_loadout(v_creature.combat_mutation_loadout) is not true then raise exception 'INVALID_CREATURE_COMBAT_MUTATION_LOADOUT'; end if;
  if v_game.rule_version <> 'combat-mutations-fine-del-mondo-v1' and 'FINE_DEL_MONDO'=any(v_creature.combat_mutation_loadout) then raise exception 'LEGACY_GAME_DOES_NOT_SUPPORT_FINE_DEL_MONDO'; end if;
  if v_game.rule_version='combat-mutations-loadout-mvp-v1' and 'SYMBIOSIS'=any(v_creature.combat_mutation_loadout) then raise exception 'LEGACY_GAME_DOES_NOT_SUPPORT_SYMBIOSIS'; end if;
  insert into public.players(id,game_id,nickname,slot,player_type,traits,connected,profile_id,creature_id,creature_snapshot,combat_mutation_loadout) values(p_player_id,v_game.id,v_nickname,2,'HUMAN',public.initial_traits(),true,v_profile_id,v_creature.id,jsonb_build_object('id',v_creature.id,'lineageId',v_creature.lineage_id,'baseCreatureKey',v_creature.base_creature_key,'name',v_creature.name,'level',v_creature.level,'combatMutationLoadout',v_creature.combat_mutation_loadout),v_creature.combat_mutation_loadout);
  update public.games set player_2_id=p_player_id,status='CHOOSING',started_at=timezone('utc',now()) where id=v_game.id;
  return query select v_game.id,v_game.room_code,p_player_id;
end;
$$;

create or replace function public.create_vs_bot_game(p_nickname text,p_player_id text,p_bot_difficulty text default 'NORMAL',p_profile_id uuid default null,p_creature_id uuid default null,p_creature_snapshot jsonb default null)
returns table (game_id uuid, room_code text, human_player_id text, bot_player_id text)
language plpgsql security definer set search_path=public as $$
declare v_profile_id uuid:=auth.uid(); v_game_id uuid; v_room_code text; v_bot_player_id text:=gen_random_uuid()::text; v_alphabet constant text:='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; v_nickname text; v_creature public.player_creatures%rowtype; v_snapshot jsonb;
begin
  if v_profile_id is null or p_profile_id is distinct from v_profile_id then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if coalesce(btrim(p_player_id),'')='' or char_length(p_player_id)>128 then raise exception 'INVALID_PLAYER_ID'; end if; if p_bot_difficulty not in ('EASY','NORMAL','HARD') then raise exception 'INVALID_BOT_DIFFICULTY'; end if;
  select nickname into v_nickname from public.profiles where id=v_profile_id; select * into v_creature from public.player_creatures where id=p_creature_id and profile_id=v_profile_id;
  if v_nickname is null or not found then raise exception 'PROFILE_NOT_READY'; end if; if public.is_valid_combat_mutation_loadout(v_creature.combat_mutation_loadout) is not true then raise exception 'INVALID_CREATURE_COMBAT_MUTATION_LOADOUT'; end if;
  v_snapshot:=jsonb_build_object('id',v_creature.id,'lineageId',v_creature.lineage_id,'baseCreatureKey',v_creature.base_creature_key,'name',v_creature.name,'level',v_creature.level,'combatMutationLoadout',v_creature.combat_mutation_loadout);
  loop select string_agg(substr(v_alphabet,floor(random()*length(v_alphabet))::int+1,1),'') into v_room_code from generate_series(1,5); begin insert into public.games(room_code,game_mode,bot_difficulty,status,current_round,world_id,round_event_sequence,started_at,rule_version,scheduled_rounds) values(v_room_code,'VS_BOT',p_bot_difficulty,'CHOOSING',1,'AURELIA_PRIME',public.generate_round_event_sequence(),timezone('utc',now()),'combat-mutations-fine-del-mondo-v1',7) returning id into v_game_id; exit; exception when unique_violation then null; end; end loop;
  insert into public.players(id,game_id,nickname,slot,player_type,traits,connected,profile_id,creature_id,creature_snapshot,combat_mutation_loadout) values
    (p_player_id,v_game_id,v_nickname,1,'HUMAN',public.initial_traits(),true,v_profile_id,v_creature.id,v_snapshot,v_creature.combat_mutation_loadout),
    (v_bot_player_id,v_game_id,'Bot',2,'BOT',public.initial_traits(),true,null,null,null,array['ELASTIC_LIMBS','ADAPTIVE_CORE']::text[]);
  update public.games set player_1_id=p_player_id,player_2_id=v_bot_player_id where id=v_game_id; return query select v_game_id,v_room_code,p_player_id,v_bot_player_id;
end;
$$;

revoke all on function public.submit_game_round_action(uuid,integer,text,text,text,text) from public,anon;
grant execute on function public.submit_game_round_action(uuid,integer,text,text,text,text) to authenticated,service_role;
revoke all on function public.commit_game_round_resolution(uuid,integer,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,integer,jsonb,integer,integer,text,text,timestamptz,integer,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.commit_game_round_resolution(uuid,integer,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,integer,jsonb,integer,integer,text,text,timestamptz,integer,integer,text,jsonb) to service_role;

notify pgrst,'reload schema';
commit;
