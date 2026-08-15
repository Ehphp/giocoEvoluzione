-- Some development projects enable a safe-update guard that rejects DELETE
-- statements without a WHERE clause, including inside SECURITY DEFINER RPCs.
-- Rebuild the already-deployed reset function from its own definition, changing
-- only its nine deliberate full-domain deletes to explicit primary-key scopes.
-- This migration is a no-op rewrite on a fresh database where 150001 already
-- contains the corrected statements.

begin;

do $$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'public.admin_destructive_reset_creature_evolution_environment()'::regprocedure
  ) into v_definition;

  if position('delete from public.creature_transformation_experiment_reviews;' in v_definition) = 0
    and position('delete from public.creature_transformation_experiment_reviews where id is not null;' in v_definition) = 0 then
    raise exception 'ADMIN_CREATURE_EVOLUTION_RESET_ABORTED: reset function definition is not recognized';
  end if;

  v_definition := replace(v_definition,
    'delete from public.creature_transformation_experiment_reviews;',
    'delete from public.creature_transformation_experiment_reviews where id is not null;');
  v_definition := replace(v_definition,
    'delete from public.creature_transformation_lineage_comparison_reviews;',
    'delete from public.creature_transformation_lineage_comparison_reviews where id is not null;');
  v_definition := replace(v_definition,
    'delete from public.creature_visual_progress_events;',
    'delete from public.creature_visual_progress_events where id is not null;');
  v_definition := replace(v_definition,
    'delete from public.creature_evolution_target_progress_events;',
    'delete from public.creature_evolution_target_progress_events where id is not null;');
  v_definition := replace(v_definition,
    'delete from public.creature_evolution_target_progress;',
    'delete from public.creature_evolution_target_progress where id is not null;');
  v_definition := replace(v_definition,
    'delete from public.creature_visual_version_rollbacks;',
    'delete from public.creature_visual_version_rollbacks where id is not null;');
  v_definition := replace(v_definition,
    'delete from public.creature_visual_progress_tracks;',
    'delete from public.creature_visual_progress_tracks where id is not null;');
  v_definition := replace(v_definition,
    'delete from public.creature_visual_versions;',
    'delete from public.creature_visual_versions where id is not null;');
  v_definition := replace(v_definition,
    'delete from public.creature_transformation_requests;',
    'delete from public.creature_transformation_requests where id is not null;');

  execute v_definition;
end;
$$;

notify pgrst, 'reload schema';

commit;
