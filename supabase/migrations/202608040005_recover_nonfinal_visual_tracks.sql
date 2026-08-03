-- A pre-background-removal request could leave a visual track GENERATED even
-- though the persisted request is experiment-only. It must never be adopted;
-- restore the owner to READY so they can explicitly start a fresh generation.
create or replace function public.restore_nonfinal_creature_visual_generation(
  p_profile_id uuid, p_track_id uuid, p_request_id uuid
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_track public.creature_visual_progress_tracks%rowtype; v_request public.creature_transformation_requests%rowtype;
begin
  select * into v_track from public.creature_visual_progress_tracks where id = p_track_id and profile_id = p_profile_id for update;
  if not found then raise exception 'VISUAL_TRACK_NOT_FOUND'; end if;
  if v_track.status = 'READY' and v_track.generated_request_id is null then return to_jsonb(v_track); end if;
  if v_track.status <> 'GENERATED' or v_track.generated_request_id is distinct from p_request_id then raise exception 'VISUAL_TRACK_STATE_CONFLICT'; end if;
  select * into v_request from public.creature_transformation_requests where id = p_request_id and profile_id = p_profile_id for update;
  if not found or v_request.visual_progress_track_id is distinct from v_track.id or v_request.asset_readiness = 'FINAL_ASSET' then
    raise exception 'VISUAL_TRACK_STATE_CONFLICT';
  end if;
  update public.creature_visual_progress_tracks set status = 'READY', generated_request_id = null where id = v_track.id returning * into v_track;
  return to_jsonb(v_track);
end;
$$;

revoke all on function public.restore_nonfinal_creature_visual_generation(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.restore_nonfinal_creature_visual_generation(uuid, uuid, uuid) to service_role;
