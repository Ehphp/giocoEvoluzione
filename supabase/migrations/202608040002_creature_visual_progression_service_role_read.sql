-- Fase 7: il resolver server-side deve poter leggere il puntatore alla
-- versione visuale attiva senza ampliare l'accesso del client.
grant select (id, profile_id, base_creature_key, current_visual_version_id)
on table public.player_creatures
to service_role;
