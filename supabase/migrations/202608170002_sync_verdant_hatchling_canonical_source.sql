-- Keep the starter artwork in Storage, its manifest, and every base v1 in lockstep.
-- The service-role-only RPC is called by tools/seed-creature-transformation-source.ts after
-- uploading public/assets/battle/creatures/verdant-hatchling.png.

begin;

create or replace function public.protect_creature_visual_version_immutability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A canonical starter replacement is an administrative operation. It is limited to v1,
  -- requires the service role, and can only be enabled for the current transaction by the
  -- dedicated synchronisation RPC below.
  if current_setting('app.syncing_verdant_hatchling_source', true) = 'true'
    and auth.role() = 'service_role'
    and old.version_number = 1
    and old.base_creature_key = 'VERDANT_HATCHLING'
    and new.creature_id is not distinct from old.creature_id
    and new.profile_id is not distinct from old.profile_id
    and new.version_number is not distinct from old.version_number
    and new.previous_version_id is not distinct from old.previous_version_id
    and new.source_transformation_request_id is not distinct from old.source_transformation_request_id
    and new.base_creature_key is not distinct from old.base_creature_key
    and new.visual_trait_id is not distinct from old.visual_trait_id
    and new.concept_name is not distinct from old.concept_name
    and new.concept_snapshot is not distinct from old.concept_snapshot
    and new.prompt_template_version is not distinct from old.prompt_template_version
    and new.prompt_sha256 is not distinct from old.prompt_sha256
    and new.status is not distinct from old.status
    and new.created_at is not distinct from old.created_at then
    return new;
  end if;

  if new.creature_id is distinct from old.creature_id
    or new.profile_id is distinct from old.profile_id
    or new.version_number is distinct from old.version_number
    or new.previous_version_id is distinct from old.previous_version_id
    or new.source_transformation_request_id is distinct from old.source_transformation_request_id
    or new.base_creature_key is distinct from old.base_creature_key
    or new.visual_trait_id is distinct from old.visual_trait_id
    or new.concept_name is distinct from old.concept_name
    or new.concept_snapshot is distinct from old.concept_snapshot
    or new.prompt_template_version is distinct from old.prompt_template_version
    or new.prompt_sha256 is distinct from old.prompt_sha256
    or new.asset_path is distinct from old.asset_path
    or new.asset_sha256 is distinct from old.asset_sha256
    or new.mime_type is distinct from old.mime_type
    or new.width is distinct from old.width
    or new.height is distinct from old.height
    or new.has_alpha is distinct from old.has_alpha
    or new.created_at is distinct from old.created_at then
    raise exception 'CREATURE_VISUAL_VERSION_IMMUTABLE';
  end if;
  if not ((old.status = 'ACTIVE' and new.status in ('SUPERSEDED', 'REVOKED'))
    or (old.status = 'SUPERSEDED' and new.status = 'ACTIVE')
    or (old.status = new.status)) then
    raise exception 'CREATURE_VISUAL_VERSION_STATE_CONFLICT';
  end if;
  return new;
end;
$$;

create or replace function public.sync_verdant_hatchling_canonical_source(
  p_asset_sha256 text,
  p_width integer,
  p_height integer,
  p_has_alpha boolean,
  p_dry_run boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base_versions_updated integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'CANONICAL_CREATURE_SOURCE_SYNC_FORBIDDEN';
  end if;
  if p_asset_sha256 !~ '^[a-f0-9]{64}$'
    or p_width < 1
    or p_height < 1
    or p_has_alpha is not true then
    raise exception 'CANONICAL_CREATURE_SOURCE_SYNC_INVALID';
  end if;

  perform 1
  from public.creature_visual_base_asset_catalog
  where base_creature_key = 'VERDANT_HATCHLING'
  for update;
  if not found then
    raise exception 'CANONICAL_CREATURE_CATALOG_NOT_FOUND';
  end if;

  if p_dry_run then
    return jsonb_build_object('outcome', 'READY');
  end if;

  perform set_config('app.syncing_verdant_hatchling_source', 'true', true);

  update public.creature_visual_base_asset_catalog
  set asset_path = 'verdant-hatchling-v1.png',
      asset_sha256 = p_asset_sha256,
      mime_type = 'image/png',
      width = p_width,
      height = p_height,
      has_alpha = p_has_alpha
  where base_creature_key = 'VERDANT_HATCHLING';

  update public.creature_visual_versions
  set asset_path = 'verdant-hatchling-v1.png',
      asset_sha256 = p_asset_sha256,
      mime_type = 'image/png',
      width = p_width,
      height = p_height,
      has_alpha = p_has_alpha,
      display_asset_path = null,
      display_asset_sha256 = null,
      display_mime_type = null,
      display_width = null,
      display_height = null
  where base_creature_key = 'VERDANT_HATCHLING'
    and version_number = 1;
  get diagnostics v_base_versions_updated = row_count;

  return jsonb_build_object(
    'outcome', 'SYNCHRONIZED',
    'base_versions_updated', v_base_versions_updated,
    'asset_path', 'verdant-hatchling-v1.png',
    'asset_sha256', p_asset_sha256,
    'width', p_width,
    'height', p_height
  );
end;
$$;

revoke all on function public.sync_verdant_hatchling_canonical_source(text, integer, integer, boolean, boolean) from public, anon, authenticated;
grant execute on function public.sync_verdant_hatchling_canonical_source(text, integer, integer, boolean, boolean) to service_role;

commit;
