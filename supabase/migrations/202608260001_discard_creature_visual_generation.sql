-- ---------------------------------------------------------------------------
-- Scartare una proposta generata
--
-- Prima di questa migration il rifiuto non esisteva: il bottone "Mantieni creatura attuale"
-- era una semplice navigazione indietro. Il percorso restava in 'GENERATED' per sempre, e
-- poiche' 'GENERATED' e' uno degli stati che bloccano l'apertura di un nuovo percorso
-- (VISUAL_TRACK_ALREADY_ACTIVE), la creatura non poteva piu' evolversi: ne' su quel target
-- ne' su nessun altro, per sempre, qualunque numero di vittorie accumulasse in seguito.
--
-- Le vittorie NON tornano al contatore. Aprire il percorso le ha spese, e adottare o scartare
-- sono due esiti dello stesso percorso: nessuno dei due regala un secondo tentativo. Chi scarta
-- torna a giocare esattamente come chi adotta. Questa funzione ripara il vicolo cieco, non il
-- costo: il costo e' la regola.
-- ---------------------------------------------------------------------------

create or replace function public.discard_creature_visual_generation(
  p_profile_id uuid, p_creature_id uuid, p_track_id uuid, p_request_id uuid
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_track public.creature_visual_progress_tracks%rowtype;
begin
  -- Stesso lock di open_evolution_track_from_ready_target: lo scarto libera lo slot che quella
  -- funzione verifica, e le due non devono poter correre in parallelo sulla stessa creatura.
  perform pg_advisory_xact_lock(hashtextextended('visual-track:' || p_creature_id::text, 0));

  select * into v_track from public.creature_visual_progress_tracks
   where id = p_track_id and profile_id = p_profile_id and creature_id = p_creature_id
     for update;
  if not found then raise exception 'VISUAL_TRACK_NOT_FOUND'; end if;

  -- Un doppio invio (rete lenta, doppio tap) non e' un errore: lo scarto e' gia' avvenuto.
  if v_track.status = 'CANCELLED' and v_track.generated_request_id is not distinct from p_request_id then
    return to_jsonb(v_track);
  end if;

  if v_track.status <> 'GENERATED' or v_track.generated_request_id is distinct from p_request_id then
    raise exception 'VISUAL_TRACK_STATE_CONFLICT';
  end if;

  update public.creature_visual_progress_tracks
     set status = 'CANCELLED', cancelled_at = timezone('utc', now())
   where id = v_track.id
  returning * into v_track;

  -- creature_evolution_target_progress non viene toccata di proposito: le vittorie erano gia'
  -- state sottratte da open_evolution_track_from_ready_target e restano spese.
  --
  -- generated_request_id resta valorizzato: documenta quale proposta e' stata rifiutata, e
  -- l'indice parziale che impedisce due percorsi aperti non copre 'CANCELLED'.
  return to_jsonb(v_track);
end;
$$;

revoke all on function public.discard_creature_visual_generation(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.discard_creature_visual_generation(uuid, uuid, uuid, uuid)
  to service_role;
