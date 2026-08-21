-- SYMBIOSIS v1: an active, match-scoped Combat Mutation. Links live on games
-- so action secrecy and reconnect snapshots continue to use the existing path.
begin;

create or replace function public.is_valid_combat_mutation_loadout(value text[])
returns boolean language sql immutable as $$
  select case when value is null or array_ndims(value) is distinct from 1 or cardinality(value) is distinct from 2 then false
  else coalesce(value[1] is not null and value[2] is not null and value[1] is distinct from value[2]
    and value[1] = any(array['ELASTIC_LIMBS','ADAPTIVE_CORE','ARMORED_MEMORY','RECOVERY_SURGE','SYMBIOSIS']::text[])
    and value[2] = any(array['ELASTIC_LIMBS','ADAPTIVE_CORE','ARMORED_MEMORY','RECOVERY_SURGE','SYMBIOSIS']::text[]), false) end;
$$;

alter table public.games
  add column if not exists symbiosis_links jsonb not null default '[]'::jsonb;

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
         or (link->>'activatedRound') !~ '^[1-7]$'
    )
    and (select count(*) from jsonb_array_elements(value)) = (select count(distinct link->>'ownerPlayerId') from jsonb_array_elements(value) as link), false) end;
$$;

alter table public.games drop constraint if exists games_symbiosis_links_check;
alter table public.games add constraint games_symbiosis_links_check check (public.is_valid_symbiosis_links(symbiosis_links) is true);
alter table public.games alter column rule_version set default 'combat-mutations-symbiosis-v1';

alter table public.round_actions
  add column if not exists mutation_id text,
  add column if not exists target_trait text;
alter table public.round_actions drop constraint if exists round_actions_action_type_check;
alter table public.round_actions add constraint round_actions_action_type_check check (action_type in ('USE','EVOLVE','ACTIVATE_MUTATION'));
alter table public.round_actions drop constraint if exists round_actions_target_trait_check;
alter table public.round_actions add constraint round_actions_target_trait_check check (target_trait is null or target_trait in ('FEROCITY','ARMOR','AGILITY','SENSES','CAMOUFLAGE'));
alter table public.round_actions drop constraint if exists round_actions_action_payload_check;
alter table public.round_actions add constraint round_actions_action_payload_check check (
  (action_type in ('USE','EVOLVE') and mutation_id is null and target_trait is null)
  or (action_type = 'ACTIVATE_MUTATION' and mutation_id = 'SYMBIOSIS' and target_trait is not null)
);

create or replace function public.validate_round_action_transition()
returns trigger language plpgsql as $$
declare adaptation jsonb; adaptation_level integer; adaptation_exhausted boolean;
begin
  if new.action_type = 'ACTIVATE_MUTATION' then return new; end if;
  select traits->new.trait into adaptation from public.players where id = new.player_id and game_id = new.game_id;
  if adaptation is null then raise exception 'unknown adaptation state'; end if;
  adaptation_level := (adaptation->>'level')::integer; adaptation_exhausted := (adaptation->>'exhausted')::boolean;
  if new.action_type = 'USE' and adaptation_exhausted then raise exception 'adaptation is exhausted'; end if;
  if new.action_type = 'EVOLVE' and adaptation_level >= 2 and not adaptation_exhausted then raise exception 'EVOLVE would produce no transition'; end if;
  return new;
end;
$$;

drop function if exists public.submit_game_round_action(uuid, integer, text, text);
create function public.submit_game_round_action(
  p_game_id uuid, p_round_number integer, p_trait text, p_action_type text,
  p_mutation_id text default null, p_target_trait text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_profile_id uuid := auth.uid(); v_player public.players%rowtype; v_game public.games%rowtype; v_changed boolean := false; v_inserted integer; v_count integer;
begin
  if v_profile_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if p_trait not in ('FEROCITY','ARMOR','AGILITY','SENSES','CAMOUFLAGE') or p_action_type not in ('USE','EVOLVE','ACTIVATE_MUTATION') then raise exception 'INVALID_ACTION'; end if;
  if (p_action_type in ('USE','EVOLVE') and (p_mutation_id is not null or p_target_trait is not null))
    or (p_action_type = 'ACTIVATE_MUTATION' and (p_mutation_id <> 'SYMBIOSIS' or p_target_trait not in ('FEROCITY','ARMOR','AGILITY','SENSES','CAMOUFLAGE'))) then raise exception 'INVALID_ACTION_PAYLOAD'; end if;
  select * into v_game from public.games where id = p_game_id for update;
  if not found or v_game.status <> 'CHOOSING' or v_game.current_round <> p_round_number then raise exception 'ROUND_NOT_OPEN'; end if;
  select * into v_player from public.players where game_id = p_game_id and profile_id = v_profile_id and player_type = 'HUMAN' limit 1;
  if not found then raise exception 'GAME_PARTICIPANT_REQUIRED'; end if;
  if p_action_type = 'ACTIVATE_MUTATION' then
    if v_game.rule_version <> 'combat-mutations-symbiosis-v1' then raise exception 'SYMBIOSIS_UNAVAILABLE_FOR_RULE_VERSION'; end if;
    if not ('SYMBIOSIS' = any(v_player.combat_mutation_loadout)) then raise exception 'SYMBIOSIS_NOT_EQUIPPED'; end if;
    if exists (select 1 from jsonb_array_elements(v_game.symbiosis_links) as link where link->>'ownerPlayerId' = v_player.id) then raise exception 'SYMBIOSIS_ALREADY_CONSUMED'; end if;
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

-- P1 creates only the new ruleset. Existing legacy matches retain their frozen version.
create or replace function public.create_pvp_game(p_player_id text)
returns table (game_id uuid, room_code text, human_player_id text)
language plpgsql security definer set search_path = public as $$
declare v_profile_id uuid := auth.uid(); v_game_id uuid; v_room_code text; v_nickname text; v_creature public.player_creatures%rowtype; v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  if v_profile_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if coalesce(btrim(p_player_id),'') = '' or char_length(p_player_id) > 128 then raise exception 'INVALID_PLAYER_ID'; end if;
  select nickname into v_nickname from public.profiles where id = v_profile_id; select * into v_creature from public.active_profile_creature(v_profile_id);
  if v_nickname is null or not found then raise exception 'PROFILE_NOT_READY'; end if;
  if public.is_valid_combat_mutation_loadout(v_creature.combat_mutation_loadout) is not true then raise exception 'INVALID_CREATURE_COMBAT_MUTATION_LOADOUT'; end if;
  loop
    select string_agg(substr(v_alphabet, floor(random()*length(v_alphabet))::int+1,1),'') into v_room_code from generate_series(1,5);
    begin insert into public.games(room_code,game_mode,status,current_round,world_id,round_event_sequence,rule_version) values(v_room_code,'PVP','WAITING',1,'AURELIA_PRIME',public.generate_round_event_sequence(),'combat-mutations-symbiosis-v1') returning id into v_game_id; exit; exception when unique_violation then null; end;
  end loop;
  insert into public.players(id,game_id,nickname,slot,player_type,traits,connected,profile_id,creature_id,creature_snapshot,combat_mutation_loadout)
  values(p_player_id,v_game_id,v_nickname,1,'HUMAN',public.initial_traits(),true,v_profile_id,v_creature.id,jsonb_build_object('id',v_creature.id,'lineageId',v_creature.lineage_id,'baseCreatureKey',v_creature.base_creature_key,'name',v_creature.name,'level',v_creature.level,'combatMutationLoadout',v_creature.combat_mutation_loadout),v_creature.combat_mutation_loadout);
  update public.games set player_1_id = p_player_id where id = v_game_id; return query select v_game_id,v_room_code,p_player_id;
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
  if v_game.rule_version not in ('combat-mutations-loadout-mvp-v1','combat-mutations-symbiosis-v1') then raise exception 'UNSUPPORTED_GAME_RULE_VERSION'; end if;
  if v_game.game_mode <> 'PVP' or v_game.status='FINISHED' then raise exception 'GAME_NOT_JOINABLE'; end if;
  select * into v_existing from public.players where players.game_id=v_game.id and profile_id=v_profile_id and player_type='HUMAN' limit 1;
  if found then update public.players set connected=true where id=v_existing.id; return query select v_game.id,v_game.room_code,v_existing.id; return; end if;
  if v_game.status<>'WAITING' or v_game.player_2_id is not null or exists(select 1 from public.players where players.game_id=v_game.id and slot=2) then raise exception 'GAME_FULL'; end if;
  select nickname into v_nickname from public.profiles where id=v_profile_id; select * into v_creature from public.active_profile_creature(v_profile_id);
  if v_nickname is null or not found then raise exception 'PROFILE_NOT_READY'; end if;
  if public.is_valid_combat_mutation_loadout(v_creature.combat_mutation_loadout) is not true then raise exception 'INVALID_CREATURE_COMBAT_MUTATION_LOADOUT'; end if;
  if v_game.rule_version='combat-mutations-loadout-mvp-v1' and 'SYMBIOSIS'=any(v_creature.combat_mutation_loadout) then raise exception 'LEGACY_GAME_DOES_NOT_SUPPORT_SYMBIOSIS'; end if;
  insert into public.players(id,game_id,nickname,slot,player_type,traits,connected,profile_id,creature_id,creature_snapshot,combat_mutation_loadout)
  values(p_player_id,v_game.id,v_nickname,2,'HUMAN',public.initial_traits(),true,v_profile_id,v_creature.id,jsonb_build_object('id',v_creature.id,'lineageId',v_creature.lineage_id,'baseCreatureKey',v_creature.base_creature_key,'name',v_creature.name,'level',v_creature.level,'combatMutationLoadout',v_creature.combat_mutation_loadout),v_creature.combat_mutation_loadout);
  update public.games set player_2_id=p_player_id,status='CHOOSING',started_at=timezone('utc',now()) where id=v_game.id; return query select v_game.id,v_game.room_code,p_player_id;
end;
$$;

-- The bot still owns only the original four passive mutations, but VS_BOT games
-- use the new engine so a human SYMBIOSIS link can affect it.
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
  loop select string_agg(substr(v_alphabet,floor(random()*length(v_alphabet))::int+1,1),'') into v_room_code from generate_series(1,5); begin insert into public.games(room_code,game_mode,bot_difficulty,status,current_round,world_id,round_event_sequence,started_at,rule_version) values(v_room_code,'VS_BOT',p_bot_difficulty,'CHOOSING',1,'AURELIA_PRIME',public.generate_round_event_sequence(),timezone('utc',now()),'combat-mutations-symbiosis-v1') returning id into v_game_id; exit; exception when unique_violation then null; end; end loop;
  insert into public.players(id,game_id,nickname,slot,player_type,traits,connected,profile_id,creature_id,creature_snapshot,combat_mutation_loadout) values
    (p_player_id,v_game_id,v_nickname,1,'HUMAN',public.initial_traits(),true,v_profile_id,v_creature.id,v_snapshot,v_creature.combat_mutation_loadout),
    (v_bot_player_id,v_game_id,'Bot',2,'BOT',public.initial_traits(),true,null,null,null,array['ELASTIC_LIMBS','ADAPTIVE_CORE']::text[]);
  update public.games set player_1_id=p_player_id,player_2_id=v_bot_player_id where id=v_game_id; return query select v_game_id,v_room_code,p_player_id,v_bot_player_id;
end;
$$;

drop function if exists public.commit_game_round_resolution(uuid,integer,text,text,jsonb,jsonb,jsonb,jsonb,integer,integer,text,text,timestamptz,integer,integer,text,jsonb);
create function public.commit_game_round_resolution(
  p_game_id uuid,p_round_number integer,p_player_1_id text,p_player_2_id text,p_player_1_traits jsonb,p_player_2_traits jsonb,p_player_1_combat_mutation_state jsonb,p_player_2_combat_mutation_state jsonb,p_symbiosis_links jsonb,p_player_1_score integer,p_player_2_score integer,p_status text,p_winner_id text,p_finished_at timestamptz,p_player_1_value integer,p_player_2_value integer,p_result_winner_id text,p_resolution_data jsonb
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
  if public.is_valid_combat_mutation_state(p_player_1_combat_mutation_state) is not true or public.is_valid_combat_mutation_state(p_player_2_combat_mutation_state) is not true then raise exception 'INVALID_COMBAT_MUTATION_STATE'; end if;
  if public.is_valid_symbiosis_links(p_symbiosis_links) is not true then raise exception 'INVALID_SYMBIOSIS_LINKS'; end if;
  if exists(select 1 from jsonb_array_elements(p_symbiosis_links) as link where (link->>'ownerPlayerId'=p_player_1_id and link->>'targetPlayerId'<>p_player_2_id) or (link->>'ownerPlayerId'=p_player_2_id and link->>'targetPlayerId'<>p_player_1_id) or link->>'ownerPlayerId' not in (p_player_1_id,p_player_2_id)) then raise exception 'INVALID_SYMBIOSIS_LINK_PARTICIPANT'; end if;
  insert into public.round_results(game_id,round_number,player_1_value,player_2_value,winner_id,resolution_data) values(p_game_id,p_round_number,p_player_1_value,p_player_2_value,p_result_winner_id,p_resolution_data) returning * into v_result;
  update public.players set traits=p_player_1_traits,combat_mutation_state=p_player_1_combat_mutation_state,connected=true where id=p_player_1_id and game_id=p_game_id; get diagnostics v_updated=row_count; if v_updated<>1 then raise exception 'RESOLUTION_PLAYER_1_NOT_FOUND'; end if;
  update public.players set traits=p_player_2_traits,combat_mutation_state=p_player_2_combat_mutation_state,connected=true where id=p_player_2_id and game_id=p_game_id; get diagnostics v_updated=row_count; if v_updated<>1 then raise exception 'RESOLUTION_PLAYER_2_NOT_FOUND'; end if;
  update public.games set player_1_score=p_player_1_score,player_2_score=p_player_2_score,status=p_status,winner_id=p_winner_id,finished_at=p_finished_at,symbiosis_links=p_symbiosis_links,state_revision=state_revision+1 where id=p_game_id returning state_revision into v_game.state_revision;
  return jsonb_build_object('outcome','APPLIED','stateRevision',v_game.state_revision,'result',to_jsonb(v_result));
end;
$$;

revoke all on function public.submit_game_round_action(uuid,integer,text,text,text,text) from public,anon;
grant execute on function public.submit_game_round_action(uuid,integer,text,text,text,text) to authenticated,service_role;
revoke all on function public.commit_game_round_resolution(uuid,integer,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,integer,integer,text,text,timestamptz,integer,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.commit_game_round_resolution(uuid,integer,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,integer,integer,text,text,timestamptz,integer,integer,text,jsonb) to service_role;

notify pgrst,'reload schema';
commit;
