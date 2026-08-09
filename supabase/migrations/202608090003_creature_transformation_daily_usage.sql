create function public.get_creature_transformation_daily_usage(p_profile_id uuid)
returns table (request_count integer, real_image_count integer, global_real_image_count integer, spent_usd numeric)
language sql
security definer
set search_path = public
as $$
  with today as (
    select * from public.creature_transformation_requests
    where created_at >= date_trunc('day', timezone('utc', now())) at time zone 'utc'
  )
  select
    count(*) filter (where profile_id = p_profile_id)::integer as request_count,
    count(*) filter (where profile_id = p_profile_id and image_provider_mode = 'REAL')::integer as real_image_count,
    count(*) filter (where image_provider_mode = 'REAL')::integer as global_real_image_count,
    coalesce(sum(coalesce(actual_cost_usd, estimated_cost_usd, 0)) filter (where profile_id = p_profile_id), 0)::numeric as spent_usd
  from today;
$$;

revoke all on function public.get_creature_transformation_daily_usage(uuid) from public, anon, authenticated;
grant execute on function public.get_creature_transformation_daily_usage(uuid) to service_role;
