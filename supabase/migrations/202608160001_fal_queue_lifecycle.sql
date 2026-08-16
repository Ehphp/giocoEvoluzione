-- Fal Queue splits submission, verified callback and finalization. The request status remains
-- RUNNING throughout queueing, inference and finalization; no media bytes are stored in Postgres.

alter table public.creature_transformation_requests
  add column if not exists fal_workflow jsonb,
  add column if not exists fal_finalization_request_id text,
  add column if not exists fal_finalization_started_at timestamptz;

alter table public.creature_transformation_requests
  drop constraint if exists creature_transformation_requests_fal_workflow_check;

alter table public.creature_transformation_requests
  add constraint creature_transformation_requests_fal_workflow_check
  check (fal_workflow is null or (jsonb_typeof(fal_workflow) = 'object' and pg_column_size(fal_workflow) <= 8192));

create unique index if not exists creature_transformation_requests_provider_request_id_key
  on public.creature_transformation_requests (provider_request_id)
  where provider_request_id is not null;

create index if not exists creature_transformation_requests_fal_finalization_idx
  on public.creature_transformation_requests (fal_finalization_started_at asc)
  where status = 'RUNNING' and fal_finalization_request_id is not null;

create or replace function public.update_running_fal_submission(
  p_request_id uuid,
  p_profile_id uuid,
  p_provider text,
  p_model text,
  p_provider_request_id text,
  p_source_sha256 text default null,
  p_prompt_template_version text default null,
  p_prompt_sha256 text default null,
  p_prompt_text text default null,
  p_concept_snapshot jsonb default null,
  p_fal_workflow jsonb default null,
  p_expected_provider_request_id text default null,
  p_increment_attempt boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.creature_transformation_requests%rowtype;
begin
  if p_provider <> 'fal.ai' then raise exception 'invalid Fal provider'; end if;
  if p_model is null or char_length(btrim(p_model)) = 0 then raise exception 'invalid Fal model'; end if;
  if p_provider_request_id is null or char_length(btrim(p_provider_request_id)) = 0 or char_length(p_provider_request_id) > 256 then raise exception 'invalid Fal request id'; end if;
  if p_source_sha256 is not null and p_source_sha256 !~ '^[a-f0-9]{64}$' then raise exception 'invalid source hash'; end if;
  if p_prompt_sha256 is not null and p_prompt_sha256 !~ '^[a-f0-9]{64}$' then raise exception 'invalid prompt hash'; end if;
  if p_prompt_text is not null and char_length(p_prompt_text) > 32768 then raise exception 'prompt text too long'; end if;
  if p_concept_snapshot is not null and (jsonb_typeof(p_concept_snapshot) <> 'object' or pg_column_size(p_concept_snapshot) > 16384) then raise exception 'invalid concept snapshot'; end if;
  if p_fal_workflow is not null and (jsonb_typeof(p_fal_workflow) <> 'object' or pg_column_size(p_fal_workflow) > 8192) then raise exception 'invalid Fal workflow'; end if;

  select * into v_request
  from public.creature_transformation_requests
  where id = p_request_id and profile_id = p_profile_id
  for update;
  if not found then raise exception 'transformation request not found'; end if;
  if v_request.status <> 'RUNNING' then return jsonb_build_object('outcome', 'CONFLICT', 'record', to_jsonb(v_request)); end if;
  if p_expected_provider_request_id is not null and v_request.provider_request_id is distinct from p_expected_provider_request_id then
    return jsonb_build_object('outcome', 'CONFLICT', 'record', to_jsonb(v_request));
  end if;

  update public.creature_transformation_requests
  set
    provider = p_provider,
    model = p_model,
    provider_request_id = p_provider_request_id,
    source_sha256 = coalesce(p_source_sha256, source_sha256),
    prompt_template_version = coalesce(p_prompt_template_version, prompt_template_version),
    prompt_sha256 = coalesce(p_prompt_sha256, prompt_sha256),
    prompt_text = coalesce(p_prompt_text, prompt_text),
    concept_snapshot = coalesce(p_concept_snapshot, concept_snapshot),
    fal_workflow = coalesce(p_fal_workflow, fal_workflow),
    fal_finalization_request_id = null,
    fal_finalization_started_at = null,
    attempt_count = attempt_count + case when p_increment_attempt then 1 else 0 end,
    updated_at = timezone('utc', now())
  where id = v_request.id
  returning * into v_request;

  return jsonb_build_object('outcome', 'UPDATED', 'record', to_jsonb(v_request));
end;
$$;

create or replace function public.claim_fal_transformation_finalization(p_provider_request_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.creature_transformation_requests%rowtype;
begin
  select * into v_request
  from public.creature_transformation_requests
  where provider_request_id = p_provider_request_id
  for update;
  if not found then return jsonb_build_object('outcome', 'UNKNOWN'); end if;
  if v_request.status <> 'RUNNING' then return jsonb_build_object('outcome', 'TERMINAL', 'record', to_jsonb(v_request)); end if;
  if v_request.fal_finalization_request_id is not null then return jsonb_build_object('outcome', 'IN_PROGRESS', 'record', to_jsonb(v_request)); end if;

  update public.creature_transformation_requests
  set fal_finalization_request_id = p_provider_request_id,
      fal_finalization_started_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where id = v_request.id
  returning * into v_request;
  return jsonb_build_object('outcome', 'CLAIMED', 'record', to_jsonb(v_request));
end;
$$;

revoke all on function public.update_running_fal_submission(uuid, uuid, text, text, text, text, text, text, text, jsonb, jsonb, text, boolean) from public, anon, authenticated;
revoke all on function public.claim_fal_transformation_finalization(text) from public, anon, authenticated;
grant execute on function public.update_running_fal_submission(uuid, uuid, text, text, text, text, text, text, text, jsonb, jsonb, text, boolean) to service_role;
grant execute on function public.claim_fal_transformation_finalization(text) to service_role;
