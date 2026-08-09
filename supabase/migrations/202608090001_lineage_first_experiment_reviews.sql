-- Admin-only A/B evidence for the lineage-first pilot.  It deliberately has no
-- foreign key or RPC that can create creature_visual_versions.
create table public.creature_transformation_lineage_comparison_reviews (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  creature_id uuid not null references public.player_creatures(id) on delete cascade,
  lineage_request_id uuid not null references public.creature_transformation_requests(id) on delete cascade,
  current_request_id uuid references public.creature_transformation_requests(id) on delete set null,
  creative_surprise_score smallint not null check (creative_surprise_score between 1 and 5),
  target_transformation_strength_score smallint not null check (target_transformation_strength_score between 1 and 5),
  creature_continuity_score smallint not null check (creature_continuity_score between 1 and 5),
  lineage_preservation_score smallint not null check (lineage_preservation_score between 1 and 5),
  non_target_stability_score smallint not null check (non_target_stability_score between 1 and 5),
  preferred_result text not null check (preferred_result in ('CURRENT', 'LINEAGE_FIRST', 'NONE')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (profile_id, lineage_request_id)
);

alter table public.creature_transformation_lineage_comparison_reviews enable row level security;
revoke all on table public.creature_transformation_lineage_comparison_reviews from public, anon, authenticated;
grant all on table public.creature_transformation_lineage_comparison_reviews to service_role;

create function public.upsert_creature_transformation_lineage_comparison_review(
  p_profile_id uuid, p_creature_id uuid, p_lineage_request_id uuid, p_current_request_id uuid,
  p_creative_surprise_score smallint, p_target_transformation_strength_score smallint,
  p_creature_continuity_score smallint, p_lineage_preservation_score smallint,
  p_non_target_stability_score smallint, p_preferred_result text
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from creature_transformation_requests where id = p_lineage_request_id and profile_id = p_profile_id and creature_id = p_creature_id and status = 'SUCCEEDED' and asset_readiness = 'EXPERIMENT_ONLY') then raise exception 'lineage experiment is not reviewable'; end if;
  if p_current_request_id is not null and not exists (select 1 from creature_transformation_requests where id = p_current_request_id and profile_id = p_profile_id and creature_id = p_creature_id) then raise exception 'current comparison request is invalid'; end if;
  insert into creature_transformation_lineage_comparison_reviews (profile_id, creature_id, lineage_request_id, current_request_id, creative_surprise_score, target_transformation_strength_score, creature_continuity_score, lineage_preservation_score, non_target_stability_score, preferred_result)
  values (p_profile_id, p_creature_id, p_lineage_request_id, p_current_request_id, p_creative_surprise_score, p_target_transformation_strength_score, p_creature_continuity_score, p_lineage_preservation_score, p_non_target_stability_score, p_preferred_result)
  on conflict (profile_id, lineage_request_id) do update set current_request_id = excluded.current_request_id, creative_surprise_score = excluded.creative_surprise_score, target_transformation_strength_score = excluded.target_transformation_strength_score, creature_continuity_score = excluded.creature_continuity_score, lineage_preservation_score = excluded.lineage_preservation_score, non_target_stability_score = excluded.non_target_stability_score, preferred_result = excluded.preferred_result, updated_at = timezone('utc', now());
end;
$$;
revoke all on function public.upsert_creature_transformation_lineage_comparison_review(uuid, uuid, uuid, uuid, smallint, smallint, smallint, smallint, smallint, text) from public, anon, authenticated;
grant execute on function public.upsert_creature_transformation_lineage_comparison_review(uuid, uuid, uuid, uuid, smallint, smallint, smallint, smallint, smallint, text) to service_role;
