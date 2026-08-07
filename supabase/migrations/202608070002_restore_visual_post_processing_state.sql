-- The browser-side background-removal flow uses POST_PROCESSING between the
-- raw experiment and the server-validated final PNG.
alter table public.creature_visual_progress_tracks
  drop constraint if exists creature_visual_progress_tracks_status_check;
alter table public.creature_visual_progress_tracks
  add constraint creature_visual_progress_tracks_status_check
  check (status in ('ACTIVE', 'READY', 'GENERATING', 'POST_PROCESSING', 'GENERATED', 'COMPLETED', 'CANCELLED'));

drop index if exists public.creature_visual_progress_tracks_one_open_per_creature_idx;
create unique index creature_visual_progress_tracks_one_open_per_creature_idx
  on public.creature_visual_progress_tracks (creature_id)
  where status in ('ACTIVE', 'READY', 'GENERATING', 'POST_PROCESSING', 'GENERATED');