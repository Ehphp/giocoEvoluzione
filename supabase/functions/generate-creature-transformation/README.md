# Generate creature transformation

La Function offre il laboratorio `CreatureTransformation` per `GENERATE_CONCEPT` e `GENERATE_IMAGE` mock. JWT, ownership, identita canonica, prompt e Storage sono risolti esclusivamente server-side. Il browser non invia prompt, source path, profile ID, bucket, modello o byte immagine.

## Configurazione server-side

Impostare questi secret fuori dal controllo versione:

- `CREATURE_TRANSFORMATION_LAB_ENABLED=true`
- `CREATURE_TRANSFORMATION_ALLOWED_CONCEPT_MODES=MOCK,AI`
- `CREATURE_TRANSFORMATION_ALLOWED_IMAGE_PROVIDER_MODES=MOCK`
- `CREATURE_TRANSFORMATION_SIGNED_URL_TTL_SECONDS=300` (facoltativo; 60-3600)
- `CREATURE_TRANSFORMATION_DAILY_REQUEST_LIMIT=10` (facoltativo; 1-1000)
- `CREATURE_TRANSFORMATION_DAILY_BUDGET_USD=0` (facoltativo; 0-10000)
- `CREATURE_TRANSFORMATION_STALE_REQUEST_SECONDS=900` (facoltativo; 60-86400)
- `OPENAI_API_KEY` e `OPENAI_CONCEPT_MODEL` soltanto per il concept `AI`.
- `CREATURE_TRANSFORMATION_REAL_IMAGE_ENABLED=false`
- `CREATURE_TRANSFORMATION_REAL_IMAGE_PROVIDER=OPENAI`
- `CREATURE_TRANSFORMATION_REAL_IMAGE_ALLOWED_PROFILE_IDS=`
- `OPENAI_IMAGE_API_KEY`
- `OPENAI_IMAGE_MODEL`
- `OPENAI_IMAGE_QUALITY=medium`
- `OPENAI_IMAGE_TIMEOUT_MS=120000`
- `OPENAI_IMAGE_ESTIMATED_COST_USD` (obbligatorio e maggiore di zero per il pilot).
- `CREATURE_TRANSFORMATION_MAX_REAL_IMAGE_ESTIMATED_COST_USD` (obbligatorio, finito e maggiore di zero per ogni richiesta `REAL`; deve essere almeno il costo stimato configurato).

Valori mancanti o non validi adottano impostazioni sicure: laboratorio disabilitato, nessuna mode autorizzata, quota tecnica 10, budget `$0` e stale dopo 15 minuti. I mock consumano quota ma hanno costo stimato/effettivo `$0`. Il concept AI non inventa costi: se il provider non fornisce usage, i campi economici restano `null`.

`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` sono disponibili nel runtime Supabase. La service role resta nella Function e nel seed locale, mai nel browser.

## Storage privato e seed

Applicare `supabase/migrations/202608020002_creature_transformation_storage.sql`. Essa crea bucket privati PNG (massimo 10 MiB):

- `creature-transformation-sources`, con `verdant-hatchling-v1.png`;
- `creature-transformation-experiments`, con i risultati mock.

Non esistono policy `anon` o `authenticated` su `storage.objects`: la Function usa service role e il browser non puo leggere, elencare o caricare oggetti. Verificare che entrambi i bucket abbiano `Public` disattivato.

Per seedare la sorgente una sola volta:

```powershell
$env:SUPABASE_URL='https://your-project.supabase.co'
$env:SUPABASE_SERVICE_ROLE_KEY='<service-role-key>'
npm run seed:creature-transformation-source
```

Lo script controlla l'oggetto prima di caricare e non duplica il PNG.

## Registro, RLS e RPC

`supabase/migrations/202608020003_creature_transformation_request_persistence.sql` aggiunge `public.creature_transformation_requests`. Conserva solo metadati di audit: profilo, creatura, operation, key, mode, provider/modello, hash, path interno, costo, tentativi, errore normalizzato e timestamp. Non conserva prompt completi, byte, signed URL, API key, header, stack trace o dati gameplay.

La chiave e `unique(profile_id, idempotency_key)`. Le transizioni consentite sono:

```text
RESERVED -> RUNNING -> SUCCEEDED
                    -> FAILED
RESERVED -----------> FAILED
```

RLS consente a `authenticated` soltanto la lettura della propria riga. Non esistono policy/grant browser per insert, update o delete. La Function scrive con RPC `security definer`, eseguibili solo da `service_role`:

- `reserve_creature_transformation_request`: verifica ownership, prende lock advisory sia sulla key sia su profilo/giorno UTC, recupera una richiesta esistente, controlla quota/budget e inserisce `RESERVED` atomicamente;
- `transition_creature_transformation_request`: blocca la riga, verifica la transizione e aggiorna audit, costi e timestamp.

Il rollback e manuale e documentato nella migration: revocare le RPC, rimuovere policy/trigger e poi la tabella. Non eseguirlo dove i record debbano essere conservati.

## Idempotenza e retry

La stessa key e idempotente nel singolo profilo. Un click intenzionale crea una nuova key; `Riprova tecnicamente` riusa invece la key dell'errore tecnico.

- concept `SUCCEEDED`: `IDEMPOTENT_REQUEST_ALREADY_COMPLETED`, perche concept e prompt completi non sono persistiti;
- immagine mock `SUCCEEDED`: crea una nuova signed URL per lo stesso `result_path`, senza provider ne upload;
- `RUNNING`/`RESERVED`: `REQUEST_ALREADY_IN_PROGRESS`;
- `RUNNING`/`RESERVED` oltre la soglia stale: `REQUEST_STALE`, senza rilancio automatico;
- `FAILED`: `REQUEST_PREVIOUSLY_FAILED`; un nuovo tentativo richiede una nuova key.

Le response espongono `requestPersistence` con ID record, stato, esito idempotenza e costi quando disponibili. Il laboratorio li mostra senza esporre path interno o signed URL persistite.

## Flusso immagini mock

`GENERATE_IMAGE` riserva, marca `RUNNING`, legge la sorgente privata, rivalida concept e immagini, usa `MockCreatureImageProvider`, salva e marca `SUCCEEDED` con hash e path deterministico `profileId/sha256(idempotencyKey).png`. Il mock copia i byte a costo zero; `MOCK_PROVIDER_NO_VISUAL_TRANSFORMATION` e `RESULT_IMAGE_UNCHANGED_MOCK` sono warning attesi.

Ogni errore controllato marca `FAILED`.

## Pilot OpenAI Image Edit (Fase 6B)

`REAL` e disabilitato per default. Viene valutato solo dopo il flag server-side, allowlist esplicita del profilo, provider `OPENAI`, API key, modello e costo stimato valido. Il flag browser `VITE_CREATURE_TRANSFORMATION_REAL_IMAGE_ENABLED=false` serve solo a nascondere il controllo; il backend resta l'autorita e non esporre mai API key con prefisso `VITE_`.

La richiesta `GENERATE_IMAGE` reale viene riservata con il costo `OPENAI_IMAGE_ESTIMATED_COST_USD`, passa a `RUNNING`, registra una task con `EdgeRuntime.waitUntil` e risponde `202`. La task usa `POST /v1/images/edits`, multipart con un solo `image[]` PNG canonico, prompt composto server-side, `n=1`, `1024x1536`, qualita configurata e output PNG base64. Prima di segnare `FAILED`, ritenta al massimo cinque volte soltanto gli errori transitori (`429` e `5xx`, incluso `520`), con backoff e rispetto di `Retry-After`. Timeout, rete, moderazione, errori di input e risposte non valide restano terminali e non vengono ritentati automaticamente.

`GET_REQUEST_STATUS` accetta soltanto un `transformationRequestId`, verifica il proprietario server-side e restituisce stato, metadati e una nuova signed URL per il risultato `SUCCEEDED`. Non restituisce mai `result_path`.

La migration `202608020004_creature_transformation_real_image_pilot.sql` aggiunge soltanto `asset_readiness` e `validation_warnings`. Il PNG provider deve avere alpha e una copertura alpha verificabile; se uno dei controlli fallisce la richiesta termina in `FAILED`, senza fallback o post-processing. Un PNG validato viene salvato direttamente come `FINAL_ASSET`. In nessun caso il risultato aggiorna `player_creatures` o promuove uno sprite ufficiale.

Il progetto locale usa gia `[edge_runtime] policy = "per_worker"` in `supabase/config.toml`, richiesto per sperimentare la task nel runtime locale.

## Benchmark controllato e review (Fase 6C)

La migration `202608030001_creature_transformation_benchmark_reviews.sql` aggiunge solo metadata riproducibili al ledger (`benchmark_case_id`, `generation_profile_id`, `concept_seed`, `prompt_sha256`, `concept_snapshot` validato e `generation_quality`) e la tabella RLS `creature_transformation_experiment_reviews`. Non aggiunge né aggiorna campi di `player_creatures` e non promuove asset: anche `FINAL_ASSET_CANDIDATE` è soltanto un verdict umano.

Configurare inoltre, sempre come secret server-side:

- `CREATURE_TRANSFORMATION_MAX_REAL_IMAGE_ESTIMATED_COST_USD=<limite-positivo-conservativo>` — nessun fallback permissivo. Se mancante/invalido o se `OPENAI_IMAGE_ESTIMATED_COST_USD` lo supera, `REAL` viene rifiutato con `REAL_IMAGE_REQUEST_COST_LIMIT_EXCEEDED`.
- `CREATURE_TRANSFORMATION_BENCHMARK_PROFILE_IDS=<uuid-di-un-solo-profilo>` — allowlist per preparare concept benchmark e avviare la singola immagine reale.
- `CREATURE_TRANSFORMATION_BENCHMARK_REVIEWER_PROFILE_IDS=<stesso-uuid-per-il-primo-pilot>` — allowlist distinta per leggere risultati e salvare review.
- `CREATURE_TRANSFORMATION_IMAGE_GENERATION_PROFILES_JSON` — catalogo JSON rigoroso. Il browser invia soltanto l'ID e non può impostare modello, qualità, provider, endpoint o costo.

Esempio di struttura, non di prezzo reale da copiare alla cieca:

```json
{
  "openai-medium-v1": {
    "provider": "OPENAI",
    "model": "gpt-image-1.5",
    "quality": "medium",
    "promptTemplateVersion": "creature-transformation-v1",
    "estimatedCostUsd": 0,
    "enabled": false
  },
  "openai-medium-v2-experimental": {
    "provider": "OPENAI",
    "model": "gpt-image-1.5",
    "quality": "medium",
    "promptTemplateVersion": "creature-transformation-v2-experimental",
    "estimatedCostUsd": 0,
    "enabled": false
  }
}
```

Un profile abilitato richiede un costo strettamente positivo entro il limite per richiesta. JSON invalido, campo sconosciuto, ID inesistente o profile disabilitato chiudono il flusso; non esiste override dal client. Il piano iniziale ha esattamente cinque casi, uno per Visual Trait, intensità 2 e seed versionati. Entrambi i template preservano individuo, volto, occhi, posa, silhouette e stile; la palette è preservata solo per i concept legacy o con `colorEvolution.mode: PRESERVE`. `EXPAND` e `SHIFT` richiedono invece una palette visibile, legata alla funzione biologica e alle zone corporee dichiarate, senza ripristinare il colore dominante precedente.

La UI benchmark richiede flag non sensibile `VITE_CREATURE_TRANSFORMATION_BENCHMARK_ENABLED=true`, ma l'autorizzazione effettiva resta server-side. Carica solo risultati e review del reviewer autenticato. Export JSON/CSV è locale e contiene metadati, warning, rubric, costi e hash; esclude signed URL, path Storage, token, chiavi, byte e base64.

### Smoke test remoto obbligatorio Fase 6C

Non dichiarare completato questo smoke test finché non è stato realmente eseguito:

1. Applicare la migration 6C dopo le migration 5, 6A e 6B.
2. Deployare la Function aggiornata.
3. Impostare entrambe le allowlist con un solo profilo di test.
4. Impostare un limite per richiesta molto basso e un budget giornaliero ridotto.
5. Definire un solo generation profile abilitato con modello autorizzato e costo conservativo.
6. Pubblicare il flag Netlify `VITE_CREATURE_TRANSFORMATION_BENCHMARK_ENABLED=true` con build pulita.
7. Eseguire un concept benchmark `MOCK` per un caso fisso.
8. Eseguire un solo click `REAL`, confermando il costo mostrato.
9. Verificare stato asincrono, hash e signed URL del risultato.
10. Inviare una review con rubric e issue flag controllati.
11. Aggiornare metriche, confronto affiancato ed export, verificando l'assenza di URL/path/secret nei file esportati.
12. Verificare che `player_creatures` non sia cambiata.
13. Riutilizzare la stessa idempotency key e verificare che non parta una seconda chiamata provider.
14. Controllare i log: nessun prompt, byte, signed URL, header o segreto.

I log della Function contengono solo request ID, transformation request ID, operation, stato, codice errore e metadati tecnici sicuri; non contengono prompt, byte, URL firmate, chiavi o header.

## Verifiche locali

```powershell
npm test
npm run lint
npm run build
git diff --check
```

La suite verifica contratti, migration/RLS, repository/RPC, quote e transizioni, stale, idempotenza concept, recupero immagine mock, signed URL rigenerata, upload/provider una sola volta e concorrenza sulla stessa key. Per il pilot copre anche multipart OpenAI, timeout/error mapping, task asincrona, status proprietario e asset `EXPERIMENT_ONLY`. Storage e rete sono mockati: non viene mai effettuata una chiamata reale in test o build.

## Passi remoti da eseguire/verificare per Fase 6B

1. Applicare la migration Storage Fase 5.
2. Applicare la migration richieste Fase 6A.
3. Applicare la migration del pilot Fase 6B.
4. Seedare il PNG sorgente e verificare i bucket privati.
5. Impostare quota e budget bassi, stale, modello, costo stimato conservativo e allowlist di un solo profilo.
6. Verificare nella console OpenAI l'accesso del progetto al modello configurato.
7. Deployare la Function e verificare il runtime Deno reale.
8. Eseguire prima uno smoke test `MOCK`.
9. Eseguire una sola richiesta `REAL` a qualita `medium`, quindi verificare status, signed URL, idempotenza e assenza di aggiornamenti su `player_creatures`.

Dopo aver collegato il progetto e configurato credenziali autorizzate:

```powershell
npx supabase db push
npx supabase functions deploy generate-creature-transformation
```

I test locali non sostituiscono questi controlli. Il recupero automatico di una richiesta stale e rimandato a una fase con job persistenti.

## Fase 7 — progressione visiva prodotto

La Fase 7 rende la visuale adottata una versione ufficiale della creatura, ma non modifica punteggio, adattamenti competitivi o scelte di un round. Il percorso riceve soltanto il risultato finale della partita: `WIN` assegna un punto, `DRAW` e `LOSS` zero.

### Variabili server richieste

```text
CREATURE_VISUAL_PROGRESSION_ENABLED=true
CREATURE_VISUAL_PRODUCTION_GENERATION_ENABLED=true
CREATURE_VISUAL_ADOPTION_ENABLED=true
CREATURE_VISUAL_PRODUCTION_PROFILE_IDS=<uuid-profilo-pilot>
CREATURE_VISUAL_PROGRESSION_WINS_REQUIRED=3
```

La soglia ha un solo default server-side (`3`), con limiti da 1 a 100. Per la generazione reale restano obbligatorie la configurazione OpenAI e i limiti Fase 6B (`CREATURE_TRANSFORMATION_REAL_IMAGE_*`, `OPENAI_IMAGE_*`, `CREATURE_TRANSFORMATION_MAX_REAL_IMAGE_ESTIMATED_COST_USD`).

Se si usa un profilo immagini del catalogo controllato Fase 6C, impostare anche:

```text
CREATURE_VISUAL_PRODUCTION_GENERATION_PROFILE_ID=<id-profile-server-side>
CREATURE_TRANSFORMATION_IMAGE_GENERATION_PROFILES_JSON=<catalogo-json>
```

In assenza dell'ID il percorso usa `OPENAI_IMAGE_*`. Il browser non invia modello, qualita, costo, provider, prompt o source version. Il flag frontend, puramente visuale, è `VITE_CREATURE_VISUAL_PROGRESSION_ENABLED=true`. Con la progressione abilitata, la lettura delle visuali è disponibile a tutti i profili autenticati; `CREATURE_VISUAL_PRODUCTION_PROFILE_IDS` limita invece le azioni di generazione e adozione, che modificano stato o possono generare costi.

### Migration e backfill remoto

1. Caricare il PNG canonico esatto in `creature-transformation-sources/verdant-hatchling-v1.png`.
2. Applicare `202608040001_creature_visual_progression.sql` dopo le migration Fase 6.
3. La migration crea il catalogo base, inizializza le versioni condivise e aggiorna `player_creatures.current_visual_version_id`.
4. Per un riesecuzione controllata, eseguire solo con service role `select public.backfill_creature_visual_base_versions();`.
5. Deployare sia `generate-creature-transformation` sia `resolve-round`.

Il backfill non duplica il PNG per profilo. Le versioni adottate riferiscono l'oggetto Storage esistente: una futura cleanup non deve eliminare alcun `result_path` presente in `creature_visual_versions`.

### Smoke test Fase 7 da eseguire sul remoto

1. Applicare migration/backfill, seedare Storage e deployare entrambe le Function.
2. Configurare un solo profilo pilot e attivare i flag server-side.
3. Completare tre vittorie e ripetere la resolve dello stesso match: deve esistere un solo evento per `(profile_id, game_id)`.
4. Verificare `READY`, generare, attendere `FINAL_ASSET`/`GENERATED`, quindi adottare.
5. Controllare incremento versione, Home, Profilo, bot, PvP, refresh della signed URL e assenza di cambi ai punteggi.
6. Provare conflitto sorgente e rollback esplicito verso una versione precedente.

Nessuna migration o smoke test Fase 7 è eseguito automaticamente da questa codebase.
