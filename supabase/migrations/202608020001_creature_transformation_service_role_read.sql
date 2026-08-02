-- The transformation resolver uses service_role only to load the canonical
-- ownership fields, then performs the profile comparison in application code.
grant usage on schema public to service_role;

grant select (id, profile_id, base_creature_key)
on table public.player_creatures
to service_role;
