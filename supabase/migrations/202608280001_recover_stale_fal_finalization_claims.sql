-- A finalizer can be terminated after it has acquired its durable claim but before it has
-- persisted a terminal result. A later verified callback must be able to reclaim that exact Fal
-- request without submitting another generation.

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

  if v_request.fal_finalization_request_id is not null then
    if v_request.fal_finalization_request_id <> p_provider_request_id
      or (v_request.fal_finalization_started_at is not null
        and v_request.fal_finalization_started_at > timezone('utc', now()) - interval '10 minutes') then
      return jsonb_build_object('outcome', 'IN_PROGRESS', 'record', to_jsonb(v_request));
    end if;

    update public.creature_transformation_requests
    set fal_finalization_request_id = null,
        fal_finalization_started_at = null,
        updated_at = timezone('utc', now())
    where id = v_request.id
    returning * into v_request;
  end if;

  update public.creature_transformation_requests
  set fal_finalization_request_id = p_provider_request_id,
      fal_finalization_started_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  where id = v_request.id
  returning * into v_request;

  return jsonb_build_object('outcome', 'CLAIMED', 'record', to_jsonb(v_request));
end;
$$;

revoke all on function public.claim_fal_transformation_finalization(text) from public, anon, authenticated;
grant execute on function public.claim_fal_transformation_finalization(text) to service_role;
