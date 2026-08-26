-- ---------------------------------------------------------------------------
-- La lineage e' un cammino, non l'insieme delle versioni
--
-- Le due Edge Function leggevano la storia evolutiva con un filtro di stato
-- (status in ('ACTIVE','SUPERSEDED')), che dopo un rollback include anche i rami abbandonati.
-- Con quella lista il server ricostruisce adoptedBodyPlanMutationIds, quindi il body plan
-- canonico, quindi i target disponibili, l'anatomy contract e il regime di prompt: una
-- mutazione strutturale adottata su un ramo poi scartato faceva dichiarare a FLUX
-- un'anatomia che nell'immagine sorgente non esiste.
--
-- previous_version_id e' gia' popolato correttamente da adopt_creature_transformation, e
-- rollback_creature_visual_version non lo tocca: il cammino dalla versione ACTIVE alla
-- versione base e' quindi la storia reale dell'individuo che si sta evolvendo adesso.
-- ---------------------------------------------------------------------------

create or replace function public.list_creature_visual_lineage(p_creature_id uuid)
returns table (
  version_number integer,
  visual_trait_id text,
  evolution_target_id text,
  evolution_function text,
  concept_name text,
  concept_snapshot jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with recursive lineage as (
    select v.id, v.previous_version_id, v.version_number, v.visual_trait_id,
           v.evolution_target_id, v.evolution_function, v.concept_name, v.concept_snapshot,
           1 as depth
      from public.creature_visual_versions v
     where v.creature_id = p_creature_id and v.status = 'ACTIVE'
    union all
    select parent.id, parent.previous_version_id, parent.version_number, parent.visual_trait_id,
           parent.evolution_target_id, parent.evolution_function, parent.concept_name,
           parent.concept_snapshot,
           child.depth + 1
      from public.creature_visual_versions parent
      join lineage child on child.previous_version_id = parent.id
     -- Il cammino non puo' avere cicli (ogni versione punta a una piu' vecchia), ma una
     -- ricorsione senza freno su dati corrotti bloccherebbe la generazione invece di degradarla.
     where parent.creature_id = p_creature_id and child.depth < 128
  )
  select lineage.version_number, lineage.visual_trait_id, lineage.evolution_target_id,
         lineage.evolution_function, lineage.concept_name, lineage.concept_snapshot
    from lineage
   -- La versione base non ha visual_trait_id: e' il punto di partenza, non una trasformazione.
   where lineage.visual_trait_id is not null
   order by lineage.version_number asc;
$$;

revoke all on function public.list_creature_visual_lineage(uuid) from public, anon, authenticated;
grant execute on function public.list_creature_visual_lineage(uuid) to service_role;
