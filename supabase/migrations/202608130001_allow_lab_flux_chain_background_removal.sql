-- Lab-only FLUX chain steps share the proven browser post-processing lifecycle,
-- but intentionally do not own or mutate a productive visual-progress track.
create or replace function public.finalize_creature_background_removal_candidate(
  p_profile_id uuid, p_request_id uuid, p_candidate_path text, p_candidate_sha256 text,
  p_candidate_mime_type text, p_candidate_width integer, p_candidate_height integer,
  p_validation_warnings jsonb
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_request public.creature_transformation_requests%rowtype; v_track public.creature_visual_progress_tracks%rowtype;
begin
  if p_candidate_path !~ ('^candidates/' || p_profile_id::text || '/[a-f0-9]{64}\.png$')
    or p_candidate_sha256 !~ '^[a-f0-9]{64}$'
    or p_candidate_mime_type <> 'image/png'
    or p_candidate_width <> 1024 or p_candidate_height <> 1536
    or jsonb_typeof(coalesce(p_validation_warnings, '[]'::jsonb)) <> 'array' then
    raise exception 'BACKGROUND_REMOVAL_CANDIDATE_INVALID';
  end if;
  select * into v_request from public.creature_transformation_requests where id = p_request_id and profile_id = p_profile_id for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  if v_request.status = 'SUCCEEDED' and v_request.asset_readiness = 'FINAL_ASSET' then return jsonb_build_object('outcome', 'UPDATED', 'record', to_jsonb(v_request)); end if;
  if v_request.operation <> 'GENERATE_UNLOCKED_TRANSFORMATION' or v_request.status <> 'SUCCEEDED' or v_request.asset_readiness <> 'EXPERIMENT_ONLY'
    or v_request.result_path !~ ('^experiments/raw/' || p_profile_id::text || '/[a-f0-9]{64}\.png$')
    or v_request.result_sha256 is null or v_request.result_mime_type <> 'image/png'
    or v_request.result_width <> 1024 or v_request.result_height <> 1536 then
    return jsonb_build_object('outcome', 'CONFLICT');
  end if;
  if v_request.visual_progress_track_id is not null then
    select * into v_track from public.creature_visual_progress_tracks where id = v_request.visual_progress_track_id and profile_id = p_profile_id for update;
    if not found or v_track.creature_id <> v_request.creature_id or v_track.status <> 'POST_PROCESSING' or v_track.generated_request_id is distinct from v_request.id then return jsonb_build_object('outcome', 'CONFLICT'); end if;
  end if;
  update public.creature_transformation_requests set
    raw_result_sha256 = result_sha256, raw_result_path = result_path, raw_result_mime_type = result_mime_type, raw_result_width = result_width, raw_result_height = result_height,
    result_sha256 = p_candidate_sha256, result_path = p_candidate_path, result_mime_type = p_candidate_mime_type, result_width = p_candidate_width, result_height = p_candidate_height,
    asset_readiness = 'FINAL_ASSET', validation_warnings = coalesce(p_validation_warnings, '[]'::jsonb), updated_at = timezone('utc', now()) where id = v_request.id returning * into v_request;
  if v_request.visual_progress_track_id is not null then update public.creature_visual_progress_tracks set status = 'GENERATED' where id = v_track.id; end if;
  return jsonb_build_object('outcome', 'UPDATED', 'record', to_jsonb(v_request));
end;
$$;
