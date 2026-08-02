-- Private storage for the CreatureTransformation mock image pipeline.
-- There are deliberately no anon/authenticated storage.objects policies: browser
-- clients cannot list, read, upload, update or delete either bucket. The Edge
-- Function uses the service_role only on the server, which bypasses Storage RLS.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('creature-transformation-sources', 'creature-transformation-sources', false, 10485760, array['image/png']),
  ('creature-transformation-experiments', 'creature-transformation-experiments', false, 10485760, array['image/png'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
