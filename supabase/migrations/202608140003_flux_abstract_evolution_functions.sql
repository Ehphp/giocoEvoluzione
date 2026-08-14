-- Flux now persists a neutral trait for newly resolved directions. Historical trait and
-- function ids remain readable so existing visual versions and lineage are never rewritten.

begin;

create or replace function public.resolve_creature_visual_progress_track_trait(
  p_profile_id uuid, p_creature_id uuid, p_track_id uuid, p_visual_trait_id text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_track public.creature_visual_progress_tracks%rowtype;
begin
  if p_visual_trait_id not in ('ANATOMICAL_EVOLUTION','IMPACT_ADAPTATION','LOCOMOTION_ADAPTATION','SENSORY_EXPANSION','ENERGY_REGULATION','AQUATIC_MORPHOLOGY') then raise exception 'VISUAL_TRAIT_INVALID'; end if;
  select * into v_track from public.creature_visual_progress_tracks where id = p_track_id and profile_id = p_profile_id and creature_id = p_creature_id for update;
  if not found then raise exception 'VISUAL_TRACK_NOT_FOUND'; end if;
  if v_track.status <> 'READY' then raise exception 'VISUAL_TRACK_NOT_READY'; end if;
  -- New FLUX plans carry the neutral trait. Legacy traits stay accepted for tracks created
  -- before this taxonomy change, with their former target validation preserved below.
  if p_visual_trait_id = 'ANATOMICAL_EVOLUTION' then
    update public.creature_visual_progress_tracks set visual_trait_id = p_visual_trait_id where id = v_track.id returning * into v_track;
    return to_jsonb(v_track);
  end if;
  if v_track.evolution_target_id = 'TAIL' and p_visual_trait_id not in ('LOCOMOTION_ADAPTATION','AQUATIC_MORPHOLOGY') then raise exception 'VISUAL_TRAIT_INVALID'; end if;
  if v_track.evolution_target_id = 'LIMBS_AND_FEET' and p_visual_trait_id not in ('LOCOMOTION_ADAPTATION','IMPACT_ADAPTATION','AQUATIC_MORPHOLOGY') then raise exception 'VISUAL_TRAIT_INVALID'; end if;
  if v_track.evolution_target_id = 'HEAD_AND_CROWN' and p_visual_trait_id <> 'SENSORY_EXPANSION' then raise exception 'VISUAL_TRAIT_INVALID'; end if;
  if v_track.evolution_target_id in ('BODY_SHAPE','DORSAL_STRUCTURES') and p_visual_trait_id not in ('IMPACT_ADAPTATION','ENERGY_REGULATION') then raise exception 'VISUAL_TRAIT_INVALID'; end if;
  if v_track.evolution_target_id = 'WINGS' and p_visual_trait_id not in ('LOCOMOTION_ADAPTATION','IMPACT_ADAPTATION') then raise exception 'VISUAL_TRAIT_INVALID'; end if;
  if v_track.evolution_target_id = 'TENTACLES' and p_visual_trait_id not in ('LOCOMOTION_ADAPTATION','AQUATIC_MORPHOLOGY') then raise exception 'VISUAL_TRAIT_INVALID'; end if;
  update public.creature_visual_progress_tracks set visual_trait_id = p_visual_trait_id where id = v_track.id returning * into v_track;
  return to_jsonb(v_track);
end;
$$;

commit;
