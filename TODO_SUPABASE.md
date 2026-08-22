# TODO Supabase

Azioni che vanno eseguite **sul progetto Supabase** (`xvzolxmatmibxbqaixxc`), non nel repository:
deploy delle Edge Function, secret, oggetti di database, configurazione auth.

Il codice nel repo è già allineato. Le voci qui sotto restano aperte perché richiedono accesso al
progetto remoto, che da qui non è disponibile (`supabase secrets list` → `LegacyPlatformAuthRequiredError`).

**Convenzione:** ogni volta che emerge qualcosa da fare su Supabase, va annotato in questo file
invece di restare solo nel messaggio di una conversazione.

---

## 0. FINE_DEL_MONDO — migration da applicare e secret nuovo

Portato da `ec3d936` (`main`). La feature rende **dinamica la durata del match**: `scheduled_rounds`
parte da 7 e ogni giocatore può scommetterla una volta, con esito sorteggiato server-side
(−2 round su `FINE_DEL_MONDO`, +3 su `ERA_PROSPERA`, clamp 5–10).

**Migration:** `supabase/migrations/202608220001_combat_mutations_fine_del_mondo.sql`. Aggiunge
colonne a `games`, `players`, `round_actions`, `round_results`, `player_creatures`, i validatori
`is_valid_scheduled_rounds` / `is_valid_fine_del_mondo_activations`, e **ridefinisce** le routine di
partita (`create_pvp_game`, `join_pvp_game`, `submit_game_round_action`, `advance_game_round`,
`commit_game_round_resolution`).

```bash
npx supabase db push
```

**Secret nuovo, obbligatorio:** `COMBAT_MUTATION_RNG_SECRET`. È la chiave HMAC con cui
`resolve-round` sorteggia l'esito. Va impostata **solo** come Edge Function secret: se finisce in una
`VITE_*` il client può prevedere l'esito prima di attivare la mutazione.

```bash
npx supabase secrets set COMBAT_MUTATION_RNG_SECRET="$(openssl rand -hex 32)"
```

> ⚠️ **Ordine.** La migration va applicata **prima** di deployare `resolve-round`, altrimenti la
> function scrive colonne che non esistono. E `RULE_VERSION` è passata a
> `combat-mutations-fine-del-mondo-v1`: le partite già in corso restano congelate sulla loro
> versione (`SUPPORTED_RULE_VERSIONS` le ammette ancora), quindi non serve svuotare nulla.

## 1. Ridistribuire le Edge Function — BLOCCANTE

Il refactor del 2026-08-22 ha cambiato in modo sostanziale il codice server. Fino al deploy, la
produzione gira sulla versione precedente e le voci 2–3 non vanno toccate (i vecchi secret servono
ancora al codice deployato).

```bash
npx supabase functions deploy generate-creature-transformation
npx supabase functions deploy fal-creature-transformation-finalizer
```

`fal-creature-transformation-webhook` non è stata modificata.

Cosa cambia nel contratto, dopo il deploy:

- **Operazioni rimosse** — rispondono `501 OPERATION_NOT_IMPLEMENTED`:
  `GENERATE_FLUX_EVOLUTION_CHAIN_STEP`, `RUN_SEEDREAM_DIAGNOSTIC`, `GET_LAB_USAGE`,
  `GET_GENERATED_IMAGE_CATALOG`, `LIST_VISUAL_BACKGROUND_CLEANUP`,
  `SUBMIT_VISUAL_BACKGROUND_CLEANUP`, `SELECT_VISUAL_PROGRESS_TRACK`.
- **Operazioni attive** (le sole usate dal gioco): `GET_REQUEST_STATUS`,
  `GENERATE_UNLOCKED_TRANSFORMATION`, `SUBMIT_BACKGROUND_REMOVAL_CANDIDATE`, `GET_VISUAL_PROGRESS`,
  `GET_CURRENT_VISUAL`, `GET_GAME_VISUALS`, `ADOPT_CREATURE_TRANSFORMATION`,
  `ROLLBACK_CREATURE_VISUAL_VERSION`.
- **Una sola pipeline immagine**: Seedream (`fal-ai/bytedance/seedream/v4.5/edit`). Lo switch
  `CREATURE_EVOLUTION_IMAGE_PIPELINE` non esiste più, il provider FLUX è stato rimosso.
- `falWorkflow` accetta ora solo `kind: 'SEEDREAM_PRODUCTION'`.

> ⚠️ **Richieste in volo.** Una richiesta creata prima del deploy e finalizzata dopo, con
> `falWorkflow.kind` `FLUX` o `SEEDREAM_DIAGNOSTIC`, non è più parsabile: `parseFalQueueWorkflow`
> restituisce `null` e il finalizer la marca fallita con `FLUX_RESULT_IMAGE_INVALID`. Prima di
> deployare, verificare che non ci siano richieste pendenti:
>
> ```sql
> select id, status, fal_workflow->>'kind' as kind, created_at
> from creature_transformation_requests
> where status in ('RUNNING', 'PENDING')
> order by created_at desc;
> ```
>
> Se ce ne sono, aspettare che si chiudano oppure accettare che vengano marcate fallite (il track
> visuale viene comunque ripristinato: nessuna creatura resta bloccata in `GENERATING`).

## 2. Secret da rimuovere (dopo il deploy)

Non più letti da nessun codice:

```
CREATURE_EVOLUTION_IMAGE_PIPELINE
CREATURE_VISUAL_PRODUCTION_PIPELINE
CREATURE_TRANSFORMATION_LAB_ENABLED
CREATURE_TRANSFORMATION_LAB_PROFILE_IDS
CREATURE_TRANSFORMATION_LINEAGE_EXPERIMENT_PROFILE_IDS
CREATURE_TRANSFORMATION_EXPRESSIVE_CONCEPT_EXPERIMENT_ENABLED
CREATURE_VISUAL_BACKGROUND_CLEANUP_ENABLED
FAL_FLUX_MODEL
FAL_FLUX_TIMEOUT_MS
FAL_FLUX_ESTIMATED_COST_USD
FAL_FLUX_MAX_ESTIMATED_COST_USD
FLUX_PROMPT_TEMPLATE_VERSION
FAL_SUBMISSION_SOURCE_URL_TTL_SECONDS   # solo se FAL_SEEDREAM_SUBMISSION_SOURCE_URL_TTL_SECONDS è impostato
```

```bash
npx supabase secrets unset CREATURE_EVOLUTION_IMAGE_PIPELINE FAL_FLUX_MODEL # ...
```

## 3. Secret da verificare — la pipeline non parte senza questi

`seedreamProductionConfigurationFailure` fallisce con `FAL_FLUX_NOT_CONFIGURED` (503) se manca
anche uno solo di questi. Le due variabili di costo **non hanno default**: non impostate valgono
"pipeline non configurata".

| Secret | Nota |
|---|---|
| `FAL_SEEDREAM_API_KEY` | il codice ripiega ancora su `FAL_FLUX_API_KEY` → `FAL_KEY`, quindi il secret attuale continua a funzionare. Meglio rinominarlo. |
| `SEEDREAM_ESTIMATED_COST_PER_GENERATION` | obbligatorio, > 0 |
| `SEEDREAM_MAX_ESTIMATED_COST_PER_GENERATION` | obbligatorio, ≥ estimated |
| `OPENAI_API_KEY` | obbligatorio: il micro-concept precede la chiamata immagine |
| `FLUX_MICRO_CONCEPT_MODEL` | obbligatorio (attualmente `gpt-4o-mini`) |
| `CREATURE_VISUAL_PROGRESSION_ENABLED` | `true`, altrimenti 403 |
| `CREATURE_VISUAL_PRODUCTION_GENERATION_ENABLED` | `true`, altrimenti 403 |
| `CREATURE_VISUAL_ADOPTION_ENABLED` | `true`, altrimenti l'adozione dà 403 |
| `FAL_WEBHOOK_CALLBACK_TOKEN`, `FAL_FINALIZER_SHARED_SECRET` | valori lunghi e distinti |

## 4. Funzioni di database rimaste senza chiamante

Confermate orfane: nessun `.rpc()` nel codice e nessun riferimento dentro altro SQL.

| Funzione | Perché |
|---|---|
| `select_creature_visual_progress_track` | superata da `open_evolution_track_from_ready_target`, che è quella che il gioco usa davvero |
| `promote_cleaned_creature_visual` | serviva solo alla schermata `#visual-background-cleanup`, rimossa |
| `upsert_creature_transformation_experiment_review` | benchmark review del Lab, rimosse |

Da fare in una migration dedicata (non modificare le migration già applicate):

```sql
drop function if exists public.select_creature_visual_progress_track(uuid, uuid, text, text, integer);
drop function if exists public.promote_cleaned_creature_visual(uuid, text, text, integer, integer, text, text, text, integer, integer);
drop function if exists public.upsert_creature_transformation_experiment_review(uuid, uuid, smallint, smallint, smallint, smallint, smallint, smallint, smallint, smallint, text, text[], text);
```

Verificare le firme esatte prima di eseguire (`\df nome_funzione` in psql): sono state ridefinite
più volte e potrebbero esistere overload.

Nella stessa occasione, valutare se la tabella delle benchmark review
(`202608030001_creature_transformation_benchmark_reviews.sql`) contiene ancora dati utili o può
essere archiviata.

## 5. Registrazione pubblica — decisione aperta

`security-hardening.test.ts` asserisce che `AuthProvider` non chiami `.auth.signUp(`. Lo chiama, e
la schermata di login mostra "Registrati": il test è l'unico rosso della suite.

Va deciso quale delle due è la verità:

- **Registrazione chiusa** → rimuovere `signUp` da `src/auth/AuthProvider.tsx` e il link dalla
  `AuthScreen`, e verificare `enable_signup` in `supabase/config.toml` + Dashboard → Auth.
- **Registrazione aperta** → aggiornare l'asserzione del test, e verificare che
  `hook_enforce_registered_user_limit` sia attivo come limite voluto.

Non l'ho deciso io: è una scelta di prodotto, non di refactor.

## 6. Typecheck delle Edge Function — FATTO, ma non ripetibile

`tsconfig.app.json` include solo `src` e `shared`, quindi `supabase/functions/**` non è coperto da
`npm run build`. Il 2026-08-22 ho installato Deno temporaneamente, eseguito
`deno check` sui quattro entrypoint, corretto tutti gli errori e **rimosso Deno** (scelta esplicita:
serviva come strumento una volta sola). `package.json` e `package-lock.json` sono invariati.

Risultato: **81 → 0 errori**. Le correzioni sono nel commit successivo al refactor.

Cosa ha trovato, che compilazione, lint e 485 test non avevano visto:

| Problema | Dove | Natura |
|---|---|---|
| Blocco `diagnostic` che leggeva `variantId`/`conceptSource`/`promptStrategy`/`parameters.seed` su un workflow ormai solo `SEEDREAM_PRODUCTION` | `edge-orchestration.ts`, `GET_REQUEST_STATUS` | **bug su percorso vivo** |
| `createSeedreamDiagnosticProvider` passato a un input che non ha più quel campo | `generate-creature-transformation/index.ts` | riferimento morto |
| `RequestReservationResult` con `'CREATED' \| 'EXISTING'` in un solo membro: non si restringe, il gestore di fallimento riceveva la forma di successo | `creature-transformation-request-repository.ts` | unione non discriminabile |
| `select().eq().eq()` perdeva `order`/`range` (metodo su intersezione risolve alla prima firma) | idem | tipizzazione client |
| `FAL_SEEDREAM_MODEL_REQUIRED` rilanciato ma assente dall'unione del servizio → cadeva nello status HTTP di default | `fal-queue-submission-service.ts` | codice non mappato (ora 503) |
| `mimeType` del candidato dichiarato `'image/png'` ma alimentato da un campo che può essere JPEG | `edge-orchestration.ts` | contratto vs realtà |
| `verified` letto dopo un guard su un booleano correlato, non sul valore | webhook, verifica firma | invariante non dimostrabile |
| `visualInspection` letto dopo `shouldRejectSeedreamCenterFacing(x?.y)` | finalizer | idem |

Nessuna di queste correzioni cambia il comportamento a runtime, tranne due che rendono *verificato*
ciò che prima era assunto (il formato del candidato e l'invariante della firma).

**Il check non è più eseguibile.** Se serve di nuovo: `npm i --no-save deno` e
`node_modules/.bin/deno check --no-lock supabase/functions/<funzione>/index.ts` per ognuno dei
quattro entrypoint, poi `npm uninstall --no-save deno`. Da valutare se renderlo permanente e
agganciarlo a `npm run lint`, ora che la baseline è zero e una regressione salterebbe subito.
