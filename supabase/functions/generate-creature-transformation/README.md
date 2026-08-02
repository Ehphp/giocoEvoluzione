# Generate creature transformation

La Function fornisce la vertical slice di `CreatureTransformation` per concept e immagini mock. L'autenticazione JWT, la proprieta della creatura e l'identita canonica vengono sempre risolte server-side. Il browser non invia prompt, source path, profile ID, bucket, modello o byte immagine.

## Configurazione server-side

Impostare questi secret della Edge Function fuori dal controllo versione:

- `CREATURE_TRANSFORMATION_LAB_ENABLED=true`
- `CREATURE_TRANSFORMATION_ALLOWED_CONCEPT_MODES=MOCK,AI`
- `CREATURE_TRANSFORMATION_ALLOWED_IMAGE_PROVIDER_MODES=MOCK`
- `CREATURE_TRANSFORMATION_SIGNED_URL_TTL_SECONDS=300` (facoltativo; da 60 a 3600)
- `OPENAI_API_KEY` e `OPENAI_CONCEPT_MODEL` solo se si abilita il concept `AI`.

`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` sono disponibili al runtime Supabase. La service role resta esclusivamente nella Function e nello script locale di seed: non viene mai esposta al browser.

## Storage privato

Applicare la migration `supabase/migrations/202608020002_creature_transformation_storage.sql`. Essa crea due bucket privati, limitati a PNG fino a 10 MiB:

- `creature-transformation-sources`: contiene una sola sorgente canonica, `verdant-hatchling-v1.png`;
- `creature-transformation-experiments`: contiene esclusivamente i risultati mock.

La migration non aggiunge policy per `anon` o `authenticated` su `storage.objects`; con RLS attivo il client non puo leggere, elencare o caricare oggetti. La Function legge e scrive con service role server-side. Dopo la migration verificare in Supabase Storage che entrambi i bucket abbiano `Public` disattivato e, provando con una sessione browser, che upload/list falliscano.

## Seed della sorgente

Il file di codice `public/assets/battle/creatures/verdant-hatchling.png` deve essere caricato una sola volta nel bucket source. Dopo avere applicato la migration, eseguire localmente con secret non versionati:

```powershell
$env:SUPABASE_URL='https://your-project.supabase.co'
$env:SUPABASE_SERVICE_ROLE_KEY='<service-role-key>'
npm run seed:creature-transformation-source
```

Lo script controlla prima l'oggetto `verdant-hatchling-v1.png`; se esiste non lo duplica. Non viene eseguito dalla Function e non carica il PNG per ogni richiesta.

## Flusso `GENERATE_IMAGE`

Per una richiesta `GENERATE_IMAGE`, la Function valida body e policy, risolve ownership e identita, rivalida il concept, lo valuta e ricompone il prompt. Poi legge il PNG canonico privato, valida sorgente e output, esegue il `MockCreatureImageProvider`, passa dal `NoopImagePostProcessor`, rivalida e salva il solo risultato. La risposta espone esclusivamente una signed URL temporanea e i metadati non sensibili.

Il mock restituisce una copia dei byte sorgente con costo zero. Quindi `RESULT_IMAGE_UNCHANGED_MOCK` e `MOCK_PROVIDER_NO_VISUAL_TRANSFORMATION` sono warning attesi: questa e una simulazione tecnica, non una trasformazione visiva riuscita.

`REAL` viene sempre rifiutata con `REAL_IMAGE_PROVIDER_NOT_IMPLEMENTED`, anche se impostata impropriamente nell'ambiente. Non esistono provider reali, chiamate immagini a pagamento, background removal o aggiornamenti del profilo in questa fase.

## Idempotenza mock

Il risultato usa un path interno deterministico: `profileId/sha256(idempotencyKey).png`. L'idempotency key del browser non viene mai usata direttamente come path; retry con stesso utente e stessa key sovrascrivono lo stesso oggetto con `upsert`. Questo non e idempotenza transazionale completa: non ci sono ancora tabella, lock o storico definitivo.

## Test locale

```bash
npm test
npm run lint
npm run build
```

I test usano mock Storage e non effettuano upload o chiamate remote. Prima del deploy, applicare la migration, eseguire il seed in ambiente protetto e configurare i secret sopra elencati.
