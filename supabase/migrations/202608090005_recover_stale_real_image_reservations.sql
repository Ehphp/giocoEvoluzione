-- Atomically release orphaned REAL reservations before enforcing the per-user
-- and global concurrency limits. The timeout is supplied by the Edge policy.

drop function if exists public.reserve_creature_transformation_request(
  uuid, uuid, text, text, text, smallint, text, text, numeric, integer, numeric,
  text, text, text, uuid, uuid, text, text, text, integer, integer, integer, integer
);

create function public.reserve_creature_transformation_request(
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
  if p_evolution_target_id is not null and p_evolution_target_id not in ('TAIL','FORELIMBS','HIND_LIMBS','HEAD_AND_SENSES','TORSO_AND_BACK','SKIN') then raise exception 'invalid evolution target'; end if;
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

revoke all on function public.reserve_creature_transformation_request(
  uuid, uuid, text, text, text, smallint, text, text, numeric, integer, numeric,
  text, text, text, uuid, uuid, text, text, text, integer, integer, integer, integer, integer
) from public, anon, authenticated;
grant execute on function public.reserve_creature_transformation_request(
  uuid, uuid, text, text, text, smallint, text, text, numeric, integer, numeric,
  text, text, text, uuid, uuid, text, text, text, integer, integer, integer, integer, integer
) to service_role;
