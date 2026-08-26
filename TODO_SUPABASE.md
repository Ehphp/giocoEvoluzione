# TODO Supabase

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
