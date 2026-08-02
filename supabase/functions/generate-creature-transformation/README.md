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

`GENERATE_IMAGE` riserva, marca `RUNNING`, legge la sorgente privata, rivalida concept/immagini, usa `MockCreatureImageProvider`, post-processa, salva e marca `SUCCEEDED` con hash e path deterministico `profileId/sha256(idempotencyKey).png`. Il mock copia i byte a costo zero; `MOCK_PROVIDER_NO_VISUAL_TRANSFORMATION` e `RESULT_IMAGE_UNCHANGED_MOCK` sono warning attesi.

Ogni errore controllato marca `FAILED`.

## Pilot OpenAI Image Edit (Fase 6B)

`REAL` e disabilitato per default. Viene valutato solo dopo il flag server-side, allowlist esplicita del profilo, provider `OPENAI`, API key, modello e costo stimato valido. Il flag browser `VITE_CREATURE_TRANSFORMATION_REAL_IMAGE_ENABLED=false` serve solo a nascondere il controllo; il backend resta l'autorita e non esporre mai API key con prefisso `VITE_`.

La richiesta `GENERATE_IMAGE` reale viene riservata con il costo `OPENAI_IMAGE_ESTIMATED_COST_USD`, passa a `RUNNING`, registra una task con `EdgeRuntime.waitUntil` e risponde `202`. La task usa una sola chiamata `POST /v1/images/edits`, multipart con un solo `image[]` PNG canonico, prompt composto server-side, `n=1`, `1024x1536`, qualita configurata e output PNG base64. Non effettua retry automatici: timeout, 429, 5xx, rete, moderazione e risposta non valida finiscono in `FAILED`.

`GET_REQUEST_STATUS` accetta soltanto un `transformationRequestId`, verifica il proprietario server-side e restituisce stato, metadati e una nuova signed URL per il risultato `SUCCEEDED`. Non restituisce mai `result_path`.

La migration `202608020004_creature_transformation_real_image_pilot.sql` aggiunge soltanto `asset_readiness` e `validation_warnings`. Il PNG provider viene prima validato con il profilo `PROVIDER_RAW_RESULT`: senza alpha e valido diventa `EXPERIMENT_ONLY` con `RAW_RESULT_ALPHA_MISSING`; con alpha e validazione finale superata diventa `FINAL_ASSET`. In nessun caso il risultato aggiorna `player_creatures` o promuove uno sprite ufficiale.

Il progetto locale usa gia `[edge_runtime] policy = "per_worker"` in `supabase/config.toml`, richiesto per sperimentare la task nel runtime locale.

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
