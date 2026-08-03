-- The Edge Function verifies the server-owned image-generation capability
-- before accepting an expensive request.  The service role is server-only and
-- already has BypassRLS; it still needs this explicit table privilege.
grant select (id, can_generate_images) on table public.profiles to service_role;
