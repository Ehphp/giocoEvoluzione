-- Evolution target taxonomy: one-shot conversion to the visually interpretable targets.
--
--   TAIL              -> TAIL
--   FORELIMBS         -> LIMBS_AND_FEET   (limbs are one system; the image model never
--   HIND_LIMBS        -> LIMBS_AND_FEET    had to tell a forelimb from a hind limb)
--   HEAD_AND_SENSES   -> HEAD_AND_CROWN
--   TORSO_AND_BACK    -> DORSAL_STRUCTURES (its adopted evolutions were dorsal structures;
--                                           body volume is now its own BODY_SHAPE target)
--   SKIN              -> SKIN_AND_COVERING
--
-- Historical rows are converted, not deleted, and no legacy id survives at runtime.
-- WINGS and TENTACLES exist for body plans that declare them (see body-plan-registry.ts).

begin;

create function public.map_legacy_evolution_target_id(p_target text)
returns text language sql immutable as $$
  select case p_target
    when 'FORELIMBS' then 'LIMBS_AND_FEET'
    when 'HIND_LIMBS' then 'LIMBS_AND_FEET'
    when 'HEAD_AND_SENSES' then 'HEAD_AND_CROWN'
    when 'TORSO_AND_BACK' then 'DORSAL_STRUCTURES'
    when 'SKIN' then 'SKIN_AND_COVERING'
    else p_target
  end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Release the constraints that still describe the legacy taxonomy
-- ---------------------------------------------------------------------------

alter table public.creature_visual_progress_tracks
  drop constraint if exists creature_visual_progress_tracks_selection_check;
alter table public.creature_evolution_target_progress
  drop constraint if exists creature_evolution_target_progress_evolution_target_id_check;
alter table public.players
  drop constraint if exists players_evolution_draft_options_valid;
alter table public.players
  drop constraint if exists players_chosen_evolution_target_offered;

-- ---------------------------------------------------------------------------
-- 2. Convert persisted data
-- ---------------------------------------------------------------------------

update public.creature_visual_progress_tracks
set evolution_target_id = public.map_legacy_evolution_target_id(evolution_target_id)
where evolution_target_id is not null;

-- The snapshot is converted first: the anatomy-metadata trigger re-derives the column from it.
update public.creature_transformation_requests
set concept_snapshot = jsonb_set(concept_snapshot, '{evolutionTargetId}', to_jsonb(public.map_legacy_evolution_target_id(concept_snapshot->>'evolutionTargetId')))
where concept_snapshot is not null
  and jsonb_typeof(concept_snapshot) = 'object'
  and concept_snapshot ? 'evolutionTargetId'
  and concept_snapshot->>'evolutionTargetId' in ('FORELIMBS','HIND_LIMBS','HEAD_AND_SENSES','TORSO_AND_BACK','SKIN');

update public.creature_transformation_requests
set evolution_target_id = public.map_legacy_evolution_target_id(evolution_target_id)
where evolution_target_id is not null;

update public.creature_visual_versions
set concept_snapshot = jsonb_set(concept_snapshot, '{evolutionTargetId}', to_jsonb(public.map_legacy_evolution_target_id(concept_snapshot->>'evolutionTargetId')))
where concept_snapshot is not null
  and jsonb_typeof(concept_snapshot) = 'object'
  and concept_snapshot ? 'evolutionTargetId'
  and concept_snapshot->>'evolutionTargetId' in ('FORELIMBS','HIND_LIMBS','HEAD_AND_SENSES','TORSO_AND_BACK','SKIN');

update public.creature_visual_versions
set evolution_target_id = public.map_legacy_evolution_target_id(evolution_target_id)
where evolution_target_id is not null;

update public.creature_evolution_target_progress_events
set evolution_target_id = public.map_legacy_evolution_target_id(evolution_target_id)
where evolution_target_id is not null;

-- Two legacy limb counters become one: the banked wins are summed so no progress is lost.
create temporary table legacy_evolution_target_progress_merge on commit drop as
select min(id) as keep_id,
       creature_id,
       public.map_legacy_evolution_target_id(evolution_target_id) as new_target,
       sum(wins) as merged_wins,
       max(target) as merged_target
from public.creature_evolution_target_progress
group by creature_id, public.map_legacy_evolution_target_id(evolution_target_id);

delete from public.creature_evolution_target_progress
where id not in (select keep_id from legacy_evolution_target_progress_merge);

update public.creature_evolution_target_progress progress
set evolution_target_id = merge.new_target,
    wins = merge.merged_wins,
    target = merge.merged_target,
    updated_at = timezone('utc', now())
from legacy_evolution_target_progress_merge merge
where progress.id = merge.keep_id;

-- A drafted pair that collapses into one target keeps a single valid option.
update public.players
set evolution_draft_options = (
      select array_agg(distinct public.map_legacy_evolution_target_id(option))
      from unnest(evolution_draft_options) as option
      where option is not null
    ),
    chosen_evolution_target_id = public.map_legacy_evolution_target_id(chosen_evolution_target_id)
where evolution_draft_options is not null;

-- ---------------------------------------------------------------------------
-- 3. Re-apply the constraints with the new taxonomy
-- ---------------------------------------------------------------------------

alter table public.creature_visual_progress_tracks
  add constraint creature_visual_progress_tracks_selection_check check (
    (evolution_target_id is null and visual_trait_id is not null)
    or evolution_target_id in ('TAIL','LIMBS_AND_FEET','HEAD_AND_CROWN','BODY_SHAPE','DORSAL_STRUCTURES','SKIN_AND_COVERING','WINGS','TENTACLES')
  );

alter table public.creature_evolution_target_progress
  add constraint creature_evolution_target_progress_evolution_target_id_check
  check (evolution_target_id in ('TAIL','LIMBS_AND_FEET','HEAD_AND_CROWN','BODY_SHAPE','DORSAL_STRUCTURES','SKIN_AND_COVERING','WINGS','TENTACLES'));

alter table public.players
  add constraint players_evolution_draft_options_valid check (
    evolution_draft_options is null
    or (
      array_length(evolution_draft_options, 1) between 1 and 8
      and evolution_draft_options <@ array['TAIL','LIMBS_AND_FEET','HEAD_AND_CROWN','BODY_SHAPE','DORSAL_STRUCTURES','SKIN_AND_COVERING','WINGS','TENTACLES']::text[]
    )
  );

alter table public.players
  add constraint players_chosen_evolution_target_offered check (
    chosen_evolution_target_id is null
    or (evolution_draft_options is not null and chosen_evolution_target_id = any(evolution_draft_options))
  );

-- ---------------------------------------------------------------------------
-- 4. Server-side functions speak only the new taxonomy
-- ---------------------------------------------------------------------------

-- The draft draws the six targets of the starter body plan; body-plan specific targets are
-- validated by the Edge Function against the creature's canonical body plan.
create or replace function public.draw_evolution_draft_options(p_count integer default 2)
returns text[]
language sql
volatile
set search_path = public
as $$
  select array(
    select target
    from unnest(array['TAIL','LIMBS_AND_FEET','HEAD_AND_CROWN','BODY_SHAPE','DORSAL_STRUCTURES','SKIN_AND_COVERING']) as target
    order by random()
    limit greatest(1, least(coalesce(p_count, 2), 6))
  );
$$;

create or replace function public.get_creature_evolution_target_progress(
  p_creature_id uuid,
  p_target integer default 3
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := auth.uid();
begin
  if v_profile_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if not exists (select 1 from public.player_creatures where id = p_creature_id and profile_id = v_profile_id) then
    raise exception 'CREATURE_NOT_OWNED';
  end if;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'evolutionTargetId', catalogue.target,
      'wins', coalesce(stored.wins, 0),
      'target', coalesce(stored.target, greatest(1, least(coalesce(p_target, 3), 100)))
    ) order by catalogue.ordinality), '[]'::jsonb)
    from unnest(array['TAIL','LIMBS_AND_FEET','HEAD_AND_CROWN','BODY_SHAPE','DORSAL_STRUCTURES','SKIN_AND_COVERING'])
      with ordinality as catalogue(target, ordinality)
    left join public.creature_evolution_target_progress stored
      on stored.creature_id = p_creature_id and stored.evolution_target_id = catalogue.target
  );
end;
$$;

create or replace function public.open_evolution_track_from_ready_target(
  p_creature_id uuid,
  p_evolution_target_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := auth.uid();
  v_progress public.creature_evolution_target_progress%rowtype;
  v_track public.creature_visual_progress_tracks%rowtype;
begin
  if v_profile_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if p_evolution_target_id not in ('TAIL','LIMBS_AND_FEET','HEAD_AND_CROWN','BODY_SHAPE','DORSAL_STRUCTURES','SKIN_AND_COVERING','WINGS','TENTACLES') then
    raise exception 'EVOLUTION_TARGET_INVALID';
  end if;
  if not exists (select 1 from public.player_creatures where id = p_creature_id and profile_id = v_profile_id) then
    raise exception 'CREATURE_NOT_OWNED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('visual-track:' || p_creature_id::text, 0));

  if exists (
    select 1 from public.creature_visual_progress_tracks
    where creature_id = p_creature_id and status in ('ACTIVE','READY','GENERATING','POST_PROCESSING','GENERATED')
  ) then
    raise exception 'VISUAL_TRACK_ALREADY_ACTIVE';
  end if;

  select * into v_progress
  from public.creature_evolution_target_progress
  where creature_id = p_creature_id and evolution_target_id = p_evolution_target_id
  for update;
  if not found or v_progress.wins < v_progress.target then raise exception 'EVOLUTION_TARGET_NOT_READY'; end if;

  update public.creature_evolution_target_progress
  set wins = v_progress.wins - v_progress.target,
      updated_at = timezone('utc', now())
  where id = v_progress.id;

  insert into public.creature_visual_progress_tracks(
    profile_id, creature_id, visual_trait_id, evolution_target_id, status, progress, target, ready_at
  )
  values (
    v_profile_id, p_creature_id, null, p_evolution_target_id, 'READY',
    v_progress.target, v_progress.target, timezone('utc', now())
  )
  returning * into v_track;

  return to_jsonb(v_track);
end;
$$;

-- A track is opened on an evolution target only: the legacy trait-only selection is gone.
create or replace function public.select_creature_visual_progress_track(
  p_profile_id uuid, p_creature_id uuid, p_visual_trait_id text, p_evolution_target_id text, p_target integer
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_track public.creature_visual_progress_tracks%rowtype;
begin
  if p_target < 1 or p_target > 100 then raise exception 'VISUAL_TRACK_STATE_CONFLICT'; end if;
  if p_visual_trait_id is not null then raise exception 'VISUAL_TRACK_STATE_CONFLICT'; end if;
  if p_evolution_target_id is null or p_evolution_target_id not in ('TAIL','LIMBS_AND_FEET','HEAD_AND_CROWN','BODY_SHAPE','DORSAL_STRUCTURES','SKIN_AND_COVERING','WINGS','TENTACLES') then raise exception 'EVOLUTION_TARGET_INVALID'; end if;
  if not exists (select 1 from public.player_creatures where id = p_creature_id and profile_id = p_profile_id) then raise exception 'CREATURE_NOT_OWNED'; end if;
  perform pg_advisory_xact_lock(hashtextextended('visual-track:' || p_creature_id::text, 0));
  if exists (select 1 from public.creature_visual_progress_tracks where creature_id = p_creature_id and status in ('ACTIVE','READY','GENERATING','POST_PROCESSING','GENERATED')) then raise exception 'VISUAL_TRACK_ALREADY_ACTIVE'; end if;
  insert into public.creature_visual_progress_tracks(profile_id, creature_id, visual_trait_id, evolution_target_id, status, target)
  values (p_profile_id, p_creature_id, null, p_evolution_target_id, 'ACTIVE', p_target)
  returning * into v_track;
  return to_jsonb(v_track);
end;
$$;

-- The functional direction the server resolved must be compatible with the new target.
create or replace function public.resolve_creature_visual_progress_track_trait(
  p_profile_id uuid, p_creature_id uuid, p_track_id uuid, p_visual_trait_id text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_track public.creature_visual_progress_tracks%rowtype;
begin
  if p_visual_trait_id not in ('IMPACT_ADAPTATION','LOCOMOTION_ADAPTATION','SENSORY_EXPANSION','ENERGY_REGULATION','AQUATIC_MORPHOLOGY') then raise exception 'VISUAL_TRAIT_INVALID'; end if;
  select * into v_track from public.creature_visual_progress_tracks where id = p_track_id and profile_id = p_profile_id and creature_id = p_creature_id for update;
  if not found then raise exception 'VISUAL_TRACK_NOT_FOUND'; end if;
  if v_track.status <> 'READY' then raise exception 'VISUAL_TRACK_NOT_READY'; end if;
  if v_track.evolution_target_id = 'TAIL' and p_visual_trait_id not in ('LOCOMOTION_ADAPTATION','AQUATIC_MORPHOLOGY') then raise exception 'VISUAL_TRAIT_INVALID'; end if;
  if v_track.evolution_target_id = 'LIMBS_AND_FEET' and p_visual_trait_id not in ('LOCOMOTION_ADAPTATION','IMPACT_ADAPTATION','AQUATIC_MORPHOLOGY') then raise exception 'VISUAL_TRAIT_INVALID'; end if;
  if v_track.evolution_target_id = 'HEAD_AND_CROWN' and p_visual_trait_id <> 'SENSORY_EXPANSION' then raise exception 'VISUAL_TRAIT_INVALID'; end if;
  if v_track.evolution_target_id in ('BODY_SHAPE','DORSAL_STRUCTURES') and p_visual_trait_id not in ('IMPACT_ADAPTATION','ENERGY_REGULATION') then raise exception 'VISUAL_TRAIT_INVALID'; end if;
  if v_track.evolution_target_id = 'WINGS' and p_visual_trait_id not in ('LOCOMOTION_ADAPTATION','IMPACT_ADAPTATION') then raise exception 'VISUAL_TRAIT_INVALID'; end if;
  if v_track.evolution_target_id = 'TENTACLES' and p_visual_trait_id not in ('LOCOMOTION_ADAPTATION','AQUATIC_MORPHOLOGY') then raise exception 'VISUAL_TRAIT_INVALID'; end if;
  update public.creature_visual_progress_tracks set visual_trait_id = p_visual_trait_id where id = v_track.id returning * into v_track;
  return to_jsonb(v_track);
end;
$$;

-- Same reservation semantics, quotas and idempotency as before: only the accepted evolution
-- target list changes.
create or replace function public.reserve_creature_transformation_request(
  p_profile_id uuid, p_creature_id uuid, p_idempotency_key text, p_operation text,
  p_visual_trait_id text, p_intensity smallint, p_concept_mode text, p_image_provider_mode text,
  p_estimated_cost_usd numeric, p_daily_request_limit integer, p_daily_budget_usd numeric,
  p_benchmark_case_id text default null, p_generation_profile_id text default null, p_concept_seed text default null,
  p_visual_progress_track_id uuid default null, p_source_visual_version_id uuid default null,
  p_evolution_target_id text default null, p_evolution_function text default null,
  p_request_fingerprint text default null, p_daily_real_image_limit integer default null,
  p_global_daily_real_image_limit integer default null, p_global_concurrent_real_image_limit integer default null,
  p_real_image_cooldown_seconds integer default 0, p_stale_request_seconds integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.creature_transformation_requests%rowtype;
  v_day_start timestamptz := date_trunc('day', timezone('utc', now())) at time zone 'utc';
  v_day date := timezone('utc', now())::date;
  v_count integer;
  v_cost numeric(12,6);
  v_last_created_at timestamptz;
begin
  if (p_benchmark_case_id is null) <> (p_generation_profile_id is null) then raise exception 'benchmark case and generation profile must be paired'; end if;
  if p_benchmark_case_id is not null and p_concept_seed is null then raise exception 'benchmark concept seed is required'; end if;
  if p_request_fingerprint is not null and p_request_fingerprint !~ '^[a-f0-9]{64}$' then raise exception 'invalid request fingerprint'; end if;
  if (p_evolution_target_id is null) <> (p_evolution_function is null) then raise exception 'evolution target and function must be paired'; end if;
  if p_evolution_target_id is not null and p_evolution_target_id not in ('TAIL','LIMBS_AND_FEET','HEAD_AND_CROWN','BODY_SHAPE','DORSAL_STRUCTURES','SKIN_AND_COVERING','WINGS','TENTACLES') then raise exception 'invalid evolution target'; end if;
  if p_evolution_function is not null and p_evolution_function not in ('BALANCE','PROPULSION','GRIP','DEFENSE','PERCEPTION','THERMOREGULATION','ENERGY_STORAGE','IMPACT_ABSORPTION','AQUATIC_ADAPTATION') then raise exception 'invalid evolution function'; end if;
  if not exists (select 1 from public.player_creatures where id = p_creature_id and profile_id = p_profile_id) then return jsonb_build_object('outcome','CREATURE_NOT_OWNED'); end if;
  if p_visual_progress_track_id is not null and not exists (select 1 from public.creature_visual_progress_tracks where id = p_visual_progress_track_id and profile_id = p_profile_id and creature_id = p_creature_id) then raise exception 'VISUAL_TRACK_NOT_FOUND'; end if;
  if p_source_visual_version_id is not null and not exists (select 1 from public.creature_visual_versions where id = p_source_visual_version_id and profile_id = p_profile_id and creature_id = p_creature_id and status = 'ACTIVE') then raise exception 'CREATURE_VISUAL_VERSION_CONFLICT'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_profile_id::text || ':' || p_idempotency_key, 0));
  select * into v_request from public.creature_transformation_requests where profile_id = p_profile_id and idempotency_key = p_idempotency_key;
  if found then
    if v_request.request_fingerprint is not null and p_request_fingerprint is not null and v_request.request_fingerprint <> p_request_fingerprint then return jsonb_build_object('outcome','IDEMPOTENCY_KEY_REUSED'); end if;
    return jsonb_build_object('outcome','EXISTING','record',to_jsonb(v_request));
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_profile_id::text || ':' || v_day::text, 1));
  if p_image_provider_mode = 'REAL' then
    if p_daily_real_image_limit is null or p_daily_real_image_limit < 1
      or p_global_daily_real_image_limit is null or p_global_daily_real_image_limit < 1
      or p_global_concurrent_real_image_limit is null or p_global_concurrent_real_image_limit < 1
      or p_real_image_cooldown_seconds < 0
      or p_stale_request_seconds is null or p_stale_request_seconds < 60 then raise exception 'real image limits are not configured'; end if;
    perform pg_advisory_xact_lock(hashtextextended('real-image-global:' || v_day::text, 2));

    update public.creature_transformation_requests
    set status = 'FAILED', error_code = 'REAL_IMAGE_REQUEST_STALE', error_message = 'La generazione REAL non ha completato entro il tempo massimo.', completed_at = now(), updated_at = now()
    where image_provider_mode = 'REAL' and status in ('RESERVED', 'RUNNING')
      and coalesce(started_at, created_at) < now() - make_interval(secs => p_stale_request_seconds);

    if p_request_fingerprint is not null then
      select * into v_request from public.creature_transformation_requests
      where profile_id = p_profile_id and request_day = v_day and request_fingerprint = p_request_fingerprint
        and image_provider_mode = 'REAL' and status in ('RESERVED', 'RUNNING', 'SUCCEEDED') limit 1;
      if found then return jsonb_build_object('outcome','EXISTING','record',to_jsonb(v_request)); end if;
    end if;
    select count(*)::integer, max(created_at) into v_count, v_last_created_at from public.creature_transformation_requests where profile_id = p_profile_id and request_day = v_day and image_provider_mode = 'REAL';
    if v_count >= p_daily_real_image_limit then return jsonb_build_object('outcome','REAL_IMAGE_USER_LIMIT_REACHED'); end if;
    select count(*)::integer into v_count from public.creature_transformation_requests where profile_id = p_profile_id and request_day = v_day and image_provider_mode = 'REAL' and status in ('RESERVED','RUNNING');
    if v_count >= 1 then return jsonb_build_object('outcome','REAL_IMAGE_USER_CONCURRENCY_REACHED'); end if;
    if v_last_created_at is not null and timezone('utc', now()) < v_last_created_at + make_interval(secs => p_real_image_cooldown_seconds) then return jsonb_build_object('outcome','REAL_IMAGE_COOLDOWN_ACTIVE'); end if;
    select count(*)::integer into v_count from public.creature_transformation_requests where request_day = v_day and image_provider_mode = 'REAL';
    if v_count >= p_global_daily_real_image_limit then return jsonb_build_object('outcome','REAL_IMAGE_GLOBAL_LIMIT_REACHED'); end if;
    select count(*)::integer into v_count from public.creature_transformation_requests where request_day = v_day and image_provider_mode = 'REAL' and status in ('RESERVED','RUNNING');
    if v_count >= p_global_concurrent_real_image_limit then return jsonb_build_object('outcome','REAL_IMAGE_GLOBAL_CONCURRENCY_REACHED'); end if;
  end if;

  select count(*)::integer, coalesce(sum(coalesce(actual_cost_usd, estimated_cost_usd, 0)),0)::numeric(12,6) into v_count, v_cost from public.creature_transformation_requests where profile_id = p_profile_id and created_at >= v_day_start;
  if p_daily_request_limit < 1 or v_count >= p_daily_request_limit then return jsonb_build_object('outcome','DAILY_LIMIT_REACHED'); end if;
  if coalesce(v_cost,0) + coalesce(p_estimated_cost_usd,0) > coalesce(p_daily_budget_usd,0) then return jsonb_build_object('outcome','DAILY_BUDGET_REACHED'); end if;

  insert into public.creature_transformation_requests(profile_id, creature_id, idempotency_key, operation, status, visual_trait_id, intensity, concept_mode, image_provider_mode, estimated_cost_usd, benchmark_case_id, generation_profile_id, concept_seed, visual_progress_track_id, source_visual_version_id, evolution_target_id, evolution_function, request_fingerprint, request_day)
  values (p_profile_id, p_creature_id, p_idempotency_key, p_operation, 'RESERVED', p_visual_trait_id, p_intensity, p_concept_mode, p_image_provider_mode, p_estimated_cost_usd, p_benchmark_case_id, p_generation_profile_id, p_concept_seed, p_visual_progress_track_id, p_source_visual_version_id, p_evolution_target_id, p_evolution_function, p_request_fingerprint, v_day)
  returning * into v_request;
  return jsonb_build_object('outcome','CREATED','record',to_jsonb(v_request));
end;
$$;

drop function public.map_legacy_evolution_target_id(text);

commit;
