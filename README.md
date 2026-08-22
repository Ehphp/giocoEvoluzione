# Gioco Evoluzione MVP

> **Working on the interface?** Read [`AGENTS.md`](AGENTS.md) first — it holds the rules the UI
> refactor established (design tokens, primitives, icons, assets, mobile layout, the overflow
> audit). The reasoning behind them is in [`docs/ui-design-system.md`](docs/ui-design-system.md).

Prototype browser multiplayer 1v1 per testare rapidamente il dilemma `USE` vs `EVOLVE` in un best-of-seven con evento evolutivo sincronizzato.

## Cosa include

- React + TypeScript + Vite mobile-first.
- Motore puro e testabile in `shared/game-rules`; `src/game` espone adapter frontend.
- Sincronizzazione stanza/partita tramite Supabase.
- Risoluzione round centralizzata e idempotente con Edge Function `resolve-round`.
- Reconnect minimo via `localStorage`.
- Placeholder creatura pronto per asset manuali in `public/assets/creatures/`.
- Modello `World` (visivo) separato da `Round Event` (scoring).

## Variabili di ambiente

Copia `.env.example` in `.env` e imposta:

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Creazione database

1. Crea un progetto Supabase.
2. Apri SQL Editor.
3. Per il reset distruttivo dell ambiente di sviluppo, esegui nell ordine: `supabase/migrations/202607260001_reset_mvp_5_genes.sql`, `supabase/schema.sql`, `supabase/generated/game-rules.sql`, `supabase/migrations/202607280001_bot_difficulty.sql`, poi `supabase/migrations/202607300001_exhaustion_adaptations.sql`.
4. Lo schema abilita anche la publication Realtime per `games`, `players`, `round_actions` e `round_results`.
5. Se stai usando un progetto già esistente, verifica comunque in Database > Replication che le quattro tabelle siano presenti.

## Deploy funzione edge

Assumendo di avere la CLI Supabase installata e il progetto linkato:

```bash
supabase functions deploy resolve-round
```

La funzione usa automaticamente `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` nel runtime Supabase. Prima del deploy imposta anche un segreto lungo e casuale per il sorteggio server-authoritative delle Combat Mutations:

```bash
supabase secrets set COMBAT_MUTATION_RNG_SECRET='<segreto-lungo-casuale>'
```

## Avvio locale

```bash
npm install
npm test
npm run build
npm run dev -- --host
```

Apri l indirizzo di rete mostrato da Vite sui due telefoni collegati alla stessa rete locale.

## Flusso di test con due telefoni

1. Telefono A apre la home, inserisce un nickname e tocca `Crea partita`.
2. Telefono A copia il codice stanza.
3. Telefono B apre la stessa URL, inserisce nickname e codice, poi entra.
4. Entrambi vedono round, punteggio, evento corrente e prossimo evento.
5. Ognuno seleziona un tratto e poi `Usa` oppure `Evolvi`.
6. Dopo la seconda conferma, il round viene risolto contemporaneamente.
7. La partita termina quando il punteggio e matematicamente irraggiungibile oppure alla durata programmata: 7 round di default, variabile tra 5 e 10 con Fine del mondo.
8. Un refresh prova a ripristinare la partita tramite `localStorage`.

## Note operative

- Un gene esaurito non puo essere `USE`; `EVOLVE` lo recupera e, sotto il livello massimo, ne aumenta anche il livello.
- La scelta dell avversario non viene letta dal client finche non esiste `round_results`.
- Ogni round vinto assegna 1 punto partita.
- L'accesso richiede un account esistente invitato da un amministratore; non esistono signup o matchmaking pubblici.

## Limiti noti dell MVP

- Le policy RLS limitano le letture di gioco ai partecipanti autenticati; le mutazioni passano da RPC controllate dal server.
- Non c e una rivincita completa.
- Il placeholder creatura non include asset reali.
- La risoluzione e idempotente per effetto della combinazione `unique round_results + update assoluti`, ma non introduce lock sofisticati.

## Comandi utili

```bash
npm test
npm run build
npm run dev
npm run audit:metagame
npm run audit:evolution
```

## Backfill display asset creature

Le visual version usano un PNG master immutabile e un WebP di visualizzazione separato. Applica prima la migrazione al progetto Supabase collegato, poi esegui il backfill in un ambiente protetto con le sole credenziali server:

```powershell
supabase db push
```

La migration richiesta è `202608070003_creature_display_assets.sql`; non avviare il backfill finché il deploy non è completato.

```bash
$env:SUPABASE_URL = 'https://<project-ref>.supabase.co' # Project Settings > API > Project URL, non l URL Dashboard
$env:SUPABASE_SERVICE_ROLE_KEY = '...'
npm run backfill:creature-display-assets -- --dry-run
npm run backfill:creature-display-assets
```

Il comando è idempotente: salta le versioni solo quando i metadati `display_*` sono completi e il WebP deterministico è presente nello Storage; altrimenti ripara lo stato senza modificare il master e continua dopo errori per singola versione. Usa `--force` solo per rigenerare esplicitamente ogni display asset sullo stesso path deterministico.

## Bot e audit

- Le regole restano in `shared/game-rules`; `simulateMatch` richiama direttamente `resolveRound` e `resolveMatchOutcome`.
- Le policy disponibili sono `random`, `greedy-use`, `evolve-first`, `heuristic`, `lookahead-2` e policy parametriche usate dall'audit.
- La difficoltà partita contro bot è persistita: facile usa `random`, normale `heuristic`, difficile `lookahead-2`. Il lookahead considera azioni simultanee plausibili dell'avversario, non la sua scelta segreta.
- `npm run audit:metagame` genera `artifacts/audit/metagame.json` e `.md` con torneo seeded, statistiche, anomalie ed esempi riproducibili.
- `npm run audit:evolution` confronta lookahead 2/3/4 e la ricerca completa negli ultimi tre round; produce regret immediato di `EVOLVE`, controfattuali e metriche per gene in `artifacts/audit/evolution.*`.
