# TODO Supabase

Azioni che vanno eseguite **sul progetto Supabase** (`xvzolxmatmibxbqaixxc`), non nel repository:
deploy delle Edge Function, secret, oggetti di database, configurazione auth.

Il codice nel repo è già allineato. Le voci qui sotto restano aperte perché richiedono accesso al
progetto remoto, che da qui non è disponibile (`supabase secrets list` → `LegacyPlatformAuthRequiredError`).

**Convenzione:** ogni volta che emerge qualcosa da fare su Supabase, va annotato in questo file
invece di restare solo nel messaggio di una conversazione.

---

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

## 6. Nota: le Edge Function non passano da `tsc`

`tsconfig.app.json` include solo `src` e `shared`, quindi `supabase/functions/**` non è
typechecked: oggi quel codice è coperto solo dai test.

Durante il refactor ho costruito un harness temporaneo (`tsc` sulle sole edge function, con i
globali `Deno.*`/`EdgeRuntime` stubbati e `https://esm.sh/@supabase/supabase-js` mappato sul
pacchetto locale) e l'ho confrontato con lo stesso check su `HEAD`. Ha trovato **2 bug reali** che
compilazione, lint e test non avevano visto:

- `createSeedreamDiagnosticProvider` passato a un input che non ha più quel campo (`index.ts`);
- un blocco `diagnostic` in `orchestrateGetTransformationRequestStatus` che leggeva
  `workflow.variantId` / `conceptSource` / `promptStrategy` / `parameters.seed` su un workflow che
  ora può essere solo `SEEDREAM_PRODUCTION` — su un percorso **vivo** (`GET_REQUEST_STATUS`).

Entrambi corretti. Dopo la correzione: zero regressioni rispetto a `HEAD`, e 38 errori invece di 45.

**Non ho aggiunto l'harness al repo**: restano 38-39 errori preesistenti (nullability non gestita
nel webhook e nel finalizer, `fetch` con body `Uint8Array` che Deno accetta ma la lib DOM no, e il
mio shim di `esm.sh` che non riesporta `createClient`). Uno script `npm` che falla sempre sarebbe
peggio di nessuno script.

Da fare: installare Deno e usare `deno check supabase/functions/**/*.ts` con i tipi veri — così i
falsi positivi da lib DOM e da shim spariscono e resta solo la nullability da triagiare. Poi
agganciarlo a `npm run lint`.
