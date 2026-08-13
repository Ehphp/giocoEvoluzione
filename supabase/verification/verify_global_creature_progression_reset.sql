-- Run this query before and after the administrative reset.
-- Compare the protected_entity checksum rows: they must be identical. The
-- reset_verification rows must all report violations = 0 after the reset.
-- No Storage listing/deletion is performed here.

with protected_entity as (
  select 'auth.users'::text as entity, count(*)::bigint as rows,
         md5(coalesce(string_agg(md5(to_jsonb(u)::text), ',' order by u.id::text), '')) as checksum
  from auth.users u
  union all
  select 'public.profiles', count(*)::bigint,
         md5(coalesce(string_agg(md5(to_jsonb(p)::text), ',' order by p.id::text), ''))
  from public.profiles p
  union all
  select 'public.games', count(*)::bigint,
         md5(coalesce(string_agg(md5(to_jsonb(g)::text), ',' order by g.id::text), ''))
  from public.games g
  union all
  select 'public.players', count(*)::bigint,
         md5(coalesce(string_agg(md5(to_jsonb(p)::text), ',' order by p.id), ''))
  from public.players p
  union all
  select 'public.match_rewards', count(*)::bigint,
         md5(coalesce(string_agg(md5(to_jsonb(r)::text), ',' order by r.id::text), ''))
  from public.match_rewards r
  union all
  select 'public.competitive_rating_events', count(*)::bigint,
         md5(coalesce(string_agg(md5(to_jsonb(e)::text), ',' order by e.game_id::text, e.profile_id::text), ''))
  from public.competitive_rating_events e
), reset_verification as (
  select 'creatures_not_at_canonical_initial_state'::text as check_name, count(*)::bigint as violations
  from public.profiles p
  left join public.player_creatures c on c.profile_id = p.id
  left join public.creature_visual_versions v on v.id = c.current_visual_version_id
  left join public.creature_visual_base_asset_catalog a on a.base_creature_key = 'VERDANT_HATCHLING'
  where c.id is null
     or c.base_creature_key <> 'VERDANT_HATCHLING'
     or c.level <> 1
     or c.experience <> 0
     or c.progression_state <> '{}'::jsonb
     or v.version_number <> 1
     or v.status <> 'ACTIVE'
     or v.base_creature_key <> 'VERDANT_HATCHLING'
     or v.asset_path <> a.asset_path
     or v.asset_sha256 <> a.asset_sha256
     or v.mime_type <> a.mime_type
     or v.width <> a.width
     or v.height <> a.height
     or v.has_alpha <> a.has_alpha
  union all
  select 'creatures_without_exactly_one_active_version', count(*)::bigint
  from (
    select creature_id
    from public.creature_visual_versions
    group by creature_id
    having count(*) filter (where status = 'ACTIVE') <> 1
  ) v
  union all
  select 'evolved_versions_not_revoked', count(*)::bigint
  from public.creature_visual_versions
  where version_number <> 1 and status <> 'REVOKED'
  union all
  select 'open_visual_tracks', count(*)::bigint
  from public.creature_visual_progress_tracks
  where status in ('ACTIVE', 'READY', 'GENERATING', 'POST_PROCESSING', 'GENERATED')
  union all
  select 'open_transformation_requests', count(*)::bigint
  from public.creature_transformation_requests
  where status in ('RESERVED', 'RUNNING')
  union all
  select 'nonzero_evolution_target_balances', count(*)::bigint
  from public.creature_evolution_target_progress
  where wins <> 0
)
select 'protected_entity'::text as result_type, entity as name, rows, checksum, null::bigint as violations
from protected_entity
union all
select 'reset_verification', check_name, null::bigint, null::text, violations
from reset_verification
order by result_type, name;
