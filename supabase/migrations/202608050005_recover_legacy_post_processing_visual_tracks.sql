-- The removed browser background-removal flow could leave a track in
-- POST_PROCESSING. Native alpha validation has no post-processing step, so
-- these historical tracks must return to READY for an explicit new generation.
update public.creature_visual_progress_tracks
set status = 'READY',
    generated_request_id = null
where status = 'POST_PROCESSING';

alter table public.creature_visual_progress_tracks
  drop constraint if exists creature_visual_progress_tracks_status_check;
alter table public.creature_visual_progress_tracks
  add constraint creature_visual_progress_tracks_status_check
  check (status in ('ACTIVE', 'READY', 'GENERATING', 'GENERATED', 'COMPLETED', 'CANCELLED'));

drop index if exists public.creature_visual_progress_tracks_one_open_per_creature_idx;
create unique index creature_visual_progress_tracks_one_open_per_creature_idx
  on public.creature_visual_progress_tracks (creature_id)
  where status in ('ACTIVE', 'READY', 'GENERATING', 'GENERATED');