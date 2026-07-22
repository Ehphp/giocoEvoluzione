alter table public.games
  add column if not exists game_mode text not null default 'PVP' check (game_mode in ('PVP', 'VS_BOT'));

alter table public.players
  add column if not exists player_type text not null default 'HUMAN' check (player_type in ('HUMAN', 'BOT'));

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