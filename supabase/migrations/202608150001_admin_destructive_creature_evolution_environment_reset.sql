-- ADMINISTRATIVE, DESTRUCTIVE, ONE-SHOT RESET OF THE ENTIRE CREATURE EVOLUTION DOMAIN.
--
-- This is intentionally not invoked by application code. The development/admin
-- tool calls the two service-role-only RPCs below after an explicit confirmation.
-- It builds on the canonical-base invariants established by
-- 202608130002_admin_global_creature_progression_reset.sql, but deliberately
-- erases its preserved history as well: old visual versions, requests, tracks,
-- review evidence, progress ledgers, and lineages are all disposable here.

begin;

create or replace function public.admin_verify_creature_evolution_environment_reset()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_canonical_creature_violations bigint;
  v_profiles_without_creature bigint;
  v_active_lineage_violations bigint;
  v_active_visual_violations bigint;
  v_extra_visual_versions bigint;
  v_requests_remaining bigint;
  v_tracks_remaining bigint;
  v_progress_remaining bigint;
  v_events_remaining bigint;
  v_reviews_remaining bigint;
  v_orphan_lineages bigint;
  v_noncanonical_lineages bigint;
  v_drafts_remaining bigint;
  v_flux_start_violations bigint;
begin
  if auth.role() <> 'service_role' then
    raise exception 'ADMIN_CREATURE_EVOLUTION_RESET_FORBIDDEN';
  end if;

  select count(*) into v_canonical_creature_violations
  from public.player_creatures c
  left join public.creature_visual_base_asset_catalog a
    on a.base_creature_key = 'VERDANT_HATCHLING'
  left join public.creature_visual_versions v
    on v.id = c.current_visual_version_id
  where a.base_creature_key is null
     or c.base_creature_key <> 'VERDANT_HATCHLING'
     or c.level <> 1
     or c.experience <> 0
     or c.progression_state <> '{}'::jsonb
     or c.lineage_id is null
     or v.id is null
     or v.version_number <> 1
     or v.status <> 'ACTIVE'
     or v.base_creature_key <> 'VERDANT_HATCHLING'
     or v.asset_path <> a.asset_path
     or v.asset_sha256 <> a.asset_sha256
     or v.mime_type <> a.mime_type
     or v.width <> a.width
     or v.height <> a.height
     or v.has_alpha <> a.has_alpha
     or v.display_asset_path is not null
     or v.display_asset_sha256 is not null
     or v.display_mime_type is not null
     or v.display_width is not null
     or v.display_height is not null;

  select count(*) into v_profiles_without_creature
  from public.profiles p
  where not exists (
    select 1
    from public.player_creatures c
    where c.profile_id = p.id
  );

  select count(*) into v_active_lineage_violations
  from public.profiles p
  where p.active_lineage_id is null
     or not exists (
       select 1
       from public.player_creatures c
       where c.profile_id = p.id
         and c.lineage_id = p.active_lineage_id
     );

  select count(*) into v_active_visual_violations
  from (
    select c.id
    from public.player_creatures c
    left join public.creature_visual_versions v
      on v.creature_id = c.id and v.status = 'ACTIVE'
    group by c.id
    having count(v.id) <> 1
  ) invalid_active_visuals;

  select count(*) into v_extra_visual_versions
  from public.creature_visual_versions
  where version_number <> 1
     or status <> 'ACTIVE'
     or visual_trait_id is not null
     or evolution_target_id is not null
     or evolution_function is not null
     or previous_version_id is not null
     or source_transformation_request_id is not null;

  select count(*) into v_requests_remaining from public.creature_transformation_requests;
  select count(*) into v_tracks_remaining from public.creature_visual_progress_tracks;
  select count(*) into v_progress_remaining
  from public.creature_evolution_target_progress;
  select count(*) into v_events_remaining
  from (
    select id from public.creature_visual_progress_events
    union all
    select id from public.creature_evolution_target_progress_events
    union all
    select id from public.creature_visual_version_rollbacks
  ) evolution_events;
  select count(*) into v_reviews_remaining
  from (
    select id from public.creature_transformation_experiment_reviews
    union all
    select id from public.creature_transformation_lineage_comparison_reviews
  ) evolution_reviews;
  select count(*) into v_orphan_lineages
  from public.creature_lineages l
  where not exists (select 1 from public.player_creatures c where c.lineage_id = l.id);
  select count(*) into v_noncanonical_lineages
  from public.creature_lineages
  where base_creature_key <> 'VERDANT_HATCHLING';
  select count(*) into v_drafts_remaining
  from public.players
  where evolution_draft_options is not null
     or chosen_evolution_target_id is not null;
  select count(*) into v_flux_start_violations
  from public.player_creatures c
  where not exists (
    select 1
    from public.creature_visual_versions v
    where v.id = c.current_visual_version_id
      and v.creature_id = c.id
      and v.version_number = 1
      and v.status = 'ACTIVE'
      and v.base_creature_key = 'VERDANT_HATCHLING'
      and v.visual_trait_id is null
      and v.evolution_target_id is null
      and v.evolution_function is null
  )
  or exists (
    select 1
    from public.creature_visual_progress_tracks t
    where t.creature_id = c.id
  );

  return jsonb_build_object(
    'canonical_creature_violations', v_canonical_creature_violations,
    'profiles_without_creature', v_profiles_without_creature,
    'active_lineage_violations', v_active_lineage_violations,
    'active_visual_violations', v_active_visual_violations,
    'extra_visual_versions', v_extra_visual_versions,
    'transformation_requests_remaining', v_requests_remaining,
    'visual_tracks_remaining', v_tracks_remaining,
    'target_progress_remaining', v_progress_remaining,
    'evolution_events_remaining', v_events_remaining,
    'evolution_reviews_remaining', v_reviews_remaining,
    'orphan_lineages', v_orphan_lineages,
    'noncanonical_lineages', v_noncanonical_lineages,
    'evolution_drafts_remaining', v_drafts_remaining,
    'flux_start_violations', v_flux_start_violations
  );
end;
$$;

create or replace function public.admin_destructive_reset_creature_evolution_environment()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_canonical_assets integer;
  v_requests_deleted bigint;
  v_visual_versions_deleted bigint;
  v_tracks_deleted bigint;
  v_progress_deleted bigint;
  v_events_deleted bigint;
  v_reviews_deleted bigint;
  v_lineages_deleted bigint;
  v_drafts_cleared bigint;
  v_creatures_reset bigint;
  v_snapshot_rows_normalized bigint;
  v_verification jsonb;
  v_violation_key text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'ADMIN_CREATURE_EVOLUTION_RESET_FORBIDDEN';
  end if;

  -- The locks are the destructive equivalent of the global reset's maintenance
  -- window: a concurrent Flux finalizer cannot adopt a legacy request mid-reset.
  lock table public.profiles,
             public.players,
             public.player_creatures,
             public.creature_lineages,
             public.creature_visual_base_asset_catalog,
             public.creature_visual_versions,
             public.creature_visual_progress_tracks,
             public.creature_visual_progress_events,
             public.creature_visual_version_rollbacks,
             public.creature_transformation_requests,
             public.creature_transformation_experiment_reviews,
             public.creature_transformation_lineage_comparison_reviews,
             public.creature_evolution_target_progress,
             public.creature_evolution_target_progress_events
    in access exclusive mode;

  select count(*) into v_canonical_assets
  from public.creature_visual_base_asset_catalog
  where base_creature_key = 'VERDANT_HATCHLING'
    and asset_path = 'verdant-hatchling-v1.png';
  if v_canonical_assets <> 1 then
    raise exception 'ADMIN_CREATURE_EVOLUTION_RESET_ABORTED: canonical VERDANT_HATCHLING base asset is missing';
  end if;

  create temporary table admin_creature_evolution_reset_subjects (
    creature_id uuid primary key,
    profile_id uuid not null,
    reset_lineage_id uuid not null
  ) on commit drop;

  -- Keep creature IDs so historic player rows remain referentially sound, while
  -- replacing every lineage ID with a new blank canonical lineage. Profiles that
  -- predate creature bootstrap receive one fresh creature as well.
  insert into admin_creature_evolution_reset_subjects (creature_id, profile_id, reset_lineage_id)
  select c.id, c.profile_id, gen_random_uuid()
  from public.player_creatures c;
  insert into admin_creature_evolution_reset_subjects (creature_id, profile_id, reset_lineage_id)
  select gen_random_uuid(), p.id, gen_random_uuid()
  from public.profiles p
  where not exists (
    select 1
    from admin_creature_evolution_reset_subjects s
    where s.profile_id = p.id
  );

  select count(*) into v_requests_deleted from public.creature_transformation_requests;
  select count(*) into v_visual_versions_deleted from public.creature_visual_versions;
  select count(*) into v_tracks_deleted from public.creature_visual_progress_tracks;
  select count(*) into v_progress_deleted from public.creature_evolution_target_progress;
  select count(*) into v_events_deleted
  from (
    select id from public.creature_visual_progress_events
    union all
    select id from public.creature_evolution_target_progress_events
    union all
    select id from public.creature_visual_version_rollbacks
  ) evolution_events;
  select count(*) into v_reviews_deleted
  from (
    select id from public.creature_transformation_experiment_reviews
    union all
    select id from public.creature_transformation_lineage_comparison_reviews
  ) evolution_reviews;
  select count(*) into v_lineages_deleted from public.creature_lineages;
  select count(*) into v_creatures_reset from admin_creature_evolution_reset_subjects;

  -- Do not let the standard bootstrap create a version in the short interval
  -- between inserting a missing player_creature and explicitly inserting its
  -- canonical v1 below. Both trigger changes are transaction-scoped.
  alter table public.player_creatures
    disable trigger player_creatures_initialize_visual_version;
  alter table public.creature_visual_versions
    disable trigger creature_visual_versions_immutable;

  -- Break the RESTRICT cycle between versions, requests and tracks before
  -- deleting the domain. No row outside the evolution domain is deleted.
  update public.player_creatures
  set current_visual_version_id = null
  where current_visual_version_id is not null;
  update public.creature_visual_versions
  set previous_version_id = null,
      source_transformation_request_id = null
  where previous_version_id is not null
     or source_transformation_request_id is not null;
  update public.creature_visual_progress_tracks
  set generated_request_id = null,
      completed_version_id = null
  where generated_request_id is not null
     or completed_version_id is not null;
  update public.creature_transformation_requests
  set visual_progress_track_id = null,
      source_visual_version_id = null
  where visual_progress_track_id is not null
     or source_visual_version_id is not null;

  delete from public.creature_transformation_experiment_reviews;
  delete from public.creature_transformation_lineage_comparison_reviews;
  delete from public.creature_visual_progress_events;
  delete from public.creature_evolution_target_progress_events;
  delete from public.creature_evolution_target_progress;
  delete from public.creature_visual_version_rollbacks;
  delete from public.creature_visual_progress_tracks;
  delete from public.creature_visual_versions;
  delete from public.creature_transformation_requests;

  -- Draft options and selected targets are evolution state on otherwise
  -- preserved game-player rows, so clear them rather than deleting games.
  update public.players
  set evolution_draft_options = null,
      chosen_evolution_target_id = null
  where evolution_draft_options is not null
     or chosen_evolution_target_id is not null;
  get diagnostics v_drafts_cleared = row_count;

  -- A profile's active lineage points at the old lineage via RESTRICT. Clear it
  -- first, replace every lineage on preserved creatures, then delete every old
  -- lineage record (and therefore every old lineage metadata value).
  update public.profiles
  set active_lineage_id = null
  where active_lineage_id is not null;
  insert into public.creature_lineages (id, profile_id, name, base_creature_key)
  select s.reset_lineage_id, s.profile_id, null, 'VERDANT_HATCHLING'
  from admin_creature_evolution_reset_subjects s;
  update public.player_creatures c
  set lineage_id = s.reset_lineage_id,
      base_creature_key = 'VERDANT_HATCHLING',
      name = null,
      level = 1,
      experience = 0,
      progression_state = '{}'::jsonb,
      current_visual_version_id = null
  from admin_creature_evolution_reset_subjects s
  where c.id = s.creature_id;
  insert into public.player_creatures (
    id, profile_id, lineage_id, base_creature_key, name, level, experience, progression_state
  )
  select s.creature_id, s.profile_id, s.reset_lineage_id,
         'VERDANT_HATCHLING', null, 1, 0, '{}'::jsonb
  from admin_creature_evolution_reset_subjects s
  where not exists (select 1 from public.player_creatures c where c.id = s.creature_id);

  insert into public.creature_visual_versions (
    creature_id, profile_id, lineage_id, version_number, base_creature_key,
    asset_path, asset_sha256, mime_type, width, height, has_alpha, status, adopted_at
  )
  select c.id, c.profile_id, c.lineage_id, 1, 'VERDANT_HATCHLING',
         a.asset_path, a.asset_sha256, a.mime_type, a.width, a.height, a.has_alpha,
         'ACTIVE', timezone('utc', now())
  from public.player_creatures c
  join admin_creature_evolution_reset_subjects s on s.creature_id = c.id
  join public.creature_visual_base_asset_catalog a
    on a.base_creature_key = 'VERDANT_HATCHLING';
  update public.player_creatures c
  set current_visual_version_id = v.id
  from public.creature_visual_versions v
  where v.creature_id = c.id
    and v.version_number = 1
    and v.status = 'ACTIVE';

  update public.profiles p
  set active_lineage_id = first_lineage.reset_lineage_id
  from (
    select distinct on (profile_id) profile_id, reset_lineage_id
    from admin_creature_evolution_reset_subjects
    order by profile_id, creature_id
  ) first_lineage
  where p.id = first_lineage.profile_id;
  delete from public.creature_lineages l
  where not exists (
    select 1
    from admin_creature_evolution_reset_subjects s
    where s.reset_lineage_id = l.id
  );

  -- Replace old lineage IDs embedded in the retained game-player snapshots with
  -- the new canonical snapshot. This is the required FK-adjacent normalization;
  -- games, players, rewards and ratings themselves are retained.
  update public.players p
  set creature_snapshot = jsonb_build_object(
    'id', c.id,
    'lineageId', c.lineage_id,
    'baseCreatureKey', c.base_creature_key,
    'name', c.name,
    'level', c.level
  )
  from public.player_creatures c
  where p.player_type = 'HUMAN'
    and p.creature_id = c.id;
  get diagnostics v_snapshot_rows_normalized = row_count;

  alter table public.creature_visual_versions
    enable trigger creature_visual_versions_immutable;
  alter table public.player_creatures
    enable trigger player_creatures_initialize_visual_version;

  v_verification := public.admin_verify_creature_evolution_environment_reset();
  for v_violation_key in
    select key
    from jsonb_each_text(v_verification)
    where value::bigint <> 0
  loop
    raise exception 'ADMIN_CREATURE_EVOLUTION_RESET_ABORTED: invariant % is not zero', v_violation_key;
  end loop;

  return jsonb_build_object(
    'transformation_requests_deleted', v_requests_deleted,
    'visual_versions_deleted', v_visual_versions_deleted,
    'visual_tracks_deleted', v_tracks_deleted,
    'target_progress_deleted', v_progress_deleted,
    'evolution_events_deleted', v_events_deleted,
    'evolution_reviews_deleted', v_reviews_deleted,
    'lineages_deleted', v_lineages_deleted,
    'evolution_drafts_cleared', v_drafts_cleared,
    'creatures_reset', v_creatures_reset,
    'player_snapshots_normalized', v_snapshot_rows_normalized,
    'verification', v_verification
  );
end;
$$;

revoke all on function public.admin_verify_creature_evolution_environment_reset() from public, anon, authenticated;
revoke all on function public.admin_destructive_reset_creature_evolution_environment() from public, anon, authenticated;
grant execute on function public.admin_verify_creature_evolution_environment_reset() to service_role;
grant execute on function public.admin_destructive_reset_creature_evolution_environment() to service_role;

notify pgrst, 'reload schema';

commit;
