-- Fase 6A: persistent request ledger, strong idempotency and guarded state transitions.
-- Rollback manuale: revocare le RPC, rimuovere le policy e poi drop della tabella.

create table public.creature_transformation_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  creature_id uuid not null references public.player_creatures(id) on delete cascade,
  idempotency_key text not null check (char_length(btrim(idempotency_key)) between 1 and 256),
  operation text not null check (operation in ('GENERATE_CONCEPT', 'GENERATE_IMAGE')),
  status text not null check (status in ('RESERVED', 'RUNNING', 'SUCCEEDED', 'FAILED')),
  concept_mode text check (concept_mode is null or concept_mode in ('MOCK', 'AI')),
  image_provider_mode text check (image_provider_mode is null or image_provider_mode in ('MOCK', 'REAL')),
  provider text,
  model text,
  provider_request_id text,
  visual_trait_id text,
  intensity smallint check (intensity is null or intensity between 1 and 3),
  prompt_template_version text,
  concept_schema_version integer,
  source_sha256 text check (source_sha256 is null or source_sha256 ~ '^[a-f0-9]{64}$'),
  result_sha256 text check (result_sha256 is null or result_sha256 ~ '^[a-f0-9]{64}$'),
  result_path text,
  result_mime_type text check (result_mime_type is null or result_mime_type = 'image/png'),
  result_width integer check (result_width is null or result_width > 0),
  result_height integer check (result_height is null or result_height > 0),
  generation_latency_ms integer check (generation_latency_ms is null or generation_latency_ms >= 0),
  estimated_cost_usd numeric(12, 6) check (estimated_cost_usd is null or estimated_cost_usd >= 0),
  actual_cost_usd numeric(12, 6) check (actual_cost_usd is null or actual_cost_usd >= 0),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  error_code text,
  error_message text check (error_message is null or char_length(error_message) <= 300),
  created_at timestamptz not null default timezone('utc', now()),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now()),
  unique (profile_id, idempotency_key)
);

create index creature_transformation_requests_profile_created_idx
  on public.creature_transformation_requests (profile_id, created_at desc);
create index creature_transformation_requests_status_updated_idx
  on public.creature_transformation_requests (status, updated_at asc);

create trigger creature_transformation_requests_set_updated_at
before update on public.creature_transformation_requests
for each row execute function public.set_updated_at();

alter table public.creature_transformation_requests enable row level security;
create policy "transformation requests own read"
on public.creature_transformation_requests
for select to authenticated
using (profile_id = auth.uid());

grant select on public.creature_transformation_requests to authenticated;
grant all privileges on public.creature_transformation_requests to service_role;

create or replace function public.reserve_creature_transformation_request(
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
  p_daily_budget_usd numeric
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
  if not exists (
    select 1
    from public.player_creatures
    where id = p_creature_id and profile_id = p_profile_id
  ) then
    return jsonb_build_object('outcome', 'CREATURE_NOT_OWNED');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_profile_id::text || ':' || p_idempotency_key, 0));

  select * into v_request
  from public.creature_transformation_requests
  where profile_id = p_profile_id and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('outcome', 'EXISTING', 'record', to_jsonb(v_request));
  end if;

  v_day_start := date_trunc('day', timezone('utc', now())) at time zone 'utc';
  -- The idempotency lock above serializes equal keys; this second lock serializes
  -- different keys for the same profile/day before checking quota and budget.
  perform pg_advisory_xact_lock(hashtextextended(p_profile_id::text || ':' || v_day_start::date::text, 1));
  select
    count(*)::integer,
    coalesce(sum(coalesce(actual_cost_usd, estimated_cost_usd, 0)), 0)::numeric(12, 6)
  into v_daily_request_count, v_daily_cost
  from public.creature_transformation_requests
  where profile_id = p_profile_id and created_at >= v_day_start;

  if p_daily_request_limit < 1 or v_daily_request_count >= p_daily_request_limit then
    return jsonb_build_object('outcome', 'DAILY_LIMIT_REACHED');
  end if;
  if coalesce(v_daily_cost, 0) + coalesce(p_estimated_cost_usd, 0) > coalesce(p_daily_budget_usd, 0) then
    return jsonb_build_object('outcome', 'DAILY_BUDGET_REACHED');
  end if;

  insert into public.creature_transformation_requests (
    profile_id, creature_id, idempotency_key, operation, status,
    visual_trait_id, intensity, concept_mode, image_provider_mode, estimated_cost_usd
  ) values (
    p_profile_id, p_creature_id, p_idempotency_key, p_operation, 'RESERVED',
    p_visual_trait_id, p_intensity, p_concept_mode, p_image_provider_mode, p_estimated_cost_usd
  ) returning * into v_request;

  return jsonb_build_object('outcome', 'CREATED', 'record', to_jsonb(v_request));
end;
$$;

create or replace function public.transition_creature_transformation_request(
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
  p_error_message text default null
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

revoke all on function public.reserve_creature_transformation_request(uuid, uuid, text, text, text, smallint, text, text, numeric, integer, numeric) from public, anon, authenticated;
revoke all on function public.transition_creature_transformation_request(uuid, uuid, text, text, text, text, text, integer, text, text, text, text, integer, integer, integer, numeric, numeric, text, text) from public, anon, authenticated;
grant execute on function public.reserve_creature_transformation_request(uuid, uuid, text, text, text, smallint, text, text, numeric, integer, numeric) to service_role;
grant execute on function public.transition_creature_transformation_request(uuid, uuid, text, text, text, text, text, integer, text, text, text, text, integer, integer, integer, numeric, numeric, text, text) to service_role;
