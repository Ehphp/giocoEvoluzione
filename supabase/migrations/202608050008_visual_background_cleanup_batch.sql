-- Browser batch cleanup promotes a new immutable visual version. It never
-- overwrites legacy objects and is executable only by the Edge Function.

create or replace function public.promote_cleaned_creature_visual(
  p_visual_version_id uuid,
  p_asset_path text,
  p_asset_sha256 text,
  p_width integer,
  p_height integer
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_current public.creature_visual_versions%rowtype;
  v_created public.creature_visual_versions%rowtype;
begin
  if p_asset_path !~ '^cleanup/[a-f0-9]{64}\.png$'
    or p_asset_sha256 !~ '^[a-f0-9]{64}$'
    or p_width <> 1024 or p_height <> 1536 then
    raise exception 'BACKGROUND_CLEANUP_CANDIDATE_INVALID';
  end if;

  select v.* into v_current from public.creature_visual_versions v
  join public.player_creatures c on c.current_visual_version_id = v.id
  where v.id = p_visual_version_id and v.status = 'ACTIVE' for update of v;
  if not found then raise exception 'BACKGROUND_CLEANUP_VERSION_CONFLICT'; end if;

  update public.creature_visual_versions set status = 'SUPERSEDED' where id = v_current.id;

  insert into public.creature_visual_versions (
    creature_id, profile_id, version_number, previous_version_id, base_creature_key,
    visual_trait_id, concept_name, concept_snapshot, prompt_template_version,
    prompt_sha256, asset_path, asset_sha256, mime_type, width, height, has_alpha,
    status, adopted_at
  ) values (
    v_current.creature_id, v_current.profile_id, v_current.version_number + 1, v_current.id, v_current.base_creature_key,
    v_current.visual_trait_id, v_current.concept_name, v_current.concept_snapshot, v_current.prompt_template_version,
    v_current.prompt_sha256, p_asset_path, p_asset_sha256, 'image/png', p_width, p_height, true,
    'ACTIVE', timezone('utc', now())
  ) returning * into v_created;

  update public.player_creatures set current_visual_version_id = v_created.id
  where id = v_current.creature_id and profile_id = v_current.profile_id;

  return to_jsonb(v_created);
end;
$$;

revoke all on function public.promote_cleaned_creature_visual(uuid, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.promote_cleaned_creature_visual(uuid, text, text, integer, integer) to service_role;