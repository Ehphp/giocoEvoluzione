-- Server-side, fail-open Gemini visual inspection. It is metadata only: no visual asset,
-- gameplay state or adoption eligibility depends on it.

alter table public.creature_transformation_requests
  add column if not exists visual_inspection jsonb;
alter table public.creature_visual_versions
  add column if not exists visual_inspection jsonb;

alter table public.creature_transformation_requests
  drop constraint if exists creature_transformation_requests_visual_inspection_check;
alter table public.creature_transformation_requests
  add constraint creature_transformation_requests_visual_inspection_check check (
    visual_inspection is null
    or (jsonb_typeof(visual_inspection) = 'object' and pg_column_size(visual_inspection) <= 16384)
  );

alter table public.creature_visual_versions
  drop constraint if exists creature_visual_versions_visual_inspection_check;
alter table public.creature_visual_versions
  add constraint creature_visual_versions_visual_inspection_check check (
    visual_inspection is null
    or (jsonb_typeof(visual_inspection) = 'object' and pg_column_size(visual_inspection) <= 16384)
  );

create or replace function public.record_creature_transformation_visual_inspection(
  p_request_id uuid,
  p_profile_id uuid,
  p_visual_inspection jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_request public.creature_transformation_requests%rowtype;
begin
  if p_visual_inspection is null
    or jsonb_typeof(p_visual_inspection) <> 'object'
    or pg_column_size(p_visual_inspection) > 16384
    or p_visual_inspection->>'schemaVersion' <> 'visual-inspection-v1' then
    raise exception 'VISUAL_INSPECTION_INVALID';
  end if;

  select * into v_request
  from public.creature_transformation_requests
  where id = p_request_id and profile_id = p_profile_id
  for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  if v_request.operation <> 'GENERATE_UNLOCKED_TRANSFORMATION' or v_request.status <> 'SUCCEEDED' then
    return jsonb_build_object('outcome', 'CONFLICT');
  end if;

  update public.creature_transformation_requests
  set visual_inspection = p_visual_inspection,
      updated_at = timezone('utc', now())
  where id = v_request.id
  returning * into v_request;
  return jsonb_build_object('outcome', 'UPDATED', 'record', to_jsonb(v_request));
end;
$$;

create or replace function public.protect_creature_visual_version_immutability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.creature_id is distinct from old.creature_id
    or new.profile_id is distinct from old.profile_id
    or new.version_number is distinct from old.version_number
    or new.previous_version_id is distinct from old.previous_version_id
    or new.source_transformation_request_id is distinct from old.source_transformation_request_id
    or new.base_creature_key is distinct from old.base_creature_key
    or new.visual_trait_id is distinct from old.visual_trait_id
    or new.concept_name is distinct from old.concept_name
    or new.concept_snapshot is distinct from old.concept_snapshot
    or new.visual_inspection is distinct from old.visual_inspection
    or new.prompt_template_version is distinct from old.prompt_template_version
    or new.prompt_sha256 is distinct from old.prompt_sha256
    or new.asset_path is distinct from old.asset_path
    or new.asset_sha256 is distinct from old.asset_sha256
    or new.mime_type is distinct from old.mime_type
    or new.width is distinct from old.width
    or new.height is distinct from old.height
    or new.has_alpha is distinct from old.has_alpha
    or new.created_at is distinct from old.created_at then
    raise exception 'CREATURE_VISUAL_VERSION_IMMUTABLE';
  end if;
  if not ((old.status = 'ACTIVE' and new.status in ('SUPERSEDED', 'REVOKED'))
    or (old.status = 'SUPERSEDED' and new.status = 'ACTIVE')
    or (old.status = new.status)) then
    raise exception 'CREATURE_VISUAL_VERSION_STATE_CONFLICT';
  end if;
  return new;
end;
$$;

create or replace function public.adopt_creature_transformation(p_profile_id uuid, p_creature_id uuid, p_progress_track_id uuid, p_transformation_request_id uuid, p_expected_current_visual_version_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_track public.creature_visual_progress_tracks%rowtype; v_request public.creature_transformation_requests%rowtype; v_current public.creature_visual_versions%rowtype; v_version public.creature_visual_versions%rowtype; v_next_number integer;
begin
  select * into v_track from public.creature_visual_progress_tracks where id = p_progress_track_id and profile_id = p_profile_id and creature_id = p_creature_id for update; if not found then raise exception 'VISUAL_TRACK_NOT_FOUND'; end if;
  if v_track.status <> 'GENERATED' then raise exception 'VISUAL_GENERATION_NOT_ADOPTABLE'; end if; if v_track.generated_request_id is distinct from p_transformation_request_id then raise exception 'VISUAL_TRACK_STATE_CONFLICT'; end if;
  select * into v_request from public.creature_transformation_requests where id = p_transformation_request_id and profile_id = p_profile_id and creature_id = p_creature_id for update; if not found or v_request.status <> 'SUCCEEDED' or v_request.asset_readiness <> 'FINAL_ASSET' or v_request.result_path is null or v_request.result_sha256 is null or v_request.result_mime_type is null or v_request.result_width is null or v_request.result_height is null then raise exception 'VISUAL_GENERATION_NOT_ADOPTABLE'; end if;
  if exists (select 1 from public.creature_visual_versions where source_transformation_request_id = p_transformation_request_id) then raise exception 'CREATURE_VISUAL_ALREADY_ADOPTED'; end if;
  select * into v_current from public.creature_visual_versions where id = p_expected_current_visual_version_id and creature_id = p_creature_id and status = 'ACTIVE' for update; if not found or v_request.source_visual_version_id is distinct from p_expected_current_visual_version_id then raise exception 'CREATURE_VISUAL_VERSION_CONFLICT'; end if;
  select coalesce(max(version_number), 0) + 1 into v_next_number from public.creature_visual_versions where creature_id = p_creature_id; update public.creature_visual_versions set status = 'SUPERSEDED' where id = v_current.id;
  insert into public.creature_visual_versions(creature_id, profile_id, version_number, previous_version_id, source_transformation_request_id, base_creature_key, visual_trait_id, concept_name, concept_snapshot, visual_inspection, prompt_template_version, prompt_sha256, asset_path, asset_sha256, mime_type, width, height, has_alpha, display_asset_path, display_asset_sha256, display_mime_type, display_width, display_height, status, adopted_at) values (p_creature_id, p_profile_id, v_next_number, v_current.id, p_transformation_request_id, v_current.base_creature_key, v_track.visual_trait_id, coalesce(v_request.concept_snapshot->>'conceptName','Evoluzione visuale'), v_request.concept_snapshot, v_request.visual_inspection, v_request.prompt_template_version, v_request.prompt_sha256, v_request.result_path, v_request.result_sha256, v_request.result_mime_type, v_request.result_width, v_request.result_height, true, v_request.display_asset_path, v_request.display_asset_sha256, v_request.display_mime_type, v_request.display_width, v_request.display_height, 'ACTIVE', timezone('utc', now())) returning * into v_version;
  update public.player_creatures set current_visual_version_id = v_version.id where id = p_creature_id and current_visual_version_id = v_current.id; if not found then raise exception 'CREATURE_VISUAL_VERSION_CONFLICT'; end if;
  update public.creature_visual_progress_tracks set status = 'COMPLETED', completed_version_id = v_version.id, completed_at = timezone('utc', now()) where id = v_track.id; return to_jsonb(v_version);
end;
$$;

create or replace function public.promote_cleaned_creature_visual(p_visual_version_id uuid, p_asset_path text, p_asset_sha256 text, p_width integer, p_height integer, p_display_asset_path text default null, p_display_asset_sha256 text default null, p_display_mime_type text default null, p_display_width integer default null, p_display_height integer default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_current public.creature_visual_versions%rowtype; v_created public.creature_visual_versions%rowtype;
begin
  if p_asset_path !~ '^cleanup/[a-f0-9]{64}\.png$' or p_asset_sha256 !~ '^[a-f0-9]{64}$' or p_width <> 1024 or p_height <> 1536 or (p_display_asset_path is not null and (p_display_asset_path !~ '^display/[a-f0-9]{64}\.webp$' or p_display_asset_sha256 !~ '^[a-f0-9]{64}$' or p_display_mime_type <> 'image/webp' or p_display_width not between 1 and 768 or p_display_height not between 1 and 768)) then raise exception 'BACKGROUND_CLEANUP_CANDIDATE_INVALID'; end if;
  select v.* into v_current from public.creature_visual_versions v join public.player_creatures c on c.current_visual_version_id = v.id where v.id = p_visual_version_id and v.status = 'ACTIVE' for update of v; if not found then raise exception 'BACKGROUND_CLEANUP_VERSION_CONFLICT'; end if;
  update public.creature_visual_versions set status = 'SUPERSEDED' where id = v_current.id;
  insert into public.creature_visual_versions (creature_id, profile_id, version_number, previous_version_id, base_creature_key, visual_trait_id, concept_name, concept_snapshot, visual_inspection, prompt_template_version, prompt_sha256, asset_path, asset_sha256, mime_type, width, height, has_alpha, display_asset_path, display_asset_sha256, display_mime_type, display_width, display_height, status, adopted_at) values (v_current.creature_id, v_current.profile_id, v_current.version_number + 1, v_current.id, v_current.base_creature_key, v_current.visual_trait_id, v_current.concept_name, v_current.concept_snapshot, v_current.visual_inspection, v_current.prompt_template_version, v_current.prompt_sha256, p_asset_path, p_asset_sha256, 'image/png', p_width, p_height, true, p_display_asset_path, p_display_asset_sha256, p_display_mime_type, p_display_width, p_display_height, 'ACTIVE', timezone('utc', now())) returning * into v_created;
  update public.player_creatures set current_visual_version_id = v_created.id where id = v_current.creature_id and profile_id = v_current.profile_id;
  return to_jsonb(v_created);
end;
$$;

revoke all on function public.record_creature_transformation_visual_inspection(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.record_creature_transformation_visual_inspection(uuid, uuid, jsonb) to service_role;
notify pgrst, 'reload schema';
