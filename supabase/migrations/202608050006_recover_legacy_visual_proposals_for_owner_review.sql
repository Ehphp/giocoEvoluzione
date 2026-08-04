-- Legacy raw PNGs were generated before the owner-review workflow. Keep their
-- diagnostics, but present them as proposals the owner may explicitly adopt.
update public.creature_transformation_requests
set asset_readiness = 'FINAL_ASSET',
    validation_warnings = coalesce(validation_warnings, '[]'::jsonb) || jsonb_build_array('LEGACY_ASSET_REVIEW_REQUIRED'),
    updated_at = timezone('utc', now())
where operation = 'GENERATE_UNLOCKED_TRANSFORMATION'
  and status = 'SUCCEEDED'
  and asset_readiness = 'EXPERIMENT_ONLY'
  and result_path ~ ('^experiments/raw/' || profile_id::text || '/[a-f0-9]{64}\.png$');

with latest_legacy_proposal as (
  select distinct on (track.id) track.id as track_id, request.id as request_id
  from public.creature_visual_progress_tracks track
  join public.creature_transformation_requests request
    on request.profile_id = track.profile_id
    and request.creature_id = track.creature_id
    and request.visual_progress_track_id = track.id
  where track.status = 'READY'
    and request.status = 'SUCCEEDED'
    and request.asset_readiness = 'FINAL_ASSET'
    and request.validation_warnings @> '["LEGACY_ASSET_REVIEW_REQUIRED"]'::jsonb
  order by track.id, request.completed_at desc nulls last, request.created_at desc
)
update public.creature_visual_progress_tracks track
set status = 'GENERATED',
    generated_request_id = proposal.request_id
from latest_legacy_proposal proposal
where track.id = proposal.track_id;

create or replace function public.adopt_creature_transformation(
  p_profile_id uuid, p_creature_id uuid, p_progress_track_id uuid,
  p_transformation_request_id uuid, p_expected_current_visual_version_id uuid
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_track public.creature_visual_progress_tracks%rowtype; v_request public.creature_transformation_requests%rowtype;
  v_current public.creature_visual_versions%rowtype; v_version public.creature_visual_versions%rowtype; v_next_number integer;
begin
  select * into v_track from public.creature_visual_progress_tracks where id = p_progress_track_id and profile_id = p_profile_id and creature_id = p_creature_id for update;
  if not found then raise exception 'VISUAL_TRACK_NOT_FOUND'; end if;
  if v_track.status <> 'GENERATED' then raise exception 'VISUAL_GENERATION_NOT_ADOPTABLE'; end if;
  if v_track.generated_request_id is distinct from p_transformation_request_id then raise exception 'VISUAL_TRACK_STATE_CONFLICT'; end if;
  select * into v_request from public.creature_transformation_requests where id = p_transformation_request_id and profile_id = p_profile_id and creature_id = p_creature_id for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  if v_request.status <> 'SUCCEEDED' or v_request.asset_readiness <> 'FINAL_ASSET' or v_request.result_path is null or v_request.result_sha256 is null or v_request.result_mime_type is null or v_request.result_width is null or v_request.result_height is null then
    raise exception 'VISUAL_GENERATION_NOT_ADOPTABLE';
  end if;
  if exists (select 1 from public.creature_visual_versions where source_transformation_request_id = p_transformation_request_id) then raise exception 'CREATURE_VISUAL_ALREADY_ADOPTED'; end if;
  select * into v_current from public.creature_visual_versions where id = p_expected_current_visual_version_id and creature_id = p_creature_id and status = 'ACTIVE' for update;
  if not found or v_request.source_visual_version_id is distinct from p_expected_current_visual_version_id then raise exception 'CREATURE_VISUAL_VERSION_CONFLICT'; end if;
  select coalesce(max(version_number), 0) + 1 into v_next_number from public.creature_visual_versions where creature_id = p_creature_id;
  update public.creature_visual_versions set status = 'SUPERSEDED' where id = v_current.id;
  insert into public.creature_visual_versions(
    creature_id, profile_id, version_number, previous_version_id, source_transformation_request_id, base_creature_key,
    visual_trait_id, concept_name, concept_snapshot, prompt_template_version, prompt_sha256,
    asset_path, asset_sha256, mime_type, width, height, has_alpha, status, adopted_at
  ) values (
    p_creature_id, p_profile_id, v_next_number, v_current.id, p_transformation_request_id, v_current.base_creature_key,
    v_track.visual_trait_id, coalesce(v_request.concept_snapshot->>'conceptName','Evoluzione visuale'), v_request.concept_snapshot,
    v_request.prompt_template_version, v_request.prompt_sha256, v_request.result_path, v_request.result_sha256,
    v_request.result_mime_type, v_request.result_width, v_request.result_height,
    not (coalesce(v_request.validation_warnings, '[]'::jsonb) @> '["PNG_ALPHA_REQUIRED"]'::jsonb
      or coalesce(v_request.validation_warnings, '[]'::jsonb) @> '["RAW_RESULT_ALPHA_MISSING"]'::jsonb),
    'ACTIVE', timezone('utc', now())
  ) returning * into v_version;
  update public.player_creatures set current_visual_version_id = v_version.id where id = p_creature_id and current_visual_version_id = v_current.id;
  if not found then raise exception 'CREATURE_VISUAL_VERSION_CONFLICT'; end if;
  update public.creature_visual_progress_tracks set status = 'COMPLETED', completed_version_id = v_version.id, completed_at = timezone('utc', now()) where id = v_track.id;
  return to_jsonb(v_version);
end;
$$;