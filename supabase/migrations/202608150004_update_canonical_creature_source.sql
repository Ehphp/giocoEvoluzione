begin;

do $$
declare v_updated integer;
begin
  update public.creature_visual_base_asset_catalog
  set asset_path = 'verdant-hatchling-v1.png',
      asset_sha256 = '5ccad0bef02c1a3326238819861a5c25d93d8e5b1a96604cf2852c8e59bd995c',
      mime_type = 'image/png',
      width = 1024,
      height = 1536,
      has_alpha = true
  where base_creature_key = 'VERDANT_HATCHLING';
  get diagnostics v_updated = row_count;
  if v_updated <> 1 then raise exception 'CANONICAL_CREATURE_CATALOG_NOT_FOUND'; end if;
end;
$$;

alter table public.creature_visual_versions
  disable trigger creature_visual_versions_immutable;

update public.creature_visual_versions
set asset_sha256 = '5ccad0bef02c1a3326238819861a5c25d93d8e5b1a96604cf2852c8e59bd995c',
    mime_type = 'image/png',
    width = 1024,
    height = 1536,
    has_alpha = true
where base_creature_key = 'VERDANT_HATCHLING'
  and version_number = 1
  and asset_path = 'verdant-hatchling-v1.png';

alter table public.creature_visual_versions
  enable trigger creature_visual_versions_immutable;

commit;