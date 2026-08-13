-- ADMINISTRATIVE, DESTRUCTIVE, ONE-SHOT RESET OF CREATURE PROGRESSION.
--
-- Scope deliberately limited to player_creatures and the visual-transformation
-- workflow. It does not delete Storage objects and does not modify auth users,
-- profiles, games, match rewards, competitive ratings, or any game statistics.
--
-- Run only in a short maintenance window. ACCESS EXCLUSIVE locks make a
-- concurrent Edge Function wait until the reset has committed, so an old
-- request cannot race the reset into a newly adopted visual version.

begin;

lock table public.player_creatures,
           public.creature_visual_versions,
           public.creature_visual_progress_tracks,
           public.creature_transformation_requests,
           public.creature_evolution_target_progress
  in access exclusive mode;

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.creature_visual_base_asset_catalog
  where base_creature_key = 'VERDANT_HATCHLING';

  if v_count <> 1 then
    raise exception 'ADMIN_CREATURE_PROGRESSION_RESET_ABORTED: canonical VERDANT_HATCHLING base asset is missing';
  end if;
end;
$$;

-- Repair only the narrow invariant required by this reset: every existing
-- profile owns one creature. This does not create or change a profile/account.
insert into public.player_creatures (profile_id, base_creature_key)
select p.id, 'VERDANT_HATCHLING'
from public.profiles p
left join public.player_creatures c on c.profile_id = p.id
where c.id is null;

-- A legacy/corrupt row may have no v1. Create it from the canonical catalog.
-- BASE is intentional here: an existing active evolved version may still exist
-- until the normalization below, and the partial ACTIVE unique index permits it.
insert into public.creature_visual_versions (
  creature_id, profile_id, version_number, base_creature_key, asset_path,
  asset_sha256, mime_type, width, height, has_alpha, status
)
select c.id, c.profile_id, 1, 'VERDANT_HATCHLING', a.asset_path,
       a.asset_sha256, a.mime_type, a.width, a.height, a.has_alpha, 'BASE'
from public.player_creatures c
join public.creature_visual_base_asset_catalog a
  on a.base_creature_key = 'VERDANT_HATCHLING'
where not exists (
  select 1
  from public.creature_visual_versions v
  where v.creature_id = c.id and v.version_number = 1
);

-- The normal immutable-version trigger intentionally disallows
-- SUPERSEDED -> REVOKED and BASE -> ACTIVE. Temporarily disable exactly that
-- trigger inside this transaction; the DDL is transactional and it is enabled
-- again before commit. No permanent transition rule is weakened.
alter table public.creature_visual_versions
  disable trigger creature_visual_versions_immutable;

-- First remove every active evolved visual, avoiding the one-ACTIVE partial
-- unique index while v1 is reactivated. Historical rows and their Storage
-- references are retained, but are permanently outside the active lineage.
update public.creature_visual_versions
set status = 'REVOKED',
    revoked_at = coalesce(revoked_at, timezone('utc', now()))
where version_number <> 1
  and status is distinct from 'REVOKED';

-- Make v1 an exact copy of the canonical base manifest. This also clears any
-- accidental lineage metadata on a legacy v1 without deleting its row or asset.
update public.creature_visual_versions v
set previous_version_id = null,
    source_transformation_request_id = null,
    base_creature_key = 'VERDANT_HATCHLING',
    visual_trait_id = null,
    evolution_target_id = null,
    evolution_function = null,
    mutation_archetype = null,
    primary_body_area = null,
    supporting_body_areas = null,
    concept_name = null,
    concept_snapshot = null,
    prompt_template_version = null,
    prompt_sha256 = null,
    asset_path = a.asset_path,
    asset_sha256 = a.asset_sha256,
    mime_type = a.mime_type,
    width = a.width,
    height = a.height,
    has_alpha = a.has_alpha,
    display_asset_path = null,
    display_asset_sha256 = null,
    display_mime_type = null,
    display_width = null,
    display_height = null,
    status = 'ACTIVE',
    adopted_at = timezone('utc', now()),
    revoked_at = null
from public.creature_visual_base_asset_catalog a
where v.version_number = 1
  and a.base_creature_key = 'VERDANT_HATCHLING';

alter table public.creature_visual_versions
  enable trigger creature_visual_versions_immutable;

-- Creature gameplay progression and the official visual pointer now return to
-- their canonical first state. player_creatures_set_updated_at remains active.
update public.player_creatures c
set base_creature_key = 'VERDANT_HATCHLING',
    level = 1,
    experience = 0,
    progression_state = '{}'::jsonb,
    current_visual_version_id = v.id
from public.creature_visual_versions v
where v.creature_id = c.id
  and v.version_number = 1
  and v.status = 'ACTIVE';

-- Target counters are creature progression, not ranking/statistics. Keep their
-- event ledger for audit/history, but remove every accumulated win balance.
update public.creature_evolution_target_progress
set wins = 0,
    updated_at = timezone('utc', now())
where wins <> 0;

-- Every nonterminal visual workflow is closed. Completed tracks are historical
-- evidence and intentionally remain completed; all open states become terminal.
update public.creature_visual_progress_tracks
set status = 'CANCELLED',
    cancelled_at = coalesce(cancelled_at, timezone('utc', now()))
where status in ('ACTIVE', 'READY', 'GENERATING', 'POST_PROCESSING', 'GENERATED');

-- The actual request-state enum is RESERVED/RUNNING/SUCCEEDED/FAILED. Open
-- requests become FAILED with an explicit administrative reason. SUCCEEDED
-- requests remain immutable audit records, but their cancelled track prevents
-- any old result from being finalized or adopted after this transaction.
update public.creature_transformation_requests
set status = 'FAILED',
    error_code = 'ADMIN_CREATURE_PROGRESSION_RESET',
    error_message = 'Richiesta annullata dal reset amministrativo della progressione creature.',
    completed_at = coalesce(completed_at, timezone('utc', now()))
where status in ('RESERVED', 'RUNNING');

-- Fail closed rather than commit a partial reset. These assertions double as
-- post-reset verification of the persisted model and real state names.
do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.profiles p
  left join public.player_creatures c on c.profile_id = p.id
  left join public.creature_visual_versions v
    on v.id = c.current_visual_version_id
  left join public.creature_visual_base_asset_catalog a
    on a.base_creature_key = 'VERDANT_HATCHLING'
  where c.id is null
     or c.base_creature_key <> 'VERDANT_HATCHLING'
     or c.level <> 1
     or c.experience <> 0
     or c.progression_state <> '{}'::jsonb
     or v.id is null
     or v.version_number <> 1
     or v.status <> 'ACTIVE'
     or v.base_creature_key <> 'VERDANT_HATCHLING'
     or v.asset_path <> a.asset_path
     or v.asset_sha256 <> a.asset_sha256
     or v.mime_type <> a.mime_type
     or v.width <> a.width
     or v.height <> a.height
     or v.has_alpha <> a.has_alpha;
  if v_count <> 0 then
    raise exception 'ADMIN_CREATURE_PROGRESSION_RESET_ABORTED: % creatures are not canonical v1', v_count;
  end if;

  select count(*) into v_count
  from (
    select creature_id
    from public.creature_visual_versions
    group by creature_id
    having count(*) filter (where status = 'ACTIVE') <> 1
  ) invalid_active_versions;
  if v_count <> 0 then
    raise exception 'ADMIN_CREATURE_PROGRESSION_RESET_ABORTED: % creatures do not have exactly one ACTIVE visual version', v_count;
  end if;

  select count(*) into v_count
  from public.creature_visual_versions
  where version_number <> 1 and status <> 'REVOKED';
  if v_count <> 0 then
    raise exception 'ADMIN_CREATURE_PROGRESSION_RESET_ABORTED: % evolved visual versions remain usable', v_count;
  end if;

  select count(*) into v_count
  from public.creature_visual_progress_tracks
  where status in ('ACTIVE', 'READY', 'GENERATING', 'POST_PROCESSING', 'GENERATED');
  if v_count <> 0 then
    raise exception 'ADMIN_CREATURE_PROGRESSION_RESET_ABORTED: % visual tracks remain open', v_count;
  end if;

  select count(*) into v_count
  from public.creature_transformation_requests
  where status in ('RESERVED', 'RUNNING');
  if v_count <> 0 then
    raise exception 'ADMIN_CREATURE_PROGRESSION_RESET_ABORTED: % transformation requests remain open', v_count;
  end if;

  select count(*) into v_count
  from public.creature_evolution_target_progress
  where wins <> 0;
  if v_count <> 0 then
    raise exception 'ADMIN_CREATURE_PROGRESSION_RESET_ABORTED: % evolution target balances remain', v_count;
  end if;
end;
$$;

commit;
