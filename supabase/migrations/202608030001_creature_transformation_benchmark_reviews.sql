-- Fase 6C: benchmark controllato e review umane. Nessuna promozione o modifica a player_creatures.
-- Rollback manuale: revocare le RPC, rimuovere la tabella review, trigger e le colonne benchmark; non eliminare record da un pilot concluso.

alter table public.creature_transformation_requests
  add column benchmark_case_id text check (benchmark_case_id is null or benchmark_case_id ~ '^[a-z][a-z0-9-]{1,63}$'),
  add column generation_profile_id text check (generation_profile_id is null or generation_profile_id ~ '^[a-z][a-z0-9-]{1,63}$'),
  add column concept_seed text check (concept_seed is null or char_length(concept_seed) between 1 and 256),
  add column prompt_sha256 text check (prompt_sha256 is null or prompt_sha256 ~ '^[a-f0-9]{64}$'),
  add column concept_snapshot jsonb check (concept_snapshot is null or (jsonb_typeof(concept_snapshot) = 'object' and pg_column_size(concept_snapshot) <= 16384)),
  add column generation_quality text check (generation_quality is null or generation_quality in ('low', 'medium', 'high'));

create index creature_transformation_requests_benchmark_profile_idx
  on public.creature_transformation_requests (profile_id, benchmark_case_id, generation_profile_id, created_at desc)
  where benchmark_case_id is not null;

drop function public.reserve_creature_transformation_request(uuid, uuid, text, text, text, smallint, text, text, numeric, integer, numeric);

create function public.reserve_creature_transformation_request(
  p_profile_id uuid,
  p_creature_id uuid,
  p_idempotency_key text,
  p_operation text,
  p_visual_trait_id text,
  p_intensity smallint,
  p_concept_mode text,
  p_image_provider_mode text,
  p_estimated_cost_usd numeric,
  p_daily_request_limit integer,
  p_daily_budget_usd numeric,
  p_benchmark_case_id text default null,
  p_generation_profile_id text default null,
  p_concept_seed text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.creature_transformation_requests%rowtype;
  v_day_start timestamptz;
  v_daily_request_count integer;
  v_daily_cost numeric(12, 6);
begin
  if (p_benchmark_case_id is null) <> (p_generation_profile_id is null) then
    raise exception 'benchmark case and generation profile must be paired';
  end if;
  if p_benchmark_case_id is not null and p_concept_seed is null then
    raise exception 'benchmark concept seed is required';
  end if;
  if not exists (select 1 from public.player_creatures where id = p_creature_id and profile_id = p_profile_id) then
    return jsonb_build_object('outcome', 'CREATURE_NOT_OWNED');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_profile_id::text || ':' || p_idempotency_key, 0));
  select * into v_request from public.creature_transformation_requests where profile_id = p_profile_id and idempotency_key = p_idempotency_key;
  if found then return jsonb_build_object('outcome', 'EXISTING', 'record', to_jsonb(v_request)); end if;
  v_day_start := date_trunc('day', timezone('utc', now())) at time zone 'utc';
  perform pg_advisory_xact_lock(hashtextextended(p_profile_id::text || ':' || v_day_start::date::text, 1));
  select count(*)::integer, coalesce(sum(coalesce(actual_cost_usd, estimated_cost_usd, 0)), 0)::numeric(12, 6)
  into v_daily_request_count, v_daily_cost
  from public.creature_transformation_requests where profile_id = p_profile_id and created_at >= v_day_start;
  if p_daily_request_limit < 1 or v_daily_request_count >= p_daily_request_limit then return jsonb_build_object('outcome', 'DAILY_LIMIT_REACHED'); end if;
  if coalesce(v_daily_cost, 0) + coalesce(p_estimated_cost_usd, 0) > coalesce(p_daily_budget_usd, 0) then return jsonb_build_object('outcome', 'DAILY_BUDGET_REACHED'); end if;
  insert into public.creature_transformation_requests (
    profile_id, creature_id, idempotency_key, operation, status, visual_trait_id, intensity, concept_mode, image_provider_mode,
    estimated_cost_usd, benchmark_case_id, generation_profile_id, concept_seed
  ) values (
    p_profile_id, p_creature_id, p_idempotency_key, p_operation, 'RESERVED', p_visual_trait_id, p_intensity, p_concept_mode, p_image_provider_mode,
    p_estimated_cost_usd, p_benchmark_case_id, p_generation_profile_id, p_concept_seed
  ) returning * into v_request;
  return jsonb_build_object('outcome', 'CREATED', 'record', to_jsonb(v_request));
end;
$$;

drop function public.transition_creature_transformation_request(uuid, uuid, text, text, text, text, text, integer, text, text, text, text, integer, integer, integer, numeric, numeric, text, text, text, jsonb);

create function public.transition_creature_transformation_request(
  p_request_id uuid,
  p_profile_id uuid,
  p_target_status text,
  p_provider text default null,
  p_model text default null,
  p_provider_request_id text default null,
  p_prompt_template_version text default null,
  p_concept_schema_version integer default null,
  p_source_sha256 text default null,
  p_result_sha256 text default null,
  p_result_path text default null,
  p_result_mime_type text default null,
  p_result_width integer default null,
  p_result_height integer default null,
  p_generation_latency_ms integer default null,
  p_estimated_cost_usd numeric default null,
  p_actual_cost_usd numeric default null,
  p_error_code text default null,
  p_error_message text default null,
  p_asset_readiness text default null,
  p_validation_warnings jsonb default null,
  p_generation_quality text default null,
  p_prompt_sha256 text default null,
  p_concept_snapshot jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.creature_transformation_requests%rowtype;
  v_now timestamptz := timezone('utc', now());
  v_transition_allowed boolean := false;
begin
  select * into v_request from public.creature_transformation_requests where id = p_request_id and profile_id = p_profile_id for update;
  if not found then raise exception 'transformation request not found'; end if;
  v_transition_allowed := (v_request.status = 'RESERVED' and p_target_status in ('RUNNING', 'FAILED')) or (v_request.status = 'RUNNING' and p_target_status in ('SUCCEEDED', 'FAILED'));
  if not v_transition_allowed then return jsonb_build_object('outcome', 'CONFLICT', 'record', to_jsonb(v_request)); end if;
  if p_asset_readiness is not null and p_asset_readiness not in ('FINAL_ASSET', 'EXPERIMENT_ONLY') then raise exception 'invalid asset readiness'; end if;
  if p_validation_warnings is not null and jsonb_typeof(p_validation_warnings) <> 'array' then raise exception 'invalid validation warnings'; end if;
  if p_generation_quality is not null and p_generation_quality not in ('low', 'medium', 'high') then raise exception 'invalid generation quality'; end if;
  if p_prompt_sha256 is not null and p_prompt_sha256 !~ '^[a-f0-9]{64}$' then raise exception 'invalid prompt hash'; end if;
  if p_concept_snapshot is not null and (jsonb_typeof(p_concept_snapshot) <> 'object' or pg_column_size(p_concept_snapshot) > 16384) then raise exception 'invalid concept snapshot'; end if;
  update public.creature_transformation_requests set
    status = p_target_status,
    provider = coalesce(p_provider, provider), model = coalesce(p_model, model), provider_request_id = coalesce(p_provider_request_id, provider_request_id),
    prompt_template_version = coalesce(p_prompt_template_version, prompt_template_version), concept_schema_version = coalesce(p_concept_schema_version, concept_schema_version),
    source_sha256 = coalesce(p_source_sha256, source_sha256), result_sha256 = coalesce(p_result_sha256, result_sha256), result_path = coalesce(p_result_path, result_path),
    result_mime_type = coalesce(p_result_mime_type, result_mime_type), result_width = coalesce(p_result_width, result_width), result_height = coalesce(p_result_height, result_height),
    generation_latency_ms = coalesce(p_generation_latency_ms, generation_latency_ms), estimated_cost_usd = coalesce(p_estimated_cost_usd, estimated_cost_usd), actual_cost_usd = coalesce(p_actual_cost_usd, actual_cost_usd),
    asset_readiness = coalesce(p_asset_readiness, asset_readiness), validation_warnings = coalesce(p_validation_warnings, validation_warnings), generation_quality = coalesce(p_generation_quality, generation_quality),
    prompt_sha256 = coalesce(p_prompt_sha256, prompt_sha256), concept_snapshot = coalesce(p_concept_snapshot, concept_snapshot),
    attempt_count = case when p_target_status = 'RUNNING' then attempt_count + 1 else attempt_count end,
    started_at = case when p_target_status = 'RUNNING' then v_now else started_at end, completed_at = case when p_target_status in ('SUCCEEDED', 'FAILED') then v_now else completed_at end,
    error_code = case when p_target_status = 'FAILED' then p_error_code else null end,
    error_message = case when p_target_status = 'FAILED' then left(coalesce(p_error_message, 'Richiesta non riuscita.'), 300) else null end
  where id = v_request.id returning * into v_request;
  return jsonb_build_object('outcome', 'UPDATED', 'record', to_jsonb(v_request));
end;
$$;

create table public.creature_transformation_experiment_reviews (
  id uuid primary key default gen_random_uuid(),
  transformation_request_id uuid not null references public.creature_transformation_requests(id) on delete cascade,
  reviewer_profile_id uuid not null references public.profiles(id) on delete cascade,
  identity_preservation_score smallint not null check (identity_preservation_score between 1 and 5),
  face_preservation_score smallint not null check (face_preservation_score between 1 and 5),
  pose_composition_score smallint not null check (pose_composition_score between 1 and 5),
  trait_readability_score smallint not null check (trait_readability_score between 1 and 5),
  style_coherence_score smallint not null check (style_coherence_score between 1 and 5),
  anatomy_quality_score smallint not null check (anatomy_quality_score between 1 and 5),
  technical_quality_score smallint not null check (technical_quality_score between 1 and 5),
  overall_score smallint not null check (overall_score between 1 and 5),
  verdict text not null check (verdict in ('REJECTED', 'PROMISING', 'ACCEPTABLE_EXPERIMENT', 'FINAL_ASSET_CANDIDATE')),
  issue_flags text[] not null default '{}' check (issue_flags <@ array['IDENTITY_LOST','FACE_CHANGED','EYES_CHANGED','POSE_CHANGED','SILHOUETTE_CHANGED','PALETTE_CHANGED','TRAIT_NOT_VISIBLE','TRAIT_TOO_STRONG','TRAIT_TOO_WEAK','ANATOMY_DEFORMED','EXTRA_LIMBS','UNREQUESTED_OBJECT','BACKGROUND_INTRODUCED','STYLE_DRIFT','LOW_IMAGE_QUALITY','ALPHA_MISSING','CANVAS_INCORRECT']::text[]),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (transformation_request_id, reviewer_profile_id)
);

create trigger creature_transformation_experiment_reviews_set_updated_at
before update on public.creature_transformation_experiment_reviews
for each row execute function public.set_updated_at();

alter table public.creature_transformation_experiment_reviews enable row level security;
revoke all on table public.creature_transformation_experiment_reviews from public, anon, authenticated;
grant all privileges on table public.creature_transformation_experiment_reviews to service_role;

create function public.upsert_creature_transformation_experiment_review(
  p_transformation_request_id uuid,
  p_reviewer_profile_id uuid,
  p_identity_preservation_score smallint,
  p_face_preservation_score smallint,
  p_pose_composition_score smallint,
  p_trait_readability_score smallint,
  p_style_coherence_score smallint,
  p_anatomy_quality_score smallint,
  p_technical_quality_score smallint,
  p_overall_score smallint,
  p_verdict text,
  p_issue_flags text[],
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.creature_transformation_requests%rowtype;
  v_review public.creature_transformation_experiment_reviews%rowtype;
begin
  select * into v_request from public.creature_transformation_requests
  where id = p_transformation_request_id and profile_id = p_reviewer_profile_id for share;
  if not found then raise exception 'benchmark request not owned by reviewer'; end if;
  if v_request.status <> 'SUCCEEDED' or v_request.result_path is null or v_request.benchmark_case_id is null then raise exception 'benchmark request is not reviewable'; end if;
  if p_identity_preservation_score not between 1 and 5 or p_face_preservation_score not between 1 and 5 or p_pose_composition_score not between 1 and 5 or p_trait_readability_score not between 1 and 5 or p_style_coherence_score not between 1 and 5 or p_anatomy_quality_score not between 1 and 5 or p_technical_quality_score not between 1 and 5 or p_overall_score not between 1 and 5 then raise exception 'invalid review score'; end if;
  if p_verdict not in ('REJECTED', 'PROMISING', 'ACCEPTABLE_EXPERIMENT', 'FINAL_ASSET_CANDIDATE') then raise exception 'invalid review verdict'; end if;
  if p_issue_flags is null or not (p_issue_flags <@ array['IDENTITY_LOST','FACE_CHANGED','EYES_CHANGED','POSE_CHANGED','SILHOUETTE_CHANGED','PALETTE_CHANGED','TRAIT_NOT_VISIBLE','TRAIT_TOO_STRONG','TRAIT_TOO_WEAK','ANATOMY_DEFORMED','EXTRA_LIMBS','UNREQUESTED_OBJECT','BACKGROUND_INTRODUCED','STYLE_DRIFT','LOW_IMAGE_QUALITY','ALPHA_MISSING','CANVAS_INCORRECT']::text[]) then raise exception 'invalid review issue flags'; end if;
  if p_notes is not null and char_length(p_notes) > 2000 then raise exception 'review notes too long'; end if;
  insert into public.creature_transformation_experiment_reviews (
    transformation_request_id, reviewer_profile_id, identity_preservation_score, face_preservation_score, pose_composition_score, trait_readability_score,
    style_coherence_score, anatomy_quality_score, technical_quality_score, overall_score, verdict, issue_flags, notes
  ) values (
    p_transformation_request_id, p_reviewer_profile_id, p_identity_preservation_score, p_face_preservation_score, p_pose_composition_score, p_trait_readability_score,
    p_style_coherence_score, p_anatomy_quality_score, p_technical_quality_score, p_overall_score, p_verdict, p_issue_flags, nullif(trim(p_notes), '')
  ) on conflict (transformation_request_id, reviewer_profile_id) do update set
    identity_preservation_score = excluded.identity_preservation_score, face_preservation_score = excluded.face_preservation_score,
    pose_composition_score = excluded.pose_composition_score, trait_readability_score = excluded.trait_readability_score,
    style_coherence_score = excluded.style_coherence_score, anatomy_quality_score = excluded.anatomy_quality_score,
    technical_quality_score = excluded.technical_quality_score, overall_score = excluded.overall_score, verdict = excluded.verdict,
    issue_flags = excluded.issue_flags, notes = excluded.notes
  returning * into v_review;
  return to_jsonb(v_review);
end;
$$;

revoke all on function public.reserve_creature_transformation_request(uuid, uuid, text, text, text, smallint, text, text, numeric, integer, numeric, text, text, text) from public, anon, authenticated;
revoke all on function public.transition_creature_transformation_request(uuid, uuid, text, text, text, text, text, integer, text, text, text, text, integer, integer, integer, numeric, numeric, text, text, text, jsonb, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.upsert_creature_transformation_experiment_review(uuid, uuid, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint, text, text[], text) from public, anon, authenticated;
grant execute on function public.reserve_creature_transformation_request(uuid, uuid, text, text, text, smallint, text, text, numeric, integer, numeric, text, text, text) to service_role;
grant execute on function public.transition_creature_transformation_request(uuid, uuid, text, text, text, text, text, integer, text, text, text, text, integer, integer, integer, numeric, numeric, text, text, text, jsonb, text, text, jsonb) to service_role;
grant execute on function public.upsert_creature_transformation_experiment_review(uuid, uuid, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint, text, text[], text) to service_role;
