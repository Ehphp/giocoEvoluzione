-- The transformation functions use the server-only service role to resolve canonical creature
-- metadata. The original restricted grant predates `height_meters`, so retain least privilege
-- and add only the new column needed by relative-height assessment.
begin;

grant select (height_meters)
on table public.player_creatures
to service_role;

notify pgrst, 'reload schema';
commit;
