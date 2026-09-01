-- A relative-height assessment is immutable metadata of the generated visual version. The
-- canonical creature height changes only while that version is atomically adopted.

create or replace function public.adopt_creature_transformation(
  p_profile_id uuid,
  p_creature_id uuid,
  p_progress_track_id uuid,
  p_transformation_request_id uuid,
  p_expected_current_visual_version_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_track public.creature_visual_progress_tracks%rowtype;
  v_request public.creature_transformation_requests%rowtype;
  v_current public.creature_visual_versions%rowtype;
  v_version public.creature_visual_versions%rowtype;
  v_next_number integer;
  v_comparison jsonb;
  v_result_height_meters numeric;
  v_next_height_meters numeric;
begin
  select * into v_track
  from public.creature_visual_progress_tracks
  where id = p_progress_track_id and profile_id = p_profile_id and creature_id = p_creature_id
  for update;
  if not found then raise exception 'VISUAL_TRACK_NOT_FOUND'; end if;
  if v_track.status <> 'GENERATED' then raise exception 'VISUAL_GENERATION_NOT_ADOPTABLE'; end if;
  if v_track.generated_request_id is distinct from p_transformation_request_id then
    raise exception 'VISUAL_TRACK_STATE_CONFLICT';
  end if;

  select * into v_request
  from public.creature_transformation_requests
  where id = p_transformation_request_id and profile_id = p_profile_id and creature_id = p_creature_id
  for update;
  if not found
    or v_request.status <> 'SUCCEEDED'
    or v_request.asset_readiness <> 'FINAL_ASSET'
    or v_request.result_path is null
    or v_request.result_sha256 is null
    or v_request.result_mime_type is null
    or v_request.result_width is null
    or v_request.result_height is null then
    raise exception 'VISUAL_GENERATION_NOT_ADOPTABLE';
  end if;
  if exists (
    select 1
    from public.creature_visual_versions
    where source_transformation_request_id = p_transformation_request_id
  ) then
    raise exception 'CREATURE_VISUAL_ALREADY_ADOPTED';
  end if;

  select * into v_current
  from public.creature_visual_versions
  where id = p_expected_current_visual_version_id and creature_id = p_creature_id and status = 'ACTIVE'
  for update;
  if not found or v_request.source_visual_version_id is distinct from p_expected_current_visual_version_id then
    raise exception 'CREATURE_VISUAL_VERSION_CONFLICT';
  end if;

  -- `resultHeightMeters` is already an absolute, clamped value. Never reapply its relative
  -- multiplier here: this branch merely verifies the service-only persisted contract.
  v_comparison := v_request.visual_inspection->'heightComparison';
  if v_comparison is not null
    and jsonb_typeof(v_comparison) = 'object'
    and v_comparison->>'schemaVersion' = 'relative-height-v1'
    and v_comparison->>'sourceVersionId' = v_current.id::text then
    begin
      v_result_height_meters := (v_comparison->>'resultHeightMeters')::numeric;
    exception when others then
      v_result_height_meters := null;
    end;
    if v_result_height_meters is not null
      and v_result_height_meters <> 'NaN'::numeric
      and v_result_height_meters between 0.45 and 4.5 then
      v_next_height_meters := v_result_height_meters;
    end if;
  end if;

  select coalesce(max(version_number), 0) + 1 into v_next_number
  from public.creature_visual_versions
  where creature_id = p_creature_id;
  update public.creature_visual_versions
  set status = 'SUPERSEDED'
  where id = v_current.id;
  insert into public.creature_visual_versions(
    creature_id,
    profile_id,
    version_number,
    previous_version_id,
    source_transformation_request_id,
    base_creature_key,
    visual_trait_id,
    concept_name,
    concept_snapshot,
    visual_inspection,
    prompt_template_version,
    prompt_sha256,
    asset_path,
    asset_sha256,
    mime_type,
    width,
    height,
    has_alpha,
    display_asset_path,
    display_asset_sha256,
    display_mime_type,
    display_width,
    display_height,
    status,
    adopted_at
  ) values (
    p_creature_id,
    p_profile_id,
    v_next_number,
    v_current.id,
    p_transformation_request_id,
    v_current.base_creature_key,
    v_track.visual_trait_id,
    coalesce(v_request.concept_snapshot->>'conceptName', 'Evoluzione visuale'),
    v_request.concept_snapshot,
    v_request.visual_inspection,
    v_request.prompt_template_version,
    v_request.prompt_sha256,
    v_request.result_path,
    v_request.result_sha256,
    v_request.result_mime_type,
    v_request.result_width,
    v_request.result_height,
    true,
    v_request.display_asset_path,
    v_request.display_asset_sha256,
    v_request.display_mime_type,
    v_request.display_width,
    v_request.display_height,
    'ACTIVE',
    timezone('utc', now())
  ) returning * into v_version;

  update public.player_creatures
  set current_visual_version_id = v_version.id,
      height_meters = coalesce(v_next_height_meters, height_meters)
  where id = p_creature_id and current_visual_version_id = v_current.id;
  if not found then raise exception 'CREATURE_VISUAL_VERSION_CONFLICT'; end if;

  update public.creature_visual_progress_tracks
  set status = 'COMPLETED',
      completed_version_id = v_version.id,
      completed_at = timezone('utc', now())
  where id = v_track.id;
  return to_jsonb(v_version);
end;
$$;

-- Selecting an earlier form is a re-adoption of that visual identity. Restore the immutable
-- value saved on the selected version; old forms pre-dating comparison safely return to 1.4 m.
create or replace function public.rollback_creature_visual_version(
  p_profile_id uuid,
  p_creature_id uuid,
  p_target_version_id uuid,
  p_expected_current_visual_version_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current public.creature_visual_versions%rowtype;
  v_target public.creature_visual_versions%rowtype;
  v_comparison jsonb;
  v_target_height_meters numeric;
begin
  if p_reason not in ('OWNER_CONFIRMED', 'ADMIN_CORRECTION') then
    raise exception 'VISUAL_ROLLBACK_FAILED';
  end if;
  select * into v_current
  from public.creature_visual_versions
  where id = p_expected_current_visual_version_id
    and creature_id = p_creature_id
    and profile_id = p_profile_id
    and status = 'ACTIVE'
  for update;
  if not found then raise exception 'CREATURE_VISUAL_VERSION_CONFLICT'; end if;
  select * into v_target
  from public.creature_visual_versions
  where id = p_target_version_id
    and creature_id = p_creature_id
    and profile_id = p_profile_id
    and status = 'SUPERSEDED'
  for update;
  if not found then raise exception 'VISUAL_VERSION_NOT_FOUND'; end if;

  v_comparison := v_target.visual_inspection->'heightComparison';
  if v_comparison is not null
    and jsonb_typeof(v_comparison) = 'object'
    and v_comparison->>'schemaVersion' = 'relative-height-v1' then
    begin
      v_target_height_meters := (v_comparison->>'resultHeightMeters')::numeric;
    exception when others then
      v_target_height_meters := null;
    end;
    if v_target_height_meters is not null
      and v_target_height_meters <> 'NaN'::numeric
      and v_target_height_meters not between 0.45 and 4.5 then
      v_target_height_meters := null;
    end if;
  end if;

  update public.creature_visual_versions
  set status = 'SUPERSEDED'
  where id = v_current.id;
  update public.creature_visual_versions
  set status = 'ACTIVE',
      adopted_at = coalesce(adopted_at, timezone('utc', now()))
  where id = v_target.id
  returning * into v_target;
  update public.player_creatures
  set current_visual_version_id = v_target.id,
      height_meters = coalesce(v_target_height_meters, 1.4)
  where id = p_creature_id and current_visual_version_id = v_current.id;
  if not found then raise exception 'CREATURE_VISUAL_VERSION_CONFLICT'; end if;
  insert into public.creature_visual_version_rollbacks(
    profile_id,
    creature_id,
    from_version_id,
    to_version_id,
    reason
  ) values (
    p_profile_id,
    p_creature_id,
    v_current.id,
    v_target.id,
    p_reason
  );
  return to_jsonb(v_target) || jsonb_build_object(
    'rollback_reason',
    p_reason,
    'rolled_back_at',
    timezone('utc', now())
  );
end;
$$;

revoke all on function public.adopt_creature_transformation(uuid, uuid, uuid, uuid, uuid)
from public, anon, authenticated;
grant execute on function public.adopt_creature_transformation(uuid, uuid, uuid, uuid, uuid)
to service_role;
revoke all on function public.rollback_creature_visual_version(uuid, uuid, uuid, uuid, text)
from public, anon, authenticated;
grant execute on function public.rollback_creature_visual_version(uuid, uuid, uuid, uuid, text)
to service_role;

notify pgrst, 'reload schema';
