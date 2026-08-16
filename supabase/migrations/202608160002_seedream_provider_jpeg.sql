-- Seedream diagnostics may legitimately return JPEG. Production creature assets remain PNG-only;
-- this merely lets the lab persist a provider-native diagnostic without decoding it in Edge.
alter table public.creature_transformation_requests
  drop constraint if exists creature_transformation_requests_result_mime_type_check;

alter table public.creature_transformation_requests
  add constraint creature_transformation_requests_result_mime_type_check
  check (result_mime_type is null or result_mime_type in ('image/png', 'image/jpeg'));
