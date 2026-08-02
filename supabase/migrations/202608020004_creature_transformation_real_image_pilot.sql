-- Fase 6B: audit minimo del pilot immagini reali. Nessun prompt, byte o URL firmato.
-- Rollback manuale: ripristinare la RPC 6A, poi rimuovere le due colonne aggiunte.

alter table public.creature_transformation_requests
  add column asset_readiness text check (asset_readiness is null or asset_readiness in ('FINAL_ASSET', 'EXPERIMENT_ONLY')),
  add column validation_warnings jsonb not null default '[]'::jsonb check (jsonb_typeof(validation_warnings) = 'array');

drop function public.transition_creature_transformation_request(
  uuid, uuid, text, text, text, text, text, integer, text, text, text, text, integer, integer, integer, numeric, numeric, text, text
);

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
  p_validation_warnings jsonb default null
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
  select * into v_request
  from public.creature_transformation_requests
  where id = p_request_id and profile_id = p_profile_id
  for update;
  if not found then
    raise exception 'transformation request not found';
  end if;

  v_transition_allowed := (v_request.status = 'RESERVED' and p_target_status in ('RUNNING', 'FAILED'))
    or (v_request.status = 'RUNNING' and p_target_status in ('SUCCEEDED', 'FAILED'));
  if not v_transition_allowed then
    return jsonb_build_object('outcome', 'CONFLICT', 'record', to_jsonb(v_request));
  end if;

  if p_asset_readiness is not null and p_asset_readiness not in ('FINAL_ASSET', 'EXPERIMENT_ONLY') then
    raise exception 'invalid asset readiness';
  end if;
  if p_validation_warnings is not null and jsonb_typeof(p_validation_warnings) <> 'array' then
    raise exception 'invalid validation warnings';
  end if;

  update public.creature_transformation_requests
  set
    status = p_target_status,
    provider = coalesce(p_provider, provider),
    model = coalesce(p_model, model),
    provider_request_id = coalesce(p_provider_request_id, provider_request_id),
    prompt_template_version = coalesce(p_prompt_template_version, prompt_template_version),
    concept_schema_version = coalesce(p_concept_schema_version, concept_schema_version),
    source_sha256 = coalesce(p_source_sha256, source_sha256),
    result_sha256 = coalesce(p_result_sha256, result_sha256),
    result_path = coalesce(p_result_path, result_path),
    result_mime_type = coalesce(p_result_mime_type, result_mime_type),
    result_width = coalesce(p_result_width, result_width),
    result_height = coalesce(p_result_height, result_height),
    generation_latency_ms = coalesce(p_generation_latency_ms, generation_latency_ms),
    estimated_cost_usd = coalesce(p_estimated_cost_usd, estimated_cost_usd),
    actual_cost_usd = coalesce(p_actual_cost_usd, actual_cost_usd),
    asset_readiness = coalesce(p_asset_readiness, asset_readiness),
    validation_warnings = coalesce(p_validation_warnings, validation_warnings),
    attempt_count = case when p_target_status = 'RUNNING' then attempt_count + 1 else attempt_count end,
    started_at = case when p_target_status = 'RUNNING' then v_now else started_at end,
    completed_at = case when p_target_status in ('SUCCEEDED', 'FAILED') then v_now else completed_at end,
    error_code = case when p_target_status = 'FAILED' then p_error_code else null end,
    error_message = case when p_target_status = 'FAILED' then left(coalesce(p_error_message, 'Richiesta non riuscita.'), 300) else null end
  where id = v_request.id
  returning * into v_request;

  return jsonb_build_object('outcome', 'UPDATED', 'record', to_jsonb(v_request));
end;
$$;

revoke all on function public.transition_creature_transformation_request(uuid, uuid, text, text, text, text, text, integer, text, text, text, text, integer, integer, integer, numeric, numeric, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.transition_creature_transformation_request(uuid, uuid, text, text, text, text, text, integer, text, text, text, text, integer, integer, integer, numeric, numeric, text, text, text, jsonb) to service_role;
