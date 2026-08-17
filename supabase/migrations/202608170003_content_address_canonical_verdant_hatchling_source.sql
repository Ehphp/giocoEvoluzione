-- A content-addressed source can be uploaded before the database points at it. This keeps every
-- starter replacement non-destructive and makes the seed command safe to repeat.

begin;

drop function if exists public.sync_verdant_hatchling_canonical_source(text, integer, integer, boolean, boolean);

create function public.sync_verdant_hatchling_canonical_source(
  p_asset_sha256 text,
  p_width integer,
  p_height integer,
  p_has_alpha boolean,
  p_dry_run boolean,
  p_asset_path text
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
    or p_asset_path !~ '^verdant-hatchling/[a-f0-9]{64}\.png$'
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
    return jsonb_build_object('outcome', 'READY', 'asset_path', p_asset_path);
  end if;

  perform set_config('app.syncing_verdant_hatchling_source', 'true', true);

  update public.creature_visual_base_asset_catalog
  set asset_path = p_asset_path,
      asset_sha256 = p_asset_sha256,
      mime_type = 'image/png',
      width = p_width,
      height = p_height,
      has_alpha = p_has_alpha
  where base_creature_key = 'VERDANT_HATCHLING';

  update public.creature_visual_versions
  set asset_path = p_asset_path,
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
    'asset_path', p_asset_path,
    'asset_sha256', p_asset_sha256,
    'width', p_width,
    'height', p_height
  );
end;
$$;

revoke all on function public.sync_verdant_hatchling_canonical_source(text, integer, integer, boolean, boolean, text) from public, anon, authenticated;
grant execute on function public.sync_verdant_hatchling_canonical_source(text, integer, integer, boolean, boolean, text) to service_role;

commit;
