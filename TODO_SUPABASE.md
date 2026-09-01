# TODO Supabase

## 2026-09-01 â€” Confronto relativo dell'altezza dopo un'evoluzione

Applicare `supabase/migrations/202609010002_adopt_relative_creature_height.sql` **dopo**
`202609010001_creature_biological_height.sql`, quindi ridistribuire solo
`fal-creature-transformation-finalizer`:

```bash
npx supabase db push
npx supabase functions deploy fal-creature-transformation-finalizer
```

Il finalizer richiede `GEMINI_API_KEY`, lo stesso secret gia usato da Vision 1/2. Opzionalmente `CREATURE_RELATIVE_HEIGHT_MODEL` e
`CREATURE_RELATIVE_HEIGHT_TIMEOUT_MS` separano modello e timeout dal resto di Vision; in loro
assenza riusa `CREATURE_VISION_MODEL` e 4 s. Il confronto e non bloccante: errore, timeout,
framing ambiguo o dati legacy mantengono l'altezza sorgente.

Smoke test: generare e adottare un'evoluzione con un cambiamento di silhouette evidente, verificare
`creature_transformation_requests.visual_inspection.heightComparison`, la copia in
`creature_visual_versions.visual_inspection` e il conseguente aggiornamento di
`player_creatures.height_meters`. Ripetere con un output ambiguo: proposta e adozione devono
riuscire, senza cambiare `height_meters`.

## 2026-09-01 — Altezza biologica canonica delle creature

Applicare `supabase/migrations/202609010001_creature_biological_height.sql` al progetto Supabase
`xvzolxmatmibxbqaixxc`:

```bash
npx supabase db push
```

La migration aggiunge `player_creatures.height_meters`, popola le creature esistenti con l'altezza
starter/riferimento di `1.4m` e assicura tramite trigger che gli snapshot delle nuove partite
ricevano `heightMeters` dal record canonico. Non modifica snapshot storici: il client li legge con
un fallback centralizzato.

Dopo il deploy: creare una partita PvP e una contro il bot, controllare in `players.creature_snapshot`
che la creatura umana contenga `heightMeters`, poi verificare la battaglia con una creatura a
un'altezza diversa da `1.4m`. Nessun secret o deploy di Edge Function è richiesto.

## 2026-08-29 — Eliminazione di una stirpe con pulizia Storage

Il frontend ora invoca l'Edge Function autenticata `delete-creature-lineage`, anziché chiamare
direttamente la RPC. La Function verifica il proprietario, legge i soli path di esperimento della
stirpe, elimina prima i record tramite `delete_my_creature_lineage` e poi usa Storage API `.remove()`
in batch da massimo 1.000 oggetti. Gli asset sorgente canonici e ogni path ancora referenziato da
record residui sono esclusi.

Da eseguire sul progetto Supabase `xvzolxmatmibxbqaixxc`:

```bash
npx supabase functions deploy delete-creature-lineage
```

Non servono migration né nuovi secret. Prima del deploy controllare che non ci siano cancellazioni
di stirpe in corso; dopo, eliminare una stirpe non finale dal frontend e verificare che la risposta
della Function riporti `storageCleanup.status: COMPLETED`.

## 2026-08-28 — Recovery idempotente di una finalizzazione Fal

La richiesta `df81c323-fced-479d-91e0-3b96211dcf5a` (track
`2e60e04c-9f41-44fa-a982-5e946d736c5e`) ha ricevuto il callback Fal ma il
finalizer e stato terminato per `WallClockTime` prima del claim. Per recuperare
lo stesso output senza una nuova submission:

1. applicare `202608280001_recover_stale_fal_finalization_claims.sql`;
2. deployare `fal-creature-transformation-webhook`;
3. ripetere un callback autorizzato per il medesimo `provider_request_id` con
   payload `OK` senza immagine: il webhook legge il risultato gia completato da
   Fal e lo passa al finalizer esistente.

La migration rende riacquisibile dopo dieci minuti un claim dello **stesso**
provider request rimasto orfano; non modifica idempotency key, non crea una
nuova request e non esegue submission o crop retry.

**Eseguito il 2026-08-28:** migration applicata, webhook ridistribuito e
callback ripetuto sul solo provider request `01a0475f-1839-7a03-90de-935c9fe8a134`.
La request e `SUCCEEDED` con raw `EXPERIMENT_ONLY`; la track e
`POST_PROCESSING`, pronta per lo scontorno del browser.

Azioni che vanno eseguite **sul progetto Supabase** (`xvzolxmatmibxbqaixxc`), non nel repository:
deploy delle Edge Function, secret, oggetti di database, configurazione auth.

Il codice nel repo è già allineato. Le voci qui sotto restano aperte perché richiedono accesso al
progetto remoto, che da qui non è disponibile (`supabase secrets list` → `LegacyPlatformAuthRequiredError`).

**Convenzione:** ogni volta che emerge qualcosa da fare su Supabase, va annotato in questo file
invece di restare solo nel messaggio di una conversazione.

---

# Ordine di esecuzione

Le sezioni numerate qui sotto sono la spiegazione del *perché*; questa è la sequenza del *cosa*.
L'ordine non è cosmetico: tre passaggi rompono qualcosa se anticipati.

Il `git push` non è un prerequisito. Sia `supabase db push` sia `supabase functions deploy` leggono
la copia locale, non il remoto. Conviene comunque pushare **prima**, così il codice che finisce in
produzione è tracciabile e recuperabile.

| # | Azione | Dettaglio | Perché qui |
|---|---|---|---|
| 1 | Verificare i secret richiesti | [§3](#3-secret-da-verificare--la-pipeline-non-parte-senza-questi) | **Prima** del deploy: se manca una delle due variabili di costo la pipeline risponde 503 e sembra che il deploy abbia rotto tutto |
| 2 | `supabase secrets set COMBAT_MUTATION_RNG_SECRET=…` | [§0](#0-fine_del_mondo--migration-da-applicare-e-secret-nuovo) | `resolve-round` non sorteggia senza la chiave HMAC |
| 3 | Controllare che non ci siano richieste di trasformazione in volo | [§1](#1-ridistribuire-le-edge-function--bloccante) | Una richiesta creata prima e finalizzata dopo il deploy viene marcata fallita |
| 4 | `npx supabase db push` | [§0](#0-fine_del_mondo--migration-da-applicare-e-secret-nuovo), [§8](#8-catalogo-delle-funzioni-evolutive--migration-da-applicare), [§10](#10-scarto-di-unevoluzione-e-lineage-reale--due-migration-da-applicare) | **Prima** del deploy: `resolve-round` scriverebbe colonne inesistenti e le due function dell'evoluzione chiamerebbero una RPC che non c'è |
| 5 | Deployare **tutte e quattro** le Edge Function | [§1](#1-ridistribuire-le-edge-function--bloccante), [§9](#9-policy-di-presentazione-delle-evoluzioni--deploy-edge-function-richiesto) | Unico deploy: copre refactor, FINE_DEL_MONDO, egress, policy di presentazione e scarto/lineage |
| 6 | Smoke test: una generazione completa end-to-end | — | Conferma 1–5 prima di rimuovere qualsiasi cosa |
| 6b | Smoke test: scarto di una proposta e ritorno a una forma precedente | [§10](#10-scarto-di-unevoluzione-e-lineage-reale--due-migration-da-applicare) | Le due migration del passo 4 sono inerti finché non le esercita qualcuno |
| 7 | `npm run backfill:creature-display-assets` | [§7](#7-egress--backfill-dei-display-asset) | Indipendente dal deploy, ma senza il display asset le versioni vecchie continuano a servire il master |
| 8 | Rimuovere i secret morti | [§2](#2-secret-da-rimuovere-dopo-il-deploy) | **Solo dopo** che lo smoke test è passato: servono al codice attualmente deployato |
| 9 | Migration che elimina le funzioni orfane | [§4](#4-funzioni-di-database-rimaste-senza-chiamante) | Pulizia, nessuna urgenza, migration dedicata |
| 10 | Decidere sulla registrazione pubblica | [§5](#5-registrazione-pubblica--decisione-aperta) | Scelta di prodotto, non di refactor. È l'unico test rosso della suite |

Il passo 6 non è formalità: 1–5 sono i quattro modi in cui questo deploy può fallire in silenzio
(secret mancante, migration non applicata, function dimenticata, richiesta in volo).

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
produzione gira sulla versione precedente e la voce 2 non va toccata (i vecchi secret servono ancora
al codice deployato).

**Vanno deployate tutte e quattro**, non due:

```bash
npx supabase functions deploy generate-creature-transformation
npx supabase functions deploy fal-creature-transformation-finalizer
npx supabase functions deploy fal-creature-transformation-webhook
npx supabase functions deploy resolve-round
```

Le ultime due erano fuori dall'elenco per due ragioni diverse, entrambe sbagliate:

- **`resolve-round`** è la function che esegue FINE_DEL_MONDO (`b481031` ha toccato `index.ts` e
  `bot-policy.ts`). Comparivano solo come avvertenza sull'ordine in §0, mai come azione. Senza questo
  deploy la feature non esiste in produzione, migration applicata o no.
- **`fal-creature-transformation-webhook`** ha solo riformattazioni nel suo `index.ts`, ed è per
  questo che l'avevo dichiarata invariata — ma è il ragionamento sbagliato. Il webhook importa cinque
  moduli da `generate-creature-transformation/`, e **tutti e cinque sono cambiati**, incluso
  `fal-flux-image-provider.ts` (−314 righe) e il repository delle richieste, dove §6 ha corretto
  un'unione non discriminabile. Le Edge Function vengono bundlate al deploy: senza ridistribuirla, il
  webhook continua a girare su una copia congelata di quei moduli.

Cosa cambia nel contratto, dopo il deploy:

- **Operazioni rimosse** — rispondono `501 OPERATION_NOT_IMPLEMENTED`:
  `GENERATE_FLUX_EVOLUTION_CHAIN_STEP`, `RUN_SEEDREAM_DIAGNOSTIC`, `GET_LAB_USAGE`,
  `GET_GENERATED_IMAGE_CATALOG`, `LIST_VISUAL_BACKGROUND_CLEANUP`,
  `SUBMIT_VISUAL_BACKGROUND_CLEANUP`, `SELECT_VISUAL_PROGRESS_TRACK`.
- **Operazioni attive** (le sole usate dal gioco): `GET_REQUEST_STATUS`,
  `GENERATE_UNLOCKED_TRANSFORMATION`, `SUBMIT_BACKGROUND_REMOVAL_CANDIDATE`, `GET_VISUAL_PROGRESS`,
  `GET_CURRENT_VISUAL`, `GET_GAME_VISUALS`, `ADOPT_CREATURE_TRANSFORMATION`,
  `ROLLBACK_CREATURE_VISUAL_VERSION`, `DISCARD_CREATURE_TRANSFORMATION` ([§10](#10-scarto-di-unevoluzione-e-lineage-reale--due-migration-da-applicare)).
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

## 7. Egress — backfill dei display asset

Il 2026-08-23 il tier free ha superato i 5 GB/mese di egress. Il tooltip del picco (21 ago, 2.58 GB
in un giorno) attribuisce **97.2% a Storage** — 2.505 GB — contro 2.4% PostgREST, 0.2% Functions,
0.2% Auth, 0.0% Realtime. Quindi il problema non è il numero di query: è **quali immagini vengono
servite, quante volte**.

Le correzioni sono nel codice (commit `412c6a9` e `76b8e59`). Restano il deploy — che è il **passo 5
del runbook**, non un deploy a parte — e il backfill qui sotto.

### 7.1 Cosa cambia con il deploy di `generate-creature-transformation`

Due comportamenti lato server. Finché non è deployata, due delle tre correzioni non hanno effetto:

- `GET_VISUAL_PROGRESS` firmava il **master** (PNG 1024×1536 con alpha) per ogni voce di history,
  mentre il visual corrente accanto serviva già il display asset (WebP ~768px). La history è una
  striscia di tutte le forme passate: era il consumatore più pesante e il più sbagliato.
- Il TTL degli URL firmati passa da **300 s a 12 h**. Questa è la leva vera: il browser indicizza la
  cache sull'URL completo, firma inclusa, quindi con una firma che ruota ogni 5 minuti nessun
  `cacheControl` sull'oggetto può servire a qualcosa. Il trade-off è che un URL trafugato resta
  valido più a lungo; sono sprite di creature, già mostrati al giocatore e al suo avversario.

### 7.2 Backfill dei display asset — necessario per le versioni vecchie

Le versioni visuali create prima della pipeline del display asset non ne hanno uno, e il codice fa
fallback al master: corretto come comportamento, ma è esattamente il download pesante che stiamo
cercando di evitare. Vanno generate.

**Prerequisito:** lo script legge `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_URL` (o
`VITE_SUPABASE_URL`). La service role key **non è nel `.env`** — è stata tenuta fuori quando l'ho
ripulito, e va tenuta fuori: passala solo per l'esecuzione, non scriverla nel file.

```bash
SUPABASE_SERVICE_ROLE_KEY='…' npm run backfill:creature-display-assets
```

Per sapere quante sono, prima:

```sql
select count(*) filter (where display_asset_path is null) as senza_display,
       count(*) as totali
from creature_visual_versions;
```

Nota: `cacheControl` era già `31536000` nel backfill (`tools/backfill-creature-display-assets.ts`);
mancava nell'**upload vivo** (`supabase-creature-transformation-storage.ts`), che usava il default
Supabase di un'ora. Ora è allineato — quindi gli oggetti già scritti dalla pipeline viva prima di
questo deploy portano ancora `max-age=3600`. Non è un problema da correggere a mano: al primo
`upsert` successivo l'header si aggiorna, e finché il TTL della firma era 5 minuti quell'header non
stava comunque cambiando nulla.

## 8. Catalogo delle funzioni evolutive — migration da applicare

La migration `supabase/migrations/202608250001_expand_evolution_function_catalog.sql` amplia da
8 a 14 il catalogo production delle funzioni evolutive con `CAMOUFLAGE`, `MANEUVERABILITY`,
`ENDURANCE`, `ACCELERATION`, `IMPACT_RESISTANCE` e `OXYGEN_EFFICIENCY`.

La colonna è già `text`, ma la RPC `reserve_creature_transformation_request` mantiene una
allowlist esplicita: senza applicare la migration, la pipeline deriverebbe una nuova funzione e la
prenotazione verrebbe rifiutata con `invalid evolution function`. La migration ridefinisce solo
quel validator e conserva `IMPACT_ABSORPTION` come valore storico leggibile, senza reinserirlo nel
resolver.

Applicare con il prossimo deploy database, prima di deployare le Edge Function che possono
selezionare il catalogo ampliato:

```bash
npx supabase db push
```

## 9. Policy di presentazione delle evoluzioni — deploy Edge Function richiesto

La correzione locale della policy di pose/stance elimina il `posture rebalancing` generico dai
micro-concept, preserva la posa nelle mutazioni anatomiche normali e lascia la postura bipede solo
alla `BIPEDAL_TRANSITION` esplicitamente autorizzata.

La logica esegue interamente dentro `generate-creature-transformation`: non introduce migration,
secret o modifiche di configurazione. Per rendere effettiva la correzione in produzione basta
ridistribuire questa Edge Function, dopo aver applicato l'eventuale migration del catalogo funzioni
in Ã‚Â§8:

```bash
npx supabase functions deploy generate-creature-transformation
```

Prima del deploy, controllare come in Ã‚Â§1 che non ci siano richieste immagine in corso. Il runbook
di Ã‚Â§1 mantiene comunque il deploy delle quattro function per le precedenti modifiche server;
questa voce identifica la dipendenza minima specifica della policy di presentazione.

## 10. Scarto di un'evoluzione e lineage reale — due migration da applicare

Due difetti dell'evoluzione, entrambi corretti nel repo e in attesa di `db push` + redeploy.

### 10a. Scartare una proposta non esisteva

Il bottone "Mantieni creatura attuale" era una semplice navigazione indietro: nessuna chiamata al
server. Il percorso restava in `GENERATED`, che è uno degli stati che fanno alzare
`VISUAL_TRACK_ALREADY_ACTIVE`, quindi **la creatura non poteva più evolversi** — né su quel target
né su nessun altro, per sempre, qualunque numero di vittorie accumulasse in seguito. L'unica uscita
era il reset distruttivo dell'ambiente.

`supabase/migrations/202608260001_discard_creature_visual_generation.sql` aggiunge
`discard_creature_visual_generation(uuid, uuid, uuid, uuid)`: porta il percorso a `CANCELLED`,
liberando lo slot. È idempotente e prende lo stesso advisory lock di
`open_evolution_track_from_ready_target`.

**Le vittorie restano spese, di proposito.** Adottare e scartare sono due esiti dello stesso
percorso, che l'apertura ha già pagato: nessuno dei due regala un secondo tentativo, chi scarta
torna a giocare esattamente come chi adotta. La migration ripara il vicolo cieco, non il costo.

**Nessuna migration di riparazione per i percorsi già bloccati in produzione.** Non serve: appena la
nuova operazione è deployata, quei percorsi diventano scartabili dalla schermata come tutti gli
altri. Una riparazione massiva avrebbe invece distrutto le proposte legittimamente in attesa di una
decisione del giocatore.

### 10b. La lineage includeva i rami abbandonati

Le due Edge Function leggevano la storia evolutiva con `status in ('ACTIVE','SUPERSEDED')`, che dopo
un ritorno a una forma precedente include anche il ramo scartato. Da quella lista il server ricostruisce
`adoptedBodyPlanMutationIds`, quindi il body plan canonico, i target disponibili, l'anatomy contract e —
dopo `e7144fb` e la policy di §9 — anche il regime di prompt. Una mutazione strutturale adottata su un
ramo poi abbandonato faceva dichiarare a FLUX un'anatomia che nell'immagine sorgente non esiste.

`supabase/migrations/202608260002_creature_visual_lineage_path.sql` aggiunge
`list_creature_visual_lineage(uuid)`, che risale `previous_version_id` dalla versione `ACTIVE` fino
alla base. Entrambe le Edge Function ora la chiamano al posto della query sulla tabella.

### Esecuzione

```bash
npx supabase db push
npx supabase functions deploy generate-creature-transformation
npx supabase functions deploy fal-creature-transformation-finalizer
```

L'ordine non è opzionale: le due function chiamano `list_creature_visual_lineage`, e senza la
migration ogni generazione fallirebbe sul lookup della lineage. Il webhook non è coinvolto (non
importa nessuno dei moduli toccati), ma se lo si ridistribuisce comunque per §1 non cambia nulla.

Il deploy di `generate-creature-transformation` richiesto da §9 e questo sono lo stesso deploy: §9
però non ha migration, mentre qui il `db push` viene **prima**, altrimenti la function chiama una
RPC che non esiste.

**Smoke test dopo il deploy**, nell'ordine — è la sequenza che prima era irrecuperabile:

1. Portare un target a percorso completo e generare una proposta.
2. Scartarla: il contatore del target deve restare a zero (le vittorie non tornano indietro).
3. Riportare quel target a percorso completo vincendo, e aprire un secondo percorso sulla stessa
   creatura: prima rispondeva `VISUAL_TRACK_ALREADY_ACTIVE` per sempre.
4. Con una creatura che ha almeno due versioni adottate, usare "Usa questa forma" per tornare a una
   precedente e generare: il body plan risolto deve essere quello della forma riattivata.


## 11. Egress e Storage — misurazione del 2026-08-29

Misurato pilotando l'app vera (`npm run dev` + Chromium via `playwright-core`, profilo `elk`,
viewport iPhone 12) e contando i byte di ogni richiesta verso il progetto Supabase. Non è una
deduzione dal codice: sono i `request.sizes()` di quattro sessioni complete.

### 11.1 Quello che NON è il problema — verificato, non ipotizzato

Tre sospetti plausibili, tutti smentiti dalla misura:

| Sospetto | Misura | Esito |
|---|---|---|
| Il TTL delle firme è ancora 300 s (deploy §1 mancante) | `expiresAt` restituito dalla function: **43195 s ≈ 12 h** | la correzione **è già in produzione** |
| La history serve i master PNG (backfill §7.2 mancante) | 11 oggetti su 11 sono `display/*.webp`, 72–175 KB | **i display asset ci sono e vengono serviti** |
| Ogni ritorno sull'app ricarica tutto | 3 cicli di `bringToFront()` reali: **0 richieste, 0 byte** | il refocus **non costa niente** |

Anche il resto dell'uso normale è quasi gratis:

| Azione | Traffico Supabase |
|---|---|
| Partita completa contro il bot | **7,8 KB** (`create_vs_bot_game`, `get_game_snapshot`, `GET_GAME_VISUALS`; le immagini arrivano dalla cache) |
| Navigazione fra le schermate del dock | **0 byte di Storage** (10 richieste, tutte cache hit) |
| Aprire la schermata evoluzione | 35 KB, di cui 0 di Storage |
| WebSocket realtime durante la partita | 4 frame, 0,5 KB |

Le §7 e §11 della versione precedente di questo documento davano per deployato il TTL a 300 s e per
mancante il backfill. Erano sbagliate entrambe.

### 11.2 Il problema è uno solo: il caricamento della pagina costa 1,08 MB, ogni volta

Quattro caricamenti misurati di fila, stesso account, stessa creatura:

```
1-cold-load+login    23 req   1109,5 KB   Storage 1082,7 KB
2-reload-#1          26 req   1111,4 KB   Storage 1082,6 KB
2-reload-#2          26 req   1111,5 KB   Storage 1082,6 KB
2-reload-#3          26 req   1111,5 KB   Storage 1082,6 KB
```

Sempre gli **stessi 11 oggetti**, sempre riscaricati per intero. Due cause indipendenti che si
moltiplicano.

**a) La home monta tutte le generazioni a piena risoluzione.** Ispezione del DOM dopo il login:

```
11 img .home-stage__creature   naturale 512x768   rese 326x323   loading=lazy (1 sola eager)
11 img rail "Gen 0..Gen 10"    naturale 512x768   rese  40x40    loading=lazy
```

Le due file condividono l'URL, quindi i download sono 11, non 22 — il commento a
`HomeScreen.tsx:321` su questo è corretto. Quello a `HomeScreen.tsx:20` no: dice *"Only the form on
screen is worth fetching"*, ma `CreatureArt` assegna `src` a **ogni** slide e distingue solo
`loading` fra `eager` e `lazy`. `lazy` non trattiene niente, perché il carosello è una riga
orizzontale già dentro il viewport e Chrome le considera tutte imminenti. **Ne vedi una, ne scarichi
undici.** Di 1,08 MB, circa 980 KB sono forme che non stai guardando.

E cresce da solo: ~90 KB in più per ogni evoluzione adottata, fino al tetto di 16 voci della
history (`creature-visual-progression-repository.ts:276`), cioè ~1,5 MB per caricamento a regime.

**b) La firma ruota a ogni caricamento, quindi la cache HTTP non aggancia mai.** Su 4 caricamenti,
**11 oggetti su 11 hanno ricevuto 4 firme diverse**. La cache degli URL firmati esiste in due punti
e nessuno dei due sopravvive a un reload:

- client — `creature-visual-url-cache.ts:18`, una `Map` a livello di modulo, muore col contesto JS;
- server — `SupabaseCreatureTransformationStorageAdapter.signedUrlCache`, `static` dentro l'isolate
  Edge, muore al riciclo e non è condivisa fra isolate.

Il browser indicizza la cache sull'URL completo, firma inclusa. Firma nuova = URL nuovo = miss su
tutto, nonostante il `cacheControl: 31536000` sugli oggetti e nonostante la firma precedente sia
ancora valida per altre 11 ore e 55 minuti. **Dentro una sessione la cache funziona benissimo**
(è per questo che navigazione e refocus costano zero); fra una sessione e l'altra non esiste.

1,08 MB × ~740 caricamenti ≈ 800 MB, che è l'egress del 28 agosto. Con Vite in HMR aperto su
desktop e telefono durante una giornata di sviluppo, 740 caricamenti non è un numero strano.

### 11.3 Correzioni applicate il 2026-08-29

Tre correzioni, tutte lato client: **nessun deploy Edge, nessuna migration, nessun secret.**
Rimisurate con la stessa sonda, stesso account, stesso viewport.

```
                              prima        dopo
cold load                  1082,7 KB    247,8 KB     2 immagini invece di 12
reload (x3)                1082,6 KB      0,0 KB     304, corpo vuoto
firme stabili su reload       0 / 11      2 / 2
sessione completa             4479 KB      396 KB
```

**a) Persistenza degli URL firmati** — `creature-visual-url-cache.ts`. La cache era una `Map` a
livello di modulo: moriva col contesto JS, quindi ogni caricamento rifirmava tutto e la cache HTTP
del browser mancava su ogni immagine. Ora è persistita in `localStorage` col suo `expiresAt`,
sfoltita alla scadenza, e svuotata al logout — un URL firmato è un bearer token per l'immagine e
vale 12 ore, quindi la fine della sessione deve essere anche la sua (`AuthProvider.tsx`, ramo
`!nextSession`; `clearCreatureVisualUrlCache` non aveva alcun chiamante in produzione).

Gli oggetti sono serviti `cache-control: no-cache` con ETag — **non** `max-age=31536000` come
afferma il commento in `supabase-creature-transformation-storage.ts:4`. Verificato con `curl -I` su
un URL firmato vero. Non cambia l'esito: con l'URL stabile il browser rivalida e riceve `304` a
corpo vuoto (`size_download=0`).

**b) Rimozione della rail delle forme** — era un placeholder, e con undici thumbnail 40x40 disegnati
da WebP 512x768 era diventata l'unica cosa che ancora tirava giù l'intera lineage a ogni
caricamento. Via la rail sono spariti anche `.home-forms*` dal CSS e l'override landscape; la riga
`auto` di `.home-stage` non serviva più. Lo swipe resta l'unico modo di attraversare le forme, che
era già il caso: la rail ne era la scorciatoia.

**c) Carosello limitato ai vicini** — `HomeScreen.tsx`, `PREFETCHED_NEIGHBOURS = 1`. Le slide non
adiacenti non ricevono `src` e non fanno richiesta; l'insieme di quelle già prese cresce e non viene
mai rilasciato, così tornare indietro non richiede due volte lo stesso sprite. Con la rail ancora
presente questa correzione valeva zero byte: i due consumatori condividevano l'URL e l'unione
restava dodici. Ora è quella che porta il cold load da 1082 KB a 248 KB.

Verificato nel browser, non solo nei test — swipe touch reali via CDP su iPhone 12:

```
partenza      slide 11/11   caricate [10,11]
swipe #1      slide 10/11   caricate [9,10,11]      1 immagine nuova
swipe #2      slide  9/11   caricate [8,...,11]     1 immagine nuova
...
in avanti     slide  7,8,9  caricate invariate      0 byte
tastiera      slide  8,7    caricate invariate      0 byte
```

**Effetto netto**: il costo per caricamento sparisce, resta un cold load da 248 KB per dispositivo
ogni volta che le firme scadono, cioè due volte al giorno. Da ~800 MB/giorno a ~0,5 MB/giorno.
Il problema di egress e chiuso con tre ordini di grandezza di margine.

### 11.3b Bug preesistente corretto: il drag col mouse funzionava una volta sola

Emerso verificando lo swipe, non cercandolo, e **presente anche su HEAD pulito**. Su desktop il
carosello si trascinava una volta e poi restava bloccato per sempre.

Causa, trovata strumentando gli eventi puntatore nel browser: al secondo `pointerdown` il browser
emette `pointercancel` subito dopo `gotpointercapture` — reclama il gesto per il proprio panning —
e l'handler `onPointerCancel` azzera `dragStartRef`, quindi nessun `pointermove` muove più niente.

```
=== drag #1 ===  pointerdown -> gotpointercapture -> scroll 4360 -> pointerup
=== drag #2 ===  pointerdown -> gotpointercapture -> pointercancel      <-- qui
```

Corretto con `event.preventDefault()` sul `pointerdown` del mouse, che impedisce al browser di
appropriarsi del gesto. Sopprimere il default sopprime anche il focus, quindi il carosello lo
riprende a mano o le frecce smettono di funzionare. Touch e tastiera non erano coinvolti e restano
invariati — verificati entrambi dopo la correzione.

### 11.3c Accessorio, non ancora corretto

Ogni caricamento fa il **bootstrap del profilo due volte**: sul reload si vedono
`bootstrap_my_profile`, `profiles`, `creature_lineages`, `player_creatures` duplicati, più
3× `GET_CURRENT_VISUAL` e 3× `GET_VISUAL_PROGRESS` = 6 invocazioni Edge. Causa: `AuthProvider`
chiama `getSession()` **e** riceve `INITIAL_SESSION` dal listener di `onAuthStateChange`
(`AuthProvider.tsx:127` e `:141`), e `resolveSession` gira per entrambi. Vale ~14 KB PostgREST e
metà delle invocazioni per caricamento: non è egress, ma è la voce "Edge Function Invocations" a
7.210. Non toccato perché filtrare gli eventi di `onAuthStateChange` cambia il ciclo di vita
dell'autenticazione, che merita una verifica a sé.

### 11.4 Storage al 94% — problema separato, e più urgente

Questo non l'ho misurato dal browser: è visibile dal codice e va confermato con le query qui sotto.
`grep -rn '\.remove(' supabase/ src/ tools/` trova **un solo chiamante**, il reset distruttivo in
`tools/reset-creature-evolution-environment.ts:173`. La pipeline non cancella mai niente. Ogni
generazione lascia in `creature-transformation-experiments`, per sempre e anche se la proposta viene
scartata o fallisce:

| Prefisso | Contenuto | Peso indicativo |
|---|---|---|
| `experiments/raw/<profile>/<sha>.png\|.jpg` | output grezzo Seedream 1024×1536 | 2–3 MB |
| `candidates/<profile>/<sha>.png` | PNG scontornato con alpha | 3–5 MB |
| `cleanup/<sha>.png` | master ripulito | 2–3 MB |
| `display/<sha>.webp` | display asset ~512×768 | 0,07–0,18 MB |

Il display asset è l'unico oggetto che il gioco serve davvero — la misura del §11.2 lo conferma:
**tutte** le richieste di Storage puntano a `display/`. Gli altri tre prefissi sono materiale di
lavorazione che nessuno legge più dopo la finalizzazione, e sono ~97% del peso.

**Da eseguire nel SQL editor**, prima di decidere cosa togliere:

```sql
select bucket_id,
       split_part(name, '/', 1) as prefisso,
       count(*) as oggetti,
       pg_size_pretty(sum((metadata->>'size')::bigint)) as peso
from storage.objects
where bucket_id in ('creature-transformation-sources', 'creature-transformation-experiments')
group by 1, 2
order by sum((metadata->>'size')::bigint) desc;
```

```sql
-- Raw e candidate di richieste chiuse da piu di sette giorni: candidati alla cancellazione.
select split_part(o.name, '/', 1) as prefisso,
       count(*) as oggetti,
       pg_size_pretty(sum((o.metadata->>'size')::bigint)) as recuperabile
from storage.objects o
where o.bucket_id = 'creature-transformation-experiments'
  and (o.name like 'experiments/raw/%' or o.name like 'candidates/%')
  and o.created_at < now() - interval '7 days'
group by 1;
```

Decisione aperta: retention manuale periodica, oppure un `pg_cron` che cancella raw e candidate
delle richieste in stato terminale oltre i sette giorni. Finché non c'è, il piano free satura da
solo — mancano ~64 MB al limite di 1 GB.
