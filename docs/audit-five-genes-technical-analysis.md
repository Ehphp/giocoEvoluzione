# Audit tecnico — catalogo a cinque geni

## Stato iniziale e flusso ricostruito

Al momento dell'analisi non erano presenti le tre directory storiche
`artifacts/game-mechanics-audit`, `artifacts/game-mechanics-solver` e
`artifacts/catalog-search`: il refactor precedente le ha già rimosse. Il loro
sostituto era composto da `tools/audit-core.ts`, `audit-exact.ts`,
`audit-report.ts` e `audit-search.ts`, con output in `artifacts/audit`.

Il flusso precedente era:

1. `generateSequences()` allocava ricorsivamente tutte le 720 permutazioni.
2. `validateCatalog()` controllava il catalogo statico.
3. `audit-exact` risolveva ogni permutazione contro un avversario greedy,
   ricorsivamente, e rieseguiva il solver con livello massimo 2.
4. `audit-report` trasformava un JSON esistente in Markdown; non eseguiva un
   torneo di policy.
5. `audit-search` non generava cataloghi: ripeteva la validazione dello stesso
   catalogo 720 volte. Non c'erano ranking, checkpoint né screening.

Il motore reale in `shared/game-rules` resta l'autorità per punteggio,
cooldown, evoluzione e punti round. Il nuovo audit lo verifica in modo
differenziale e non replica le regole come fonte indipendente.

## Profiling controllato prima della modifica

`npm run audit:core` ha impiegato 2 ms. Il baseline esatto ha impiegato
**1.259 ms** per 720 sequenze e ha visitato **1.898.640** stati memoizzati
(incluso il secondo passaggio con livello 2). È sotto il target di tre secondi,
ma non è una base adeguata per valutare molti cataloghi.

## Colli di bottiglia e problemi metodologici

- Il solver creava `AuditAction[]`, oggetti azione e array candidati nel nodo
  ricorsivo; `legalActions`, `decodeState`, `getLevel`, `transition` e
  `actionValue` erano richiamati ripetutamente.
- Le azioni erano ordinate usando chiavi stringa e `indexOf`; le metriche usavano
  record stringa nel percorso caldo.
- Ogni permutazione riallocava due memo e rieseguiva due solve completi. Il
  secondo solve veniva usato soltanto per una metrica sul terzo evolve.
- La cache era densa ma includeva una codifica base-4 più un cooldown calcolato
  tramite divisioni; non precomputava livelli, legalità, transizioni o payoff.
- La generazione delle 720 sequenze allocava prefissi e restanti a ogni ramo.
- `audit:report` faceva I/O sincrono e dipendeva da un precedente output; lo
  screening non aveva checkpoint e non distingueva risultati approssimati.
- La fitness precedente non esisteva come funzione centrale: la search non
  confrontava candidati. Le metriche disponibili sovrapponevano valore/pick-rate
  senza separare equilibrio, profondità, informazione futura e robustezza.
- Il "solver esatto" è esatto solo contro una policy greedy fissata, non è un
  equilibrio simultaneo tra due agenti. Questo limite viene dichiarato nei
  risultati e non va interpretato come prova di bilanciamento PvP.

## Architettura introdotta

`tools/audit-core.ts` contiene lo stato a 13 bit: dieci bit (2 per ciascun
gene) per i livelli e tre per il cooldown. All'avvio costruisce typed array per
livelli, azioni legali, transizioni e payoff USE per evento/gene/livello.
`audit-exact` usa soltanto codici numerici nelle ricorsioni e restituisce sia
metriche raw sia cache hit/miss. `audit-search` valuta prima invarianti e un
campione deterministico, con bound per fermare candidati non competitivi; il
full audit è riservato ai migliori. `audit-report` esegue un torneo seeded tra
policy e genera JSON/Markdown. `audit-bench` è riproducibile e non produce una
nuova matrice.

La fitness è versionata e configurata in `audit-config.ts`; somma dimensioni
non sovrapposte, conservando sempre il breakdown e le metriche raw. I checkpoint
includono versione regole, fitness, seed, firma catalogo e configurazione di
screening; quelli incompatibili sono ignorati con un messaggio esplicito.
