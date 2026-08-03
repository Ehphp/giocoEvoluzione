-- Add precise chromatic review outcomes without invalidating historic PALETTE_CHANGED observations.
-- Concept snapshots remain schema-v1 JSONB and do not require data migration: absent colorEvolution means PRESERVE.

alter table public.creature_transformation_experiment_reviews
  drop constraint if exists creature_transformation_experiment_reviews_issue_flags_check;

alter table public.creature_transformation_experiment_reviews
  add constraint creature_transformation_experiment_reviews_issue_flags_check check (
    issue_flags <@ array[
      'IDENTITY_LOST','FACE_CHANGED','EYES_CHANGED','POSE_CHANGED','SILHOUETTE_CHANGED','PALETTE_CHANGED',
      'UNREQUESTED_PALETTE_CHANGE','COLOR_EVOLUTION_TOO_WEAK','COLOR_EVOLUTION_INCOHERENT',
      'TRAIT_NOT_VISIBLE','TRAIT_TOO_STRONG','TRAIT_TOO_WEAK','ANATOMY_DEFORMED','EXTRA_LIMBS',
      'UNREQUESTED_OBJECT','BACKGROUND_INTRODUCED','STYLE_DRIFT','LOW_IMAGE_QUALITY','ALPHA_MISSING','CANVAS_INCORRECT'
    ]::text[]
  );

create or replace function public.upsert_creature_transformation_experiment_review(
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
  if p_issue_flags is null or not (p_issue_flags <@ array['IDENTITY_LOST','FACE_CHANGED','EYES_CHANGED','POSE_CHANGED','SILHOUETTE_CHANGED','PALETTE_CHANGED','UNREQUESTED_PALETTE_CHANGE','COLOR_EVOLUTION_TOO_WEAK','COLOR_EVOLUTION_INCOHERENT','TRAIT_NOT_VISIBLE','TRAIT_TOO_STRONG','TRAIT_TOO_WEAK','ANATOMY_DEFORMED','EXTRA_LIMBS','UNREQUESTED_OBJECT','BACKGROUND_INTRODUCED','STYLE_DRIFT','LOW_IMAGE_QUALITY','ALPHA_MISSING','CANVAS_INCORRECT']::text[]) then raise exception 'invalid review issue flags'; end if;
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
