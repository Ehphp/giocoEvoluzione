begin;
select plan(27);

-- The auth trigger gives each deterministic test account one active creature.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mutation-p1@example.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mutation-p2@example.test', 'not-used', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

-- P1 owns two independent creature loadouts; the first stays active.
insert into public.creature_lineages (id, profile_id, name, base_creature_key)
values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Seconda stirpe', 'VERDANT_HATCHLING');
insert into public.player_creatures (id, profile_id, lineage_id, base_creature_key, combat_mutation_loadout)
values ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'VERDANT_HATCHLING', array['ARMORED_MEMORY', 'RECOVERY_SURGE']);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select lives_ok(
  $$ select public.set_my_creature_combat_mutation_loadout((select id from public.player_creatures where profile_id = '10000000-0000-0000-0000-000000000001' order by created_at limit 1), array['ADAPTIVE_CORE', 'ELASTIC_LIMBS']) $$,
  'owner can update a valid two-id loadout'
);
reset role;

select is(
  (select combat_mutation_loadout from public.player_creatures where profile_id = '10000000-0000-0000-0000-000000000001' order by created_at limit 1),
  array['ADAPTIVE_CORE', 'ELASTIC_LIMBS']::text[],
  'loadout RPC preserves Slot 1 / Slot 2 order'
);
select is(
  (select combat_mutation_loadout from public.player_creatures where id = '30000000-0000-0000-0000-000000000001'),
  array['ARMORED_MEMORY', 'RECOVERY_SURGE']::text[],
  'changing creature A does not modify creature B'
);

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select throws_ok($$ select public.set_my_creature_combat_mutation_loadout((select id from public.player_creatures where profile_id = '10000000-0000-0000-0000-000000000001' order by created_at limit 1), array['ELASTIC_LIMBS']) $$, 'INVALID_COMBAT_MUTATION_LOADOUT', 'one id is rejected');
select throws_ok($$ select public.set_my_creature_combat_mutation_loadout((select id from public.player_creatures where profile_id = '10000000-0000-0000-0000-000000000001' order by created_at limit 1), array['ELASTIC_LIMBS','ADAPTIVE_CORE','ARMORED_MEMORY']) $$, 'INVALID_COMBAT_MUTATION_LOADOUT', 'three ids are rejected');
select throws_ok($$ select public.set_my_creature_combat_mutation_loadout((select id from public.player_creatures where profile_id = '10000000-0000-0000-0000-000000000001' order by created_at limit 1), array['ELASTIC_LIMBS','ELASTIC_LIMBS']) $$, 'INVALID_COMBAT_MUTATION_LOADOUT', 'duplicate ids are rejected');
select throws_ok($$ select public.set_my_creature_combat_mutation_loadout((select id from public.player_creatures where profile_id = '10000000-0000-0000-0000-000000000001' order by created_at limit 1), array['ELASTIC_LIMBS','UNKNOWN']) $$, 'INVALID_COMBAT_MUTATION_LOADOUT', 'unknown ids are rejected');
reset role;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select throws_ok($$ select public.set_my_creature_combat_mutation_loadout((select id from public.player_creatures where profile_id = '10000000-0000-0000-0000-000000000002'), array['ELASTIC_LIMBS','ADAPTIVE_CORE']) $$, 'CREATURE_NOT_OWNED', 'other player creature is rejected');
do $$ begin perform public.create_pvp_game('combat-p1'); end $$;
reset role;

select is((select rule_version from public.games where player_1_id = 'combat-p1'), 'combat-mutations-symbiosis-v1', 'PvP create freezes the current rule version');
select is((select combat_mutation_loadout from public.players where id = 'combat-p1'), array['ADAPTIVE_CORE','ELASTIC_LIMBS']::text[], 'P1 loadout is snapshotted on the match player');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
set local role authenticated;
do $$ begin perform public.join_pvp_game((select room_code from public.games where player_1_id = 'combat-p1'), 'combat-p2'); end $$;
reset role;

select is((select combat_mutation_loadout from public.players where id = 'combat-p2'), array['ELASTIC_LIMBS','ADAPTIVE_CORE']::text[], 'P2 loadout is snapshotted at join');
select is((select rule_version from public.games where player_1_id = 'combat-p1'), 'combat-mutations-symbiosis-v1', 'join does not choose a different rule version');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select lives_ok($$ select public.set_my_creature_combat_mutation_loadout((select creature_id from public.players where id = 'combat-p1'), array['ELASTIC_LIMBS','ARMORED_MEMORY']) $$, 'owner can change their creature after match creation');
reset role;
select is((select combat_mutation_loadout from public.players where id = 'combat-p1'), array['ADAPTIVE_CORE','ELASTIC_LIMBS']::text[], 'match snapshot stays immutable after creature change');

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
set local role authenticated;
do $$ begin perform public.create_vs_bot_game('ignored', 'combat-vs-bot-human', 'NORMAL', '10000000-0000-0000-0000-000000000001', (select creature_id from public.players where id = 'combat-p1'), null); end $$;
reset role;
select is((select combat_mutation_loadout from public.players where id = 'combat-vs-bot-human'), array['ELASTIC_LIMBS','ARMORED_MEMORY']::text[], 'VS Bot human snapshots the selected creature');
select is((select combat_mutation_loadout from public.players where game_id = (select game_id from public.players where id = 'combat-vs-bot-human') and player_type = 'BOT'), array['ELASTIC_LIMBS','ADAPTIVE_CORE']::text[], 'VS Bot uses the explicit server bot preset');
select is((select rule_version from public.games where id = (select game_id from public.players where id = 'combat-vs-bot-human')), 'combat-mutations-symbiosis-v1', 'VS Bot freezes the current rule version');

-- Simulate the persisted post-round state, then prove snapshot/reload returns it
-- unchanged together with the frozen loadout and version.
update public.players
set combat_mutation_state = '{"elasticLimbsUsed":true,"adaptiveCoreStatus":"CONSUMED","armoredMemoryUsed":false,"recoverySurgeUsed":false}'::jsonb
where id = 'combat-p1';
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
set local role authenticated;
select is((select (public.get_game_snapshot((select game_id from public.players where id = 'combat-p1')) -> 'me' -> 'combat_mutation_state' ->> 'adaptiveCoreStatus')), 'CONSUMED', 'snapshot/reload preserves runtime state');
select is((select public.get_game_snapshot((select game_id from public.players where id = 'combat-p1')) -> 'me' -> 'combat_mutation_loadout'), '["ADAPTIVE_CORE", "ELASTIC_LIMBS"]'::jsonb, 'snapshot/reload preserves ordered match loadout');
select is((select public.get_game_snapshot((select game_id from public.players where id = 'combat-p1')) -> 'game' ->> 'rule_version'), 'combat-mutations-symbiosis-v1', 'snapshot/reload preserves frozen rule version');
reset role;

select throws_ok($$ update public.players set combat_mutation_state = '{"adaptiveCoreStatus":"DORMANT","armoredMemoryUsed":false,"recoverySurgeUsed":false}'::jsonb where id = 'combat-p1' $$, 'players_combat_mutation_state_check', 'missing runtime key is rejected');
select throws_ok($$ update public.players set combat_mutation_state = '{"elasticLimbsUsed":null,"adaptiveCoreStatus":"DORMANT","armoredMemoryUsed":false,"recoverySurgeUsed":false}'::jsonb where id = 'combat-p1' $$, 'players_combat_mutation_state_check', 'null runtime value is rejected');
select throws_ok($$ update public.players set combat_mutation_state = '{"elasticLimbsUsed":"false","adaptiveCoreStatus":"DORMANT","armoredMemoryUsed":false,"recoverySurgeUsed":false}'::jsonb where id = 'combat-p1' $$, 'players_combat_mutation_state_check', 'string boolean is rejected');
select throws_ok($$ update public.players set combat_mutation_state = '{"elasticLimbsUsed":false,"adaptiveCoreStatus":"UNKNOWN","armoredMemoryUsed":false,"recoverySurgeUsed":false}'::jsonb where id = 'combat-p1' $$, 'players_combat_mutation_state_check', 'unknown runtime enum is rejected');
select throws_ok($$ update public.players set combat_mutation_state = '{"elasticLimbsUsed":false,"adaptiveCoreStatus":"DORMANT","armoredMemoryUsed":false,"recoverySurgeUsed":false,"extra":true}'::jsonb where id = 'combat-p1' $$, 'players_combat_mutation_state_check', 'extra runtime key is rejected');

select ok(not has_table_privilege('authenticated', 'public.players', 'UPDATE'), 'authenticated cannot update match player snapshots directly');
select ok(not has_table_privilege('authenticated', 'public.players', 'INSERT'), 'authenticated cannot insert match player snapshots directly');

select * from finish();
rollback;
