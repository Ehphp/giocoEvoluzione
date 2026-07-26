import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { GENE_IDS, ROUND_EVENT_DEFINITIONS } from '../shared/game-rules/index.ts'

const outputPath = resolve(import.meta.dirname, '../supabase/generated/game-rules.sql')
const geneIds = GENE_IDS.map((gene) => `'${gene}'`).join(', ')
const initialGenes = GENE_IDS.map((gene) => `'${gene}', jsonb_build_object('level', 0, 'cooldown', 0)`).join(',\n      ')
const eventIds = ROUND_EVENT_DEFINITIONS.map((roundEvent) => `'${roundEvent.id}'`).join(',\n      ')

const generated = `-- Generated from shared/game-rules/catalog.ts. Do not edit manually.\n\ncreate or replace function public.initial_traits()\nreturns jsonb language sql immutable as $$\n  select jsonb_build_object(\n      ${initialGenes}\n  );\n$$;\n\nalter table public.round_actions drop constraint if exists round_actions_trait_check;\nalter table public.round_actions add constraint round_actions_trait_check\n  check (trait in (${geneIds}));\n\ncreate or replace function public.generate_round_event_sequence()\nreturns jsonb language sql as $$\n  select jsonb_agg(event_id)\n  from (select event_id from unnest(array[\n      ${eventIds}\n    ]::text[]) event_id order by random()) shuffled;\n$$;\n\ncreate or replace function public.create_vs_bot_game(p_nickname text, p_player_id text)\nreturns table (game_id uuid, room_code text, human_player_id text, bot_player_id text)\nlanguage plpgsql security definer set search_path = public as $$\ndeclare v_game_id uuid; v_room_code text; v_bot_player_id text := gen_random_uuid()::text; v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';\nbegin\n  if coalesce(btrim(p_nickname), '') = '' or coalesce(btrim(p_player_id), '') = '' then raise exception 'Nickname and player_id are required.'; end if;\n  loop\n    select string_agg(substr(v_alphabet, floor(random() * length(v_alphabet))::int + 1, 1), '') into v_room_code from generate_series(1, 5);\n    begin\n      insert into public.games (room_code, game_mode, status, current_round, world_id, round_event_sequence, started_at)\n      values (v_room_code, 'VS_BOT', 'CHOOSING', 1, 'AURELIA_PRIME', public.generate_round_event_sequence(), timezone('utc', now())) returning id into v_game_id;\n      exit;\n    exception when unique_violation then null; end;\n  end loop;\n  insert into public.players (id, game_id, nickname, slot, player_type, traits, connected) values\n    (p_player_id, v_game_id, btrim(p_nickname), 1, 'HUMAN', public.initial_traits(), true),\n    (v_bot_player_id, v_game_id, 'Bot', 2, 'BOT', public.initial_traits(), true);\n  update public.games set player_1_id = p_player_id, player_2_id = v_bot_player_id where id = v_game_id;\n  return query select v_game_id, v_room_code, p_player_id, v_bot_player_id;\nend;\n$$;\n`

if (process.argv.includes('--check')) {
    if (readFileSync(outputPath, 'utf8') !== generated) throw new Error('supabase/generated/game-rules.sql is stale. Run npm run rules:generate.')
} else {
    writeFileSync(outputPath, generated)
}
