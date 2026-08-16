-- Seedream may return JPEG output. Keep the experiments bucket private while
-- allowing the provider's native output to be persisted without an in-memory
-- JPEG-to-PNG conversion in the Edge Function.
--
-- A NULL allow-list means "unrestricted" in Supabase Storage, so preserve it
-- if an environment was configured that way outside migrations.
update storage.buckets
set
  allowed_mime_types = case
    when allowed_mime_types is null then null
    else array(
      select distinct mime_type
      from unnest(
        allowed_mime_types || array['image/jpeg', 'image/webp']::text[]
      ) as allowed_types(mime_type)
    )
  end,
  file_size_limit = case
    when file_size_limit is null then null
    else greatest(file_size_limit, 31457280)
  end
where id = 'creature-transformation-experiments';
