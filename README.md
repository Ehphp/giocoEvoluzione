# Gioco Evoluzione MVP

Prototype browser multiplayer 1v1 per testare rapidamente il dilemma `USE` vs `EVOLVE` su sei round condivisi con evento evolutivo sincronizzato.

## Cosa include

- React + TypeScript + Vite mobile-first.
- Motore puro e testabile in `src/game`.
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
3. Per il reset distruttivo dell ambiente di sviluppo, esegui nell ordine: `supabase/migrations/202607260001_reset_mvp_5_genes.sql`, `supabase/schema.sql`, `supabase/generated/game-rules.sql`, poi `supabase/migrations/202607280001_bot_difficulty.sql`.
4. Lo schema abilita anche la publication Realtime per `games`, `players`, `round_actions` e `round_results`.
5. Se stai usando un progetto già esistente, verifica comunque in Database > Replication che le quattro tabelle siano presenti.

## Deploy funzione edge

Assumendo di avere la CLI Supabase installata e il progetto linkato:

```bash
supabase functions deploy resolve-round
```

La funzione usa automaticamente `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` nel runtime Supabase.

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
7. Dopo sei round appare il vincitore finale.
8. Un refresh prova a ripristinare la partita tramite `localStorage`.

## Note operative

- Un tratto in cooldown non puo essere `USE`, ma puo essere `EVOLVE`.
- La scelta dell avversario non viene letta dal client finche non esiste `round_results`.
- Il sesto round assegna 2 punti.
- Non ci sono account, matchmaking pubblico o chat.

## Limiti noti dell MVP

- Le policy RLS sono intenzionalmente aperte per velocita di test tra amici.
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

## Bot e audit

- Le regole restano in `shared/game-rules`; `simulateMatch` richiama direttamente `resolveRound` e `resolveMatchOutcome`.
- Le policy disponibili sono `random`, `greedy-use`, `evolve-first`, `heuristic`, `lookahead-2` e policy parametriche usate dall'audit.
- La difficoltà partita contro bot è persistita: facile usa `random`, normale `heuristic`, difficile `lookahead-2`. Il lookahead considera azioni simultanee plausibili dell'avversario, non la sua scelta segreta.
- `npm run audit:metagame` genera `artifacts/audit/metagame.json` e `.md` con torneo seeded, statistiche, anomalie ed esempi riproducibili.
- `npm run audit:evolution` confronta lookahead 2/3/4 e la ricerca completa negli ultimi tre round; produce regret immediato di `EVOLVE`, controfattuali e metriche per gene in `artifacts/audit/evolution.*`.
