-- Target-based visual evolution keeps existing trait-only tracks and versions valid.

alter table public.creature_visual_progress_tracks
  add column if not exists evolution_target_id text;
alter table public.creature_visual_progress_tracks
  alter column visual_trait_id drop not null;
alter table public.creature_visual_progress_tracks
  drop constraint if exists creature_visual_progress_tracks_selection_check;
alter table public.creature_visual_progress_tracks
  add constraint creature_visual_progress_tracks_selection_check check (
    (evolution_target_id is null and visual_trait_id is not null)
    or evolution_target_id in ('TAIL','FORELIMBS','HIND_LIMBS','HEAD_AND_SENSES','TORSO_AND_BACK','SKIN')
  );

alter table public.creature_transformation_requests
  add column if not exists evolution_target_id text,
  add column if not exists evolution_function text,
  add column if not exists mutation_archetype text,
  add column if not exists primary_body_area text,
  add column if not exists supporting_body_areas jsonb;

alter table public.creature_visual_versions
  add column if not exists evolution_target_id text,
  add column if not exists evolution_function text,
  add column if not exists mutation_archetype text,
  add column if not exists primary_body_area text,
  add column if not exists supporting_body_areas jsonb;

create or replace function public.sync_creature_transformation_anatomy_metadata()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.concept_snapshot is not null and jsonb_typeof(new.concept_snapshot) = 'object' then
    new.evolution_target_id := nullif(new.concept_snapshot->>'evolutionTargetId', '');
    new.evolution_function := nullif(new.concept_snapshot->>'evolutionFunction', '');
    new.mutation_archetype := nullif(new.concept_snapshot#>>'{primaryMutation,mutationArchetype}', '');
    new.primary_body_area := nullif(new.concept_snapshot#>>'{primaryMutation,bodyAreas,0}', '');
    new.supporting_body_areas := coalesce(new.concept_snapshot#>'{primaryMutation,supportingBodyAreas}', '[]'::jsonb);
  end if;
  return new;
end;
$$;

drop trigger if exists creature_transformation_requests_sync_anatomy_metadata on public.creature_transformation_requests;
create trigger creature_transformation_requests_sync_anatomy_metadata
before insert or update of concept_snapshot on public.creature_transformation_requests
for each row execute function public.sync_creature_transformation_anatomy_metadata();

create or replace function public.select_creature_visual_progress_track(
  p_profile_id uuid, p_creature_id uuid, p_visual_trait_id text, p_evolution_target_id text, p_target integer
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_track public.creature_visual_progress_tracks%rowtype;
begin
  if p_target < 1 or p_target > 100 then raise exception 'VISUAL_TRACK_STATE_CONFLICT'; end if;
  if (p_visual_trait_id is null and p_evolution_target_id is null) or (p_visual_trait_id is not null and p_evolution_target_id is not null) then raise exception 'VISUAL_TRACK_STATE_CONFLICT'; end if;
  if p_visual_trait_id is not null and p_visual_trait_id not in ('IMPACT_ADAPTATION','LOCOMOTION_ADAPTATION','SENSORY_EXPANSION','ENERGY_REGULATION','AQUATIC_MORPHOLOGY') then raise exception 'VISUAL_TRAIT_INVALID'; end if;
  if p_evolution_target_id is not null and p_evolution_target_id not in ('TAIL','FORELIMBS','HIND_LIMBS','HEAD_AND_SENSES','TORSO_AND_BACK','SKIN') then raise exception 'EVOLUTION_TARGET_INVALID'; end if;
  if not exists (select 1 from public.player_creatures where id = p_creature_id and profile_id = p_profile_id) then raise exception 'CREATURE_NOT_OWNED'; end if;
  perform pg_advisory_xact_lock(hashtextextended('visual-track:' || p_creature_id::text, 0));
  if exists (select 1 from public.creature_visual_progress_tracks where creature_id = p_creature_id and status in ('ACTIVE','READY','GENERATING','POST_PROCESSING','GENERATED')) then raise exception 'VISUAL_TRACK_ALREADY_ACTIVE'; end if;
  insert into public.creature_visual_progress_tracks(profile_id, creature_id, visual_trait_id, evolution_target_id, status, target)
  values (p_profile_id, p_creature_id, p_visual_trait_id, p_evolution_target_id, 'ACTIVE', p_target)
  returning * into v_track;
  return to_jsonb(v_track);
end;
$$;

create or replace function public.resolve_creature_visual_progress_track_trait(
  p_profile_id uuid, p_creature_id uuid, p_track_id uuid, p_visual_trait_id text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_track public.creature_visual_progress_tracks%rowtype;
begin
  if p_visual_trait_id not in ('IMPACT_ADAPTATION','LOCOMOTION_ADAPTATION','SENSORY_EXPANSION','ENERGY_REGULATION','AQUATIC_MORPHOLOGY') then raise exception 'VISUAL_TRAIT_INVALID'; end if;
  select * into v_track from public.creature_visual_progress_tracks where id = p_track_id and profile_id = p_profile_id and creature_id = p_creature_id for update;
  if not found then raise exception 'VISUAL_TRACK_NOT_FOUND'; end if;
  if v_track.status <> 'READY' then raise exception 'VISUAL_TRACK_NOT_READY'; end if;
  if v_track.evolution_target_id = 'TAIL' and p_visual_trait_id not in ('LOCOMOTION_ADAPTATION','AQUATIC_MORPHOLOGY') then raise exception 'VISUAL_TRAIT_INVALID'; end if;
  if v_track.evolution_target_id in ('FORELIMBS') and p_visual_trait_id not in ('IMPACT_ADAPTATION','LOCOMOTION_ADAPTATION','AQUATIC_MORPHOLOGY') then raise exception 'VISUAL_TRAIT_INVALID'; end if;
  if v_track.evolution_target_id = 'HIND_LIMBS' and p_visual_trait_id not in ('LOCOMOTION_ADAPTATION','AQUATIC_MORPHOLOGY') then raise exception 'VISUAL_TRAIT_INVALID'; end if;
  if v_track.evolution_target_id = 'HEAD_AND_SENSES' and p_visual_trait_id <> 'SENSORY_EXPANSION' then raise exception 'VISUAL_TRAIT_INVALID'; end if;
  if v_track.evolution_target_id = 'TORSO_AND_BACK' and p_visual_trait_id not in ('IMPACT_ADAPTATION','ENERGY_REGULATION') then raise exception 'VISUAL_TRAIT_INVALID'; end if;
  update public.creature_visual_progress_tracks set visual_trait_id = p_visual_trait_id where id = v_track.id returning * into v_track;
  return to_jsonb(v_track);
end;
$$;

create or replace function public.adopt_creature_transformation(
  p_profile_id uuid, p_creature_id uuid, p_progress_track_id uuid, p_transformation_request_id uuid, p_expected_current_visual_version_id uuid
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_track public.creature_visual_progress_tracks%rowtype; v_request public.creature_transformation_requests%rowtype;
  v_current public.creature_visual_versions%rowtype; v_version public.creature_visual_versions%rowtype; v_next_number integer;
begin
  select * into v_track from public.creature_visual_progress_tracks where id = p_progress_track_id and profile_id = p_profile_id and creature_id = p_creature_id for update;
  if not found then raise exception 'VISUAL_TRACK_NOT_FOUND'; end if;
  if v_track.status <> 'GENERATED' then raise exception 'VISUAL_GENERATION_NOT_ADOPTABLE'; end if;
  if v_track.generated_request_id is distinct from p_transformation_request_id then raise exception 'VISUAL_TRACK_STATE_CONFLICT'; end if;
  if v_track.visual_trait_id is null then raise exception 'VISUAL_TRACK_STATE_CONFLICT'; end if;
  select * into v_request from public.creature_transformation_requests where id = p_transformation_request_id and profile_id = p_profile_id and creature_id = p_creature_id for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  if v_request.status <> 'SUCCEEDED' or v_request.asset_readiness <> 'FINAL_ASSET' or v_request.result_path is null or v_request.result_sha256 is null or v_request.result_mime_type is null or v_request.result_width is null or v_request.result_height is null then raise exception 'VISUAL_GENERATION_NOT_ADOPTABLE'; end if;
  if exists (select 1 from public.creature_visual_versions where source_transformation_request_id = p_transformation_request_id) then raise exception 'CREATURE_VISUAL_ALREADY_ADOPTED'; end if;
  select * into v_current from public.creature_visual_versions where id = p_expected_current_visual_version_id and creature_id = p_creature_id and status = 'ACTIVE' for update;
  if not found or v_request.source_visual_version_id is distinct from p_expected_current_visual_version_id then raise exception 'CREATURE_VISUAL_VERSION_CONFLICT'; end if;
  select coalesce(max(version_number), 0) + 1 into v_next_number from public.creature_visual_versions where creature_id = p_creature_id;
  update public.creature_visual_versions set status = 'SUPERSEDED' where id = v_current.id;
  insert into public.creature_visual_versions(creature_id, profile_id, version_number, previous_version_id, source_transformation_request_id, base_creature_key, visual_trait_id, evolution_target_id, evolution_function, mutation_archetype, primary_body_area, supporting_body_areas, concept_name, concept_snapshot, prompt_template_version, prompt_sha256, asset_path, asset_sha256, mime_type, width, height, has_alpha, status, adopted_at)
  values (p_creature_id, p_profile_id, v_next_number, v_current.id, p_transformation_request_id, v_current.base_creature_key, v_track.visual_trait_id, v_request.evolution_target_id, v_request.evolution_function, v_request.mutation_archetype, v_request.primary_body_area, v_request.supporting_body_areas, coalesce(v_request.concept_snapshot->>'conceptName','Evoluzione visuale'), v_request.concept_snapshot, v_request.prompt_template_version, v_request.prompt_sha256, v_request.result_path, v_request.result_sha256, v_request.result_mime_type, v_request.result_width, v_request.result_height, true, 'ACTIVE', timezone('utc', now())) returning * into v_version;
  update public.player_creatures set current_visual_version_id = v_version.id where id = p_creature_id and current_visual_version_id = v_current.id;
  if not found then raise exception 'CREATURE_VISUAL_VERSION_CONFLICT'; end if;
  update public.creature_visual_progress_tracks set status = 'COMPLETED', completed_version_id = v_version.id, completed_at = timezone('utc', now()) where id = v_track.id;
  return to_jsonb(v_version);
end;
$$;

revoke all on function public.select_creature_visual_progress_track(uuid, uuid, text, text, integer) from public, anon, authenticated;
grant execute on function public.select_creature_visual_progress_track(uuid, uuid, text, text, integer) to service_role;
revoke all on function public.resolve_creature_visual_progress_track_trait(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.resolve_creature_visual_progress_track_trait(uuid, uuid, uuid, text) to service_role;