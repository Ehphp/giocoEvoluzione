# Security audit — Gioco Evoluzione

**Data:** 2026-08-03  
**Metodo:** ispezione statica dell'intero repository, configurazioni Supabase/Vite, 99 commit Git raggiungibili, ricerca di token ad alta confidenza e `npm audit`. Non sono state interrogate le dashboard remote: le impostazioni elencate come manuali devono quindi essere verificate prima del deploy.

## Sintesi

| Severità | Risultato | Percorso di attacco | Correzione proposta |
| --- | --- | --- | --- |
| CRITICAL | Tabelle di gioco leggibili e modificabili da `anon`/`authenticated` | API PostgREST diretta: lettura di tutte le partite e inserimento/modifica di game, player e azioni | Revocare grant e policy aperte; consentire la lettura solo ai partecipanti autenticati e le mutazioni esclusivamente tramite RPC server-side controllate. |
| CRITICAL | `resolve-round` è configurata con `verify_jwt = false` e non verifica il chiamante | Invocazione HTTP diretta della Function con `gameId` e `roundNumber`, eseguita poi con `service_role` | Richiedere e validare JWT; verificare che il `sub` sia partecipante della partita prima di ogni azione privilegiata. |
| HIGH | Signup pubblico disponibile in UI e Supabase | Chiunque può invocare `auth.signUp` e creare account | Disabilitare signup in config/Dashboard, eliminare UI e API frontend di registrazione; usare soltanto inviti amministrativi. |
| HIGH | Protezione economica incompleta per le immagini OpenAI | Un profilo allowlist può usare chiavi diverse e superare i limiti richiesti; non esistono quota globale, cooldown o limite globale di concorrenza | Prenotazione SQL atomica con idempotenza/fingerprint, 3 tentativi immagini reali per utente/giorno, 10 globali/giorno, una attiva per utente, cooldown 60 s e concorrenza globale configurabile. |
| MEDIUM | Autorizzazione alla generazione dipende solo da allowlist ambientale specifica del pilot | Un errore di configurazione o l'attivazione della sola modalità AI non usa un permesso persistente del profilo | Aggiungere `profiles.can_generate_images`, non modificabile dal client; autorizzare solo allowlist o flag server-side, con fail-closed. |
| MEDIUM | CORS con `Access-Control-Allow-Origin: *` sulle Function | CORS non protegge endpoint né token; aumenta la superficie browser se un token viene esposto da altro difetto | Mantenere JWT/RLS come controllo primario; impostare in Dashboard un'origine Netlify esplicita quando la Function è riaperta. |
| LOW | Dipendenze aggiornate dopo l'audit | `undici` e `postcss` transitivi erano vulnerabili nel lockfile iniziale | `npm audit fix` ha aggiornato i soli lockfile transitive; l'audit finale riporta 0 vulnerabilità. |

## Architettura osservata

- Frontend React/Vite usa solo `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (`src/lib/supabase.ts`). Questi due valori sono pubblicabili; l'anon key non è una credenziale di amministrazione e richiede RLS corretta.
- Le Function Edge usano `SUPABASE_SERVICE_ROLE_KEY` soltanto nel runtime. `generate-creature-transformation` valida manualmente il bearer token prima di usare il client amministrativo; `resolve-round` non lo faceva.
- Le immagini e le sorgenti sono bucket Storage privati. Le URL firmate sono create dal server dopo i controlli di proprietà.
- Il ledger `creature_transformation_requests` è protetto da RLS owner-only ed esegue le mutazioni da `service_role`; possiede già idempotenza per `profile_id + idempotency_key`, ma non i limiti economici richiesti.

## Evidenze dettagliate

### CRITICAL — RLS gameplay aperto

**File:** `supabase/schema.sql:192-200`, `supabase/migrations/202607260001_reset_mvp_5_genes.sql:55-63`.

Le policy `using (true)` e `with check (true)` sono concesse anche a `anon`; i grant consentono `select, insert, update` su tutte le tabelle del `public` schema. Un chiamante può leggere tutti i giocatori e le azioni, falsificare un `profile_id` nei flussi di gioco e alterare stato/punteggio. Il trigger di collegamento profilo copre una parte dell'inserimento, ma non sostituisce RLS né protegge le altre tabelle.

### CRITICAL — Edge Function di risoluzione pubblica

**File:** `supabase/config.toml:418-419`, `supabase/functions/resolve-round/index.ts`.

`verify_jwt` è disabilitato e la Function non chiama `auth.getUser()`: accetta `gameId` e `roundNumber` dal body e opera con `SUPABASE_SERVICE_ROLE_KEY`. CORS non è una barriera di autenticazione.

### HIGH — Registrazione libera

**File:** `supabase/config.toml:176,221`, `src/auth/AuthProvider.tsx:141-159`, `src/components/auth/AuthScreen.tsx`.

Email signup è attivo localmente e nel client esiste un flusso completo di creazione account. La configurazione hosted del Dashboard deve essere cambiata separatamente.

### HIGH — Quota e concorrenza immagini non sufficienti

**File:** `supabase/functions/generate-creature-transformation/lab-policy.ts`, `supabase/migrations/202608020003_creature_transformation_request_persistence.sql`, `supabase/migrations/202608040001_creature_visual_progression.sql`.

Il lock per utente/idempotency key è corretto e impedisce il doppio addebito della stessa chiave. Il limite preesistente è però per tutte le richieste del singolo profilo (default 10), non è globale, non applica il cooldown, non limita globalmente le richieste in corso e non associa un fingerprint di richieste equivalenti. La quota è inoltre conteggiata alla creazione, non secondo la policy economica richiesta.

### Segreti e dipendenze

- Nessuna chiave OpenAI, `service_role`, JWT secret, database URL, token Netlify o GitHub è stata rilevata con pattern ad alta confidenza nella working tree o nella storia Git raggiungibile. `gitleaks` non è installato nell'ambiente; la scansione equivalente ha coperto token OpenAI, JWT, URI Postgres, Netlify e GitHub.
- `.env` è ignorato e contiene `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`, riportate qui solo come `http…e.co` e `sb_p…eK5t`. Sono valori pubblicabili, non segreti. URL pubblici compaiono anche in documentazione. Nessun valore completo è riportato.
- La documentazione contiene solo un placeholder per `SUPABASE_SERVICE_ROLE_KEY`, non una chiave reale.
- L'audit iniziale ha rilevato `postcss` **moderate** e `undici` **high**, entrambi transitivi di tool di sviluppo. `npm audit fix` ha aggiornato rispettivamente a 8.5.25 e 7.29.0; l'audit finale riporta **0 vulnerabilità**.

## Decisioni di remediation

Le modifiche successive a questo report applicano i fix CRITICAL/HIGH minimi: RLS/RPC per il gioco, JWT e appartenenza alla partita per `resolve-round`, blocco signup, flag server-side di autorizzazione immagini e prenotazione quota atomica. Le Function restano fail-closed se policy, profilo o quota non sono verificabili.

## Impostazioni manuali obbligatorie

1. **Supabase Auth Dashboard:** disabilitare *Allow new users to sign up* e *Email signups*; conservare il login password per gli utenti esistenti; creare nuovi utenti solo con **Invite user**. Non eliminare utenti esistenti.
2. **Supabase Secrets:** impostare soltanto nel progetto `OPENAI_API_KEY` e/o `OPENAI_IMAGE_API_KEY`, i modelli, i limiti e le allowlist. Non inserire questi valori in Netlify o `VITE_*`.
3. **Supabase Edge Functions:** verificare che entrambe le Function abbiano JWT verification attiva dopo il deploy. Applicare una allowlist di origini Netlify se si sceglie di restringere CORS.
4. **Storage:** mantenere entrambi i bucket delle trasformazioni privati e senza policy browser di list/upload/read diretto.
5. **Netlify:** esporre solo le variabili `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` e flag non sensibili. Non configurare service-role, database URL o chiavi OpenAI come variabili di build.
6. **OpenAI:** impostare limiti di spesa/progetto e alert indipendenti come seconda linea di difesa; ruotare immediatamente qualunque chiave che venga scoperta in futuro nella storia Git.

## Checklist prima di riaprire la generazione immagini

- [ ] Migrazione di sicurezza applicata con esito positivo.
- [ ] Signup pubblico disabilitato nel Dashboard e UI di registrazione assente dal build.
- [ ] `can_generate_images` abilitato solo per gli utenti approvati, oppure UUID presente nell'allowlist server-side.
- [ ] `CREATURE_TRANSFORMATION_REAL_IMAGE_ENABLED=true` solo dopo aver impostato tutti i limiti e costi.
- [ ] `OPENAI_*` presente solo in Supabase Secrets, mai in `VITE_*`, bundle, repository o log.
- [ ] Function `generate-creature-transformation` restituisce 401 anonimo, 403 non autorizzato e 429 oltre quota.
- [ ] Function `resolve-round` rifiuta anonimi e non partecipanti.
- [ ] RLS verificata con due utenti distinti su richieste, immagini e partite.
- [ ] `npm test`, `npm run build`, `npm audit` e ispezione del bundle completati.

## Remediation applicata

La migration `202608050001_security_hardening.sql` chiude le policy gameplay MVP, revoca le scritture browser e aggiunge RPC `security definer` che derivano il profilo da `auth.uid()`. I dati delle partite storiche con `players.profile_id IS NULL` sono conservati ma non possono essere riaperti in sicurezza: richiedono un'associazione manuale al profilo corretto prima di diventare leggibili.

`resolve-round` ora richiede sia la verifica piattaforma (`verify_jwt = true`) sia una validazione `auth.getUser()` nel codice, quindi controlla che il chiamante sia un partecipante prima di usare `service_role`.

Per immagini REAL, la nuova riserva SQL è serializzata con advisory lock e applica: massimo **3 prenotazioni per utente/giorno** (più severo del massimo di 3 successi), massimo **10 prenotazioni globali/giorno**, massimo una in corso per utente, cooldown di 60 secondi e massimo 2 in corso globalmente. La fingerprint SHA-256 rende equivalente una richiesta con chiave diversa nello stesso giorno. Una prenotazione REAL viene mantenuta anche in caso di errore provider: può essere già costata denaro; non è quindi rimborsabile tramite retry.

L'autorizzazione è fail-closed: `profiles.can_generate_images = true` (non aggiornabile dal client) oppure UUID nella allowlist server-side `CREATURE_TRANSFORMATION_REAL_IMAGE_ALLOWED_PROFILE_IDS`. Il lookup del flag avviene con `service_role` dopo la validazione JWT e prima dell'orchestrazione.

## Comandi di deploy e verifica

Eseguire da una workstation amministrativa, con progetto Supabase già collegato:

```powershell
npx supabase link --project-ref <PROJECT_REF>
npx supabase db push
npx supabase functions deploy resolve-round
npx supabase functions deploy generate-creature-transformation
npm test
npm run build
npm audit
```

Prima del `db push` remoto, validare su un progetto/staging locale disposable (questo audit non ha potuto avviare Docker nel workspace corrente):

```powershell
npx supabase start
npx supabase db reset
npx supabase db lint --local
```

Configurare i secret solo nel runtime Supabase, mai in Netlify o in `.env` frontend:

```powershell
npx supabase secrets set OPENAI_API_KEY='<OPENAI_SERVER_SECRET>'
npx supabase secrets set OPENAI_IMAGE_API_KEY='<OPENAI_SERVER_SECRET>'
npx supabase secrets set CREATURE_TRANSFORMATION_REAL_IMAGE_ENABLED='false'
```

Quando il pilot sarà pronto, impostare anche i modelli/costi e i limiti; lasciare il pilot disabilitato finché non sono tutti presenti:

```powershell
npx supabase secrets set CREATURE_TRANSFORMATION_DAILY_REAL_IMAGE_LIMIT='3'
npx supabase secrets set CREATURE_TRANSFORMATION_GLOBAL_DAILY_REAL_IMAGE_LIMIT='10'
npx supabase secrets set CREATURE_TRANSFORMATION_GLOBAL_CONCURRENT_REAL_IMAGE_LIMIT='2'
npx supabase secrets set CREATURE_TRANSFORMATION_REAL_IMAGE_COOLDOWN_SECONDS='60'
npx supabase secrets set CREATURE_TRANSFORMATION_DAILY_BUDGET_USD='<MAX_DAILY_USD>'
```

Abilitare un singolo utente dal SQL Editor solo dopo aver verificato il suo UUID:

```sql
update public.profiles
set can_generate_images = true
where id = '<APPROVED_PROFILE_UUID>';

update public.auth_security_settings
set integer_value = 5
where setting_name = 'MAX_REGISTERED_USERS';
```

Procedure ripetibili post-deploy:

```powershell
# anonimo: deve restituire 401
Invoke-WebRequest -Method Post -Uri "$env:SUPABASE_URL/functions/v1/generate-creature-transformation" -ContentType 'application/json' -Body '{"operation":"GENERATE_CONCEPT"}'

# autenticato ma senza flag/allowlist: deve restituire 403 per REAL/AI
Invoke-WebRequest -Method Post -Uri "$env:SUPABASE_URL/functions/v1/generate-creature-transformation" -Headers @{ Authorization = "Bearer <USER_JWT>" } -ContentType 'application/json' -Body '<VALID_REAL_IMAGE_PAYLOAD>'

# ripetere richieste REAL con chiavi diverse: il quarto tentativo utente e l'undicesimo globale devono restituire 429.
# inviare due richieste concorrenti con la stessa idempotency key: verificare un solo provider_request_id nel ledger.
```

Nel Dashboard Supabase, dopo `db push`, selezionare `Authentication > Hooks`, configurare **Before User Created** con `public.hook_enforce_registered_user_limit`, quindi mantenere comunque il signup pubblico disabilitato. La configurazione del Dashboard hosted non è verificabile da questa repository.
