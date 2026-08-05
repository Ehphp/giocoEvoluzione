create or replace function public.join_pvp_game(p_room_code text, p_player_id text)
returns table (game_id uuid, room_code text, human_player_id text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := auth.uid();
  v_game public.games%rowtype;
  v_existing public.players%rowtype;
  v_nickname text;
  v_creature public.player_creatures%rowtype;
begin
  if v_profile_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if coalesce(btrim(p_player_id), '') = '' or char_length(p_player_id) > 128 then raise exception 'INVALID_PLAYER_ID'; end if;
  select * into v_game from public.games where games.room_code = upper(btrim(p_room_code)) for update;
  if not found then raise exception 'GAME_NOT_FOUND'; end if;
  if v_game.game_mode <> 'PVP' or v_game.status = 'FINISHED' then raise exception 'GAME_NOT_JOINABLE'; end if;
  select * into v_existing from public.players where players.game_id = v_game.id and profile_id = v_profile_id and player_type = 'HUMAN' limit 1;
  if found then
    update public.players set connected = true where id = v_existing.id;
    return query select v_game.id, v_game.room_code, v_existing.id;
    return;
  end if;
  if v_game.status <> 'WAITING' or v_game.player_2_id is not null or exists (select 1 from public.players where players.game_id = v_game.id and slot = 2) then
    raise exception 'GAME_FULL';
  end if;
  select nickname into v_nickname from public.profiles where id = v_profile_id;
  select * into v_creature from public.player_creatures where profile_id = v_profile_id;
  if v_nickname is null or not found then raise exception 'PROFILE_NOT_READY'; end if;
  insert into public.players (id, game_id, nickname, slot, player_type, traits, connected, profile_id, creature_id, creature_snapshot)
  values (
    p_player_id, v_game.id, v_nickname, 2, 'HUMAN', public.initial_traits(), true, v_profile_id, v_creature.id,
    jsonb_build_object('id', v_creature.id, 'baseCreatureKey', v_creature.base_creature_key, 'name', v_creature.name, 'level', v_creature.level)
  );
  update public.games set player_2_id = p_player_id, status = 'CHOOSING', started_at = timezone('utc', now()) where id = v_game.id;
  return query select v_game.id, v_game.room_code, p_player_id;
end;
$$;
