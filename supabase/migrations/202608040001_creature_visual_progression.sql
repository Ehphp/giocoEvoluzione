-- Fase 7: versioni visuali ufficiali e progressione separata dal gameplay.
-- Tutte le mutazioni persistenti sono riservate al server (service_role/RPC).

create table if not exists public.creature_visual_versions (
  id uuid primary key default gen_random_uuid(),
  creature_id uuid not null references public.player_creatures(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  version_number integer not null check (version_number >= 1),
  previous_version_id uuid references public.creature_visual_versions(id) on delete restrict,
  source_transformation_request_id uuid unique references public.creature_transformation_requests(id) on delete restrict,
  base_creature_key text not null,
  visual_trait_id text,
  concept_name text,
  concept_snapshot jsonb check (concept_snapshot is null or jsonb_typeof(concept_snapshot) = 'object'),
  prompt_template_version text,
  prompt_sha256 text check (prompt_sha256 is null or prompt_sha256 ~ '^[a-f0-9]{64}$'),
  asset_path text not null check (char_length(btrim(asset_path)) between 1 and 512),
  asset_sha256 text not null check (asset_sha256 ~ '^[a-f0-9]{64}$'),
  mime_type text not null check (mime_type = 'image/png'),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  has_alpha boolean not null,
  status text not null check (status in ('BASE', 'ACTIVE', 'SUPERSEDED', 'REVOKED')),
  created_at timestamptz not null default timezone('utc', now()),
  adopted_at timestamptz,
  revoked_at timestamptz,
  unique (creature_id, version_number)
);

create unique index if not exists creature_visual_versions_one_active_per_creature_idx
  on public.creature_visual_versions (creature_id) where status = 'ACTIVE';
create index if not exists creature_visual_versions_creature_history_idx
  on public.creature_visual_versions (creature_id, version_number desc);

alter table public.player_creatures
  add column if not exists current_visual_version_id uuid;

alter table public.player_creatures
  drop constraint if exists player_creatures_current_visual_version_id_fkey;
alter table public.player_creatures
  add constraint player_creatures_current_visual_version_id_fkey
  foreign key (current_visual_version_id) references public.creature_visual_versions(id) on delete restrict;

-- Canonical source manifest. The remote seed must upload this exact PNG to the
-- private source bucket before (or immediately after) applying the migration.
create table if not exists public.creature_visual_base_asset_catalog (
  base_creature_key text primary key,
  asset_path text not null,
  asset_sha256 text not null check (asset_sha256 ~ '^[a-f0-9]{64}$'),
  mime_type text not null check (mime_type = 'image/png'),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  has_alpha boolean not null
);

insert into public.creature_visual_base_asset_catalog (
  base_creature_key, asset_path, asset_sha256, mime_type, width, height, has_alpha
) values (
  'VERDANT_HATCHLING', 'verdant-hatchling-v1.png',
  '768a79a14109c0c4a893275492fdac063a4be37346f745c6207c45baecf82d9d',
  'image/png', 1024, 1536, true
) on conflict (base_creature_key) do update set
  asset_path = excluded.asset_path,
  asset_sha256 = excluded.asset_sha256,
  mime_type = excluded.mime_type,
  width = excluded.width,
  height = excluded.height,
  has_alpha = excluded.has_alpha;

-- Repeatable backfill: it is safe on an empty database and never duplicates a
-- base version. It references the shared seed object; no PNG is copied per user.
insert into public.creature_visual_versions (
  creature_id, profile_id, version_number, base_creature_key, asset_path,
  asset_sha256, mime_type, width, height, has_alpha, status, adopted_at
)
select c.id, c.profile_id, 1, c.base_creature_key, a.asset_path,
  a.asset_sha256, a.mime_type, a.width, a.height, a.has_alpha, 'ACTIVE', timezone('utc', now())
from public.player_creatures c
join public.creature_visual_base_asset_catalog a on a.base_creature_key = c.base_creature_key
where c.current_visual_version_id is null
  and not exists (select 1 from public.creature_visual_versions v where v.creature_id = c.id and v.version_number = 1);

update public.player_creatures c
set current_visual_version_id = v.id
from public.creature_visual_versions v
where v.creature_id = c.id
  and v.status = 'ACTIVE'
  and c.current_visual_version_id is null;

create or replace function public.backfill_creature_visual_base_versions()
returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.creature_visual_versions (
    creature_id, profile_id, version_number, base_creature_key, asset_path,
    asset_sha256, mime_type, width, height, has_alpha, status, adopted_at
  )
  select c.id, c.profile_id, 1, c.base_creature_key, a.asset_path,
    a.asset_sha256, a.mime_type, a.width, a.height, a.has_alpha, 'ACTIVE', timezone('utc', now())
  from public.player_creatures c
  join public.creature_visual_base_asset_catalog a on a.base_creature_key = c.base_creature_key
  where c.current_visual_version_id is null
    and not exists (select 1 from public.creature_visual_versions v where v.creature_id = c.id and v.version_number = 1);

  update public.player_creatures c
  set current_visual_version_id = v.id
  from public.creature_visual_versions v
  where v.creature_id = c.id and v.status = 'ACTIVE' and c.current_visual_version_id is null;
end;
$$;

create or replace function public.initialize_player_creature_visual_version()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.backfill_creature_visual_base_versions();
  return null;
end;
$$;

drop trigger if exists player_creatures_initialize_visual_version on public.player_creatures;
create trigger player_creatures_initialize_visual_version
after insert on public.player_creatures
for each statement execute function public.initialize_player_creature_visual_version();

select public.backfill_creature_visual_base_versions();

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

drop trigger if exists creature_visual_versions_immutable on public.creature_visual_versions;
create trigger creature_visual_versions_immutable
before update on public.creature_visual_versions
for each row execute function public.protect_creature_visual_version_immutability();

create table if not exists public.creature_visual_progress_tracks (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  creature_id uuid not null references public.player_creatures(id) on delete cascade,
  visual_trait_id text not null,
  status text not null check (status in ('ACTIVE', 'READY', 'GENERATING', 'GENERATED', 'COMPLETED', 'CANCELLED')),
  progress integer not null default 0 check (progress >= 0),
  target integer not null check (target >= 1 and target <= 100),
  started_at timestamptz not null default timezone('utc', now()),
  ready_at timestamptz,
  generated_request_id uuid unique references public.creature_transformation_requests(id) on delete restrict,
  completed_version_id uuid references public.creature_visual_versions(id) on delete restrict,
  completed_at timestamptz,
  cancelled_at timestamptz
);

create unique index if not exists creature_visual_progress_tracks_one_open_per_creature_idx
  on public.creature_visual_progress_tracks (creature_id)
  where status in ('ACTIVE', 'READY', 'GENERATING', 'GENERATED');
create index if not exists creature_visual_progress_tracks_profile_idx
  on public.creature_visual_progress_tracks (profile_id, started_at desc);

create table if not exists public.creature_visual_progress_events (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.creature_visual_progress_tracks(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  creature_id uuid not null references public.player_creatures(id) on delete cascade,
  game_id uuid not null references public.games(id) on delete cascade,
  outcome text not null check (outcome in ('WIN', 'LOSS', 'DRAW')),
  awarded_progress integer not null check (awarded_progress in (0, 1)),
  created_at timestamptz not null default timezone('utc', now()),
  unique (profile_id, game_id)
);

create index if not exists creature_visual_progress_events_track_idx
  on public.creature_visual_progress_events (track_id, created_at asc);

create table if not exists public.creature_visual_version_rollbacks (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  creature_id uuid not null references public.player_creatures(id) on delete cascade,
  from_version_id uuid not null references public.creature_visual_versions(id) on delete restrict,
  to_version_id uuid not null references public.creature_visual_versions(id) on delete restrict,
  reason text not null check (reason in ('OWNER_CONFIRMED', 'ADMIN_CORRECTION')),
  created_at timestamptz not null default timezone('utc', now())
);

-- Requests retain the exact visual source and product track that produced an
-- official candidate. This is only server-written provenance.
alter table public.creature_transformation_requests
  add column if not exists visual_progress_track_id uuid references public.creature_visual_progress_tracks(id) on delete restrict,
  add column if not exists source_visual_version_id uuid references public.creature_visual_versions(id) on delete restrict;
create index if not exists creature_transformation_requests_visual_track_idx
  on public.creature_transformation_requests (visual_progress_track_id)
  where visual_progress_track_id is not null;

alter table public.creature_transformation_requests
  drop constraint if exists creature_transformation_requests_operation_check;
alter table public.creature_transformation_requests
  add constraint creature_transformation_requests_operation_check
  check (operation in ('GENERATE_CONCEPT', 'GENERATE_IMAGE', 'GENERATE_UNLOCKED_TRANSFORMATION'));

drop function if exists public.reserve_creature_transformation_request(uuid, uuid, text, text, text, smallint, text, text, numeric, integer, numeric, text, text, text);
create function public.reserve_creature_transformation_request(
  p_profile_id uuid, p_creature_id uuid, p_idempotency_key text, p_operation text,
  p_visual_trait_id text, p_intensity smallint, p_concept_mode text, p_image_provider_mode text,
  p_estimated_cost_usd numeric, p_daily_request_limit integer, p_daily_budget_usd numeric,
  p_benchmark_case_id text default null, p_generation_profile_id text default null, p_concept_seed text default null,
  p_visual_progress_track_id uuid default null, p_source_visual_version_id uuid default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_request public.creature_transformation_requests%rowtype; v_day_start timestamptz; v_count integer; v_cost numeric(12, 6);
begin
  if (p_benchmark_case_id is null) <> (p_generation_profile_id is null) then raise exception 'benchmark case and generation profile must be paired'; end if;
  if p_benchmark_case_id is not null and p_concept_seed is null then raise exception 'benchmark concept seed is required'; end if;
  if not exists (select 1 from public.player_creatures where id = p_creature_id and profile_id = p_profile_id) then return jsonb_build_object('outcome','CREATURE_NOT_OWNED'); end if;
  if p_visual_progress_track_id is not null and not exists (select 1 from public.creature_visual_progress_tracks where id = p_visual_progress_track_id and profile_id = p_profile_id and creature_id = p_creature_id) then raise exception 'VISUAL_TRACK_NOT_FOUND'; end if;
  if p_source_visual_version_id is not null and not exists (select 1 from public.creature_visual_versions where id = p_source_visual_version_id and profile_id = p_profile_id and creature_id = p_creature_id and status = 'ACTIVE') then raise exception 'CREATURE_VISUAL_VERSION_CONFLICT'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_profile_id::text || ':' || p_idempotency_key, 0));
  select * into v_request from public.creature_transformation_requests where profile_id = p_profile_id and idempotency_key = p_idempotency_key;
  if found then return jsonb_build_object('outcome','EXISTING','record',to_jsonb(v_request)); end if;
  v_day_start := date_trunc('day', timezone('utc', now())) at time zone 'utc';
  perform pg_advisory_xact_lock(hashtextextended(p_profile_id::text || ':' || v_day_start::date::text, 1));
  select count(*)::integer, coalesce(sum(coalesce(actual_cost_usd, estimated_cost_usd, 0)),0)::numeric(12,6) into v_count, v_cost
  from public.creature_transformation_requests where profile_id = p_profile_id and created_at >= v_day_start;
  if p_daily_request_limit < 1 or v_count >= p_daily_request_limit then return jsonb_build_object('outcome','DAILY_LIMIT_REACHED'); end if;
  if coalesce(v_cost,0) + coalesce(p_estimated_cost_usd,0) > coalesce(p_daily_budget_usd,0) then return jsonb_build_object('outcome','DAILY_BUDGET_REACHED'); end if;
  insert into public.creature_transformation_requests(
    profile_id, creature_id, idempotency_key, operation, status, visual_trait_id, intensity, concept_mode, image_provider_mode,
    estimated_cost_usd, benchmark_case_id, generation_profile_id, concept_seed, visual_progress_track_id, source_visual_version_id
  ) values (
    p_profile_id, p_creature_id, p_idempotency_key, p_operation, 'RESERVED', p_visual_trait_id, p_intensity, p_concept_mode, p_image_provider_mode,
    p_estimated_cost_usd, p_benchmark_case_id, p_generation_profile_id, p_concept_seed, p_visual_progress_track_id, p_source_visual_version_id
  ) returning * into v_request;
  return jsonb_build_object('outcome','CREATED','record',to_jsonb(v_request));
end;
$$;

create or replace function public.select_creature_visual_progress_track(
  p_profile_id uuid,
  p_creature_id uuid,
  p_visual_trait_id text,
  p_target integer
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_track public.creature_visual_progress_tracks%rowtype;
begin
  if p_target < 1 or p_target > 100 then raise exception 'VISUAL_TRACK_STATE_CONFLICT'; end if;
  if p_visual_trait_id not in ('IMPACT_ADAPTATION','LOCOMOTION_ADAPTATION','SENSORY_EXPANSION','ENERGY_REGULATION','AQUATIC_MORPHOLOGY') then
    raise exception 'VISUAL_TRAIT_INVALID';
  end if;
  if not exists (select 1 from public.player_creatures where id = p_creature_id and profile_id = p_profile_id) then
    raise exception 'CREATURE_NOT_OWNED';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('visual-track:' || p_creature_id::text, 0));
  if exists (select 1 from public.creature_visual_progress_tracks where creature_id = p_creature_id and status in ('ACTIVE','READY','GENERATING','GENERATED')) then
    raise exception 'VISUAL_TRACK_ALREADY_ACTIVE';
  end if;
  insert into public.creature_visual_progress_tracks(profile_id, creature_id, visual_trait_id, status, target)
  values (p_profile_id, p_creature_id, p_visual_trait_id, 'ACTIVE', p_target)
  returning * into v_track;
  return to_jsonb(v_track);
end;
$$;

create or replace function public.record_creature_visual_progress_from_match_completion(
  p_game_id uuid,
  p_profile_id uuid,
  p_creature_id uuid,
  p_outcome text,
  p_completed_at timestamptz
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_track public.creature_visual_progress_tracks%rowtype; v_awarded integer; v_inserted integer;
begin
  if p_outcome not in ('WIN','LOSS','DRAW') then raise exception 'VISUAL_TRACK_STATE_CONFLICT'; end if;
  select * into v_track from public.creature_visual_progress_tracks
  where profile_id = p_profile_id and creature_id = p_creature_id and status = 'ACTIVE'
  for update;
  if not found then return jsonb_build_object('outcome','NO_ACTIVE_TRACK'); end if;
  v_awarded := case when p_outcome = 'WIN' then 1 else 0 end;
  insert into public.creature_visual_progress_events(track_id, profile_id, creature_id, game_id, outcome, awarded_progress, created_at)
  values (v_track.id, p_profile_id, p_creature_id, p_game_id, p_outcome, v_awarded, coalesce(p_completed_at, timezone('utc', now())))
  on conflict (profile_id, game_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then return jsonb_build_object('outcome','ALREADY_RECORDED','track',to_jsonb(v_track)); end if;
  update public.creature_visual_progress_tracks
  set progress = progress + v_awarded,
      status = case when progress + v_awarded >= target then 'READY' else status end,
      ready_at = case when progress + v_awarded >= target then coalesce(ready_at, timezone('utc', now())) else ready_at end
  where id = v_track.id
  returning * into v_track;
  return jsonb_build_object('outcome','RECORDED','track',to_jsonb(v_track));
end;
$$;

create or replace function public.start_creature_visual_generation(
  p_profile_id uuid, p_creature_id uuid, p_track_id uuid, p_request_id uuid
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_track public.creature_visual_progress_tracks%rowtype;
begin
  select * into v_track from public.creature_visual_progress_tracks
  where id = p_track_id and profile_id = p_profile_id and creature_id = p_creature_id for update;
  if not found then raise exception 'VISUAL_TRACK_NOT_FOUND'; end if;
  if v_track.status = 'GENERATING' and v_track.generated_request_id = p_request_id then return to_jsonb(v_track); end if;
  if v_track.status <> 'READY' then raise exception 'VISUAL_TRACK_NOT_READY'; end if;
  update public.creature_visual_progress_tracks set status = 'GENERATING', generated_request_id = p_request_id where id = v_track.id returning * into v_track;
  return to_jsonb(v_track);
end;
$$;

create or replace function public.complete_creature_visual_generation(
  p_profile_id uuid, p_track_id uuid, p_request_id uuid, p_final_asset boolean
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_track public.creature_visual_progress_tracks%rowtype;
begin
  select * into v_track from public.creature_visual_progress_tracks
  where id = p_track_id and profile_id = p_profile_id for update;
  if not found then raise exception 'VISUAL_TRACK_NOT_FOUND'; end if;
  if v_track.generated_request_id is distinct from p_request_id then raise exception 'VISUAL_TRACK_STATE_CONFLICT'; end if;
  if v_track.status in ('GENERATED','COMPLETED') then return to_jsonb(v_track); end if;
  if v_track.status <> 'GENERATING' then raise exception 'VISUAL_TRACK_STATE_CONFLICT'; end if;
  update public.creature_visual_progress_tracks
  set status = case when p_final_asset then 'GENERATED' else 'READY' end,
      generated_request_id = case when p_final_asset then generated_request_id else null end
  where id = v_track.id returning * into v_track;
  return to_jsonb(v_track);
end;
$$;

create or replace function public.adopt_creature_transformation(
  p_profile_id uuid, p_creature_id uuid, p_progress_track_id uuid,
  p_transformation_request_id uuid, p_expected_current_visual_version_id uuid
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_track public.creature_visual_progress_tracks%rowtype; v_request public.creature_transformation_requests%rowtype;
  v_current public.creature_visual_versions%rowtype; v_version public.creature_visual_versions%rowtype; v_next_number integer;
begin
  select * into v_track from public.creature_visual_progress_tracks where id = p_progress_track_id and profile_id = p_profile_id and creature_id = p_creature_id for update;
  if not found then raise exception 'VISUAL_TRACK_NOT_FOUND'; end if;
  if v_track.status <> 'GENERATED' then raise exception 'VISUAL_GENERATION_NOT_ADOPTABLE'; end if;
  if v_track.generated_request_id is distinct from p_transformation_request_id then raise exception 'VISUAL_TRACK_STATE_CONFLICT'; end if;
  select * into v_request from public.creature_transformation_requests where id = p_transformation_request_id and profile_id = p_profile_id and creature_id = p_creature_id for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  if v_request.status <> 'SUCCEEDED' or v_request.asset_readiness <> 'FINAL_ASSET' or v_request.result_path is null or v_request.result_sha256 is null or v_request.result_mime_type is null or v_request.result_width is null or v_request.result_height is null then
    raise exception 'VISUAL_GENERATION_NOT_ADOPTABLE';
  end if;
  if exists (select 1 from public.creature_visual_versions where source_transformation_request_id = p_transformation_request_id) then raise exception 'CREATURE_VISUAL_ALREADY_ADOPTED'; end if;
  select * into v_current from public.creature_visual_versions where id = p_expected_current_visual_version_id and creature_id = p_creature_id and status = 'ACTIVE' for update;
  if not found or v_request.source_visual_version_id is distinct from p_expected_current_visual_version_id then raise exception 'CREATURE_VISUAL_VERSION_CONFLICT'; end if;
  select coalesce(max(version_number), 0) + 1 into v_next_number from public.creature_visual_versions where creature_id = p_creature_id;
  update public.creature_visual_versions set status = 'SUPERSEDED' where id = v_current.id;
  insert into public.creature_visual_versions(
    creature_id, profile_id, version_number, previous_version_id, source_transformation_request_id, base_creature_key,
    visual_trait_id, concept_name, concept_snapshot, prompt_template_version, prompt_sha256,
    asset_path, asset_sha256, mime_type, width, height, has_alpha, status, adopted_at
  ) values (
    p_creature_id, p_profile_id, v_next_number, v_current.id, p_transformation_request_id, v_current.base_creature_key,
    v_track.visual_trait_id, coalesce(v_request.concept_snapshot->>'conceptName','Evoluzione visuale'), v_request.concept_snapshot,
    v_request.prompt_template_version, v_request.prompt_sha256, v_request.result_path, v_request.result_sha256,
    v_request.result_mime_type, v_request.result_width, v_request.result_height, true, 'ACTIVE', timezone('utc', now())
  ) returning * into v_version;
  update public.player_creatures set current_visual_version_id = v_version.id where id = p_creature_id and current_visual_version_id = v_current.id;
  if not found then raise exception 'CREATURE_VISUAL_VERSION_CONFLICT'; end if;
  update public.creature_visual_progress_tracks set status = 'COMPLETED', completed_version_id = v_version.id, completed_at = timezone('utc', now()) where id = v_track.id;
  return to_jsonb(v_version);
end;
$$;

create or replace function public.rollback_creature_visual_version(
  p_profile_id uuid, p_creature_id uuid, p_target_version_id uuid,
  p_expected_current_visual_version_id uuid, p_reason text
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_current public.creature_visual_versions%rowtype; v_target public.creature_visual_versions%rowtype;
begin
  if p_reason not in ('OWNER_CONFIRMED','ADMIN_CORRECTION') then raise exception 'VISUAL_ROLLBACK_FAILED'; end if;
  select * into v_current from public.creature_visual_versions where id = p_expected_current_visual_version_id and creature_id = p_creature_id and profile_id = p_profile_id and status = 'ACTIVE' for update;
  if not found then raise exception 'CREATURE_VISUAL_VERSION_CONFLICT'; end if;
  select * into v_target from public.creature_visual_versions where id = p_target_version_id and creature_id = p_creature_id and profile_id = p_profile_id and status = 'SUPERSEDED' for update;
  if not found then raise exception 'VISUAL_VERSION_NOT_FOUND'; end if;
  update public.creature_visual_versions set status = 'SUPERSEDED' where id = v_current.id;
  update public.creature_visual_versions set status = 'ACTIVE', adopted_at = coalesce(adopted_at, timezone('utc', now())) where id = v_target.id returning * into v_target;
  update public.player_creatures set current_visual_version_id = v_target.id where id = p_creature_id and current_visual_version_id = v_current.id;
  if not found then raise exception 'CREATURE_VISUAL_VERSION_CONFLICT'; end if;
  insert into public.creature_visual_version_rollbacks(profile_id, creature_id, from_version_id, to_version_id, reason)
  values (p_profile_id, p_creature_id, v_current.id, v_target.id, p_reason);
  return to_jsonb(v_target) || jsonb_build_object('rollback_reason', p_reason, 'rolled_back_at', timezone('utc', now()));
end;
$$;

alter table public.creature_visual_versions enable row level security;
alter table public.creature_visual_progress_tracks enable row level security;
alter table public.creature_visual_progress_events enable row level security;
alter table public.creature_visual_version_rollbacks enable row level security;
alter table public.creature_visual_base_asset_catalog enable row level security;
revoke all on public.creature_visual_versions, public.creature_visual_progress_tracks, public.creature_visual_progress_events, public.creature_visual_version_rollbacks, public.creature_visual_base_asset_catalog from public, anon, authenticated;
grant all on public.creature_visual_versions, public.creature_visual_progress_tracks, public.creature_visual_progress_events, public.creature_visual_version_rollbacks, public.creature_visual_base_asset_catalog to service_role;

revoke all on function public.select_creature_visual_progress_track(uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.backfill_creature_visual_base_versions() from public, anon, authenticated;
revoke all on function public.reserve_creature_transformation_request(uuid, uuid, text, text, text, smallint, text, text, numeric, integer, numeric, text, text, text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.record_creature_visual_progress_from_match_completion(uuid, uuid, uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.start_creature_visual_generation(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.complete_creature_visual_generation(uuid, uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function public.adopt_creature_transformation(uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.rollback_creature_visual_version(uuid, uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.select_creature_visual_progress_track(uuid, uuid, text, integer) to service_role;
grant execute on function public.backfill_creature_visual_base_versions() to service_role;
grant execute on function public.reserve_creature_transformation_request(uuid, uuid, text, text, text, smallint, text, text, numeric, integer, numeric, text, text, text, uuid, uuid) to service_role;
grant execute on function public.record_creature_visual_progress_from_match_completion(uuid, uuid, uuid, text, timestamptz) to service_role;
grant execute on function public.start_creature_visual_generation(uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.complete_creature_visual_generation(uuid, uuid, uuid, boolean) to service_role;
grant execute on function public.adopt_creature_transformation(uuid, uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.rollback_creature_visual_version(uuid, uuid, uuid, uuid, text) to service_role;
