# Audit sistemico della meccanica di Gioco Evoluzione

Data audit: 25 luglio 2026  
Ambito: meccanica produttiva corrente, test, bot, persistenza e duplicazione nella Edge Function  
Codice produttivo modificato: **no**

## Executive summary

La meccanica funziona tecnicamente nel percorso normale, ma oggi produce soprattutto tre decisioni:

1. scegliere il gene con il bonus evento più alto;
2. decidere quante azioni `EVOLVE` investire sul gene migliore del round finale;
3. evitare di usare lo stesso gene in due round consecutivi.

La maggior parte degli altri geni e delle altre informazioni è rumore. L'evento vale normalmente `+4`, mentre un'azione `EVOLVE` vale `+1` livello e rinuncia al round corrente. Questo rende i livelli troppo deboli per competere con l'evento, tranne come tie-break fra due copie dello stesso gene favorito. Il doppio punto del round 6 concentra proprio lì il ritorno dell'investimento e crea una scala ciclica di “una evoluzione in più dell'avversario”.

Il risultato non è una singola strategia pura imbattibile contro tutto, ma un meta degenerativo:

- contro il bot casuale, usare sempre il miglior gene corrente ha vinto il **100%** di 4.000 partite di benchmark;
- contro quella policy greedy, evolvere una volta il gene favorito del round 6 ha ottenuto **89% vittorie, 11% pareggi, 0% sconfitte**;
- due evoluzioni battono una, tre battono due, fino a cinque che battono quattro;
- zero evoluzioni battono però quattro e cinque evoluzioni nel **100%** del campione.

Questa ciclicità non nasce dalla ricchezza dei dieci geni: nasce quasi interamente dal valore doppio del round finale.

Esistono inoltre due problemi tecnici critici per una partita competitiva reale:

- le scelte non sono veramente segrete perché `round_actions` è pubblicamente leggibile;
- l'intera sequenza degli eventi è presente nel record `games`, anch'esso pubblicamente leggibile;
- frontend ed Edge Function risolvono diversamente un `USE` in cooldown.

## 1. Verdetto sintetico

| Dimensione | Voto | Sintesi |
|---|---:|---|
| Profondità strategica | 4/10 | Esiste lettura dell'avversario, ma è compressa nel conteggio di `EVOLVE` sul round finale. |
| Chiarezza delle decisioni | 6/10 | Formula semplice, ma rarità/intensità non fanno nulla e livello mostrato non equivale sempre a livello effettivo. |
| Varietà | 3/10 | Dieci geni nominali, ma pochi geni sono competitivi e ogni partita usa gli stessi sei eventi. |
| Bilanciamento | 3/10 | Geni con totali evento da `+6` a `-6`; bot estremamente debole; round 6 sovrappesato. |
| Possibilità di comeback | 7/10 | Il round finale può ribaltare uno svantaggio di un punto, ma lo fa in modo molto prevedibile. |
| Rischio di strategia dominante | 8/10 | Alto. Non c'è una policy pura universale, ma greedy e investimento finale dominano ampie classi di avversari. |
| Rigiocabilità | 4/10 | Solo 720 ordini possibili degli stessi sei eventi; rarità e intensità non cambiano il gioco. |

Nota sul voto “rischio di strategia dominante”: 10 significa rischio massimo. La mancanza di una singola strategia imbattibile non salva il sistema, perché il meta trovato è un ciclo poco espressivo di conteggio degli investimenti.

## 2. Ricostruzione precisa del loop attuale

### 2.1 Setup

- La partita dura `TOTAL_ROUNDS = 6`.
- Tutti i dieci geni partono da `{ level: 0, cooldown: 0 }`.
- Il catalogo contiene esattamente sei eventi.
- La sequenza è una permutazione senza duplicati di quei sei eventi.
- Di conseguenza ogni partita usa **tutti e sei gli eventi esattamente una volta**; cambia solo l'ordine.
- PVP genera la sequenza nel client con `src/game/config.ts:generateRoundEventSequence`.
- VS Bot genera la stessa lista in SQL con `public.generate_round_event_sequence`.

Le proprietà `rarity` e `intensity` sono metadati: non entrano nella generazione né nello scoring.

### 2.2 Scelta segreta

Ogni giocatore sceglie:

- un gene;
- `USE` oppure `EVOLVE`.

L'intenzione di design è simultanea e segreta. Nell'implementazione reale:

- l'azione viene inserita immediatamente in `round_actions`;
- la UI legge solo la propria azione;
- la policy RLS `"public actions read"` permette però a qualunque client anonimo di leggere anche quella avversaria.

Quindi la segretezza è solo di interfaccia, non di protocollo.

### 2.3 Formula di `USE`

In `src/game/scoring.ts:getValidatedTraitUseBreakdown`:

```text
effectiveLevel = min(level, 5)
eventContribution = somma(modifier del gene) × 2
roundValue(USE) = effectiveLevel + eventContribution
```

I valori evento possibili oggi sono:

- effetto `+2` → contributo `+4`;
- effetto `+1` → contributo `+2`;
- effetto `-1` → contributo `-2`;
- effetto `-2` → contributo `-4`;
- nessun effetto → `0`.

Un `USE` è legale soltanto se il cooldown del gene è zero.

### 2.4 Formula di `EVOLVE`

`EVOLVE`:

- assegna valore round `0`;
- incrementa di `1` il livello del gene scelto;
- è sempre legale, anche se quel gene è in cooldown;
- non assegna cooldown al gene.

Il livello memorizzato può superare 5, ma lo scoring usa al massimo 5. Il test `new-traits-scoring.test.ts` conferma esplicitamente che livello 6 e livello 5 hanno lo stesso contributo.

### 2.5 Cooldown

All'inizio della risoluzione dell'azione vengono diminuiti di uno tutti i cooldown. La legalità di `USE` è però controllata sullo stato precedente al tick.

Effetto pratico:

- gene usato al round N → cooldown 1 nello stato risultante;
- non può essere usato al round N+1;
- dopo qualunque azione al round N+1 torna a cooldown 0;
- può essere riusato al round N+2.

Il cooldown non limita `EVOLVE`.

### 2.6 Risoluzione e punti

- `EVOLVE` vale sempre `0`.
- Il valore maggiore vince il round.
- Il pareggio assegna zero punti a entrambi.
- Round 1–5: il vincitore prende 1 punto.
- Round 6: il vincitore prende 2 punti.
- Punteggio massimo distribuito senza pareggi: 7.
- A fine round 6 vince chi ha più punti; parità di punti significa nessun vincitore.

### 2.7 Bot

`src/game/bot.ts:selectRandomBotAction` estrae uniformemente fra:

- 10 azioni `EVOLVE`, sempre presenti;
- 9 o 10 azioni `USE`, secondo il cooldown.

Il bot evolve quindi circa metà delle volte senza considerare evento, livello, round finale o punteggio.

## 3. Metodo di simulazione

È stata aggiunta una suite isolata in:

- `artifacts/game-mechanics-audit/simulation.test.ts`
- `artifacts/game-mechanics-audit/vitest.config.ts`
- risultati grezzi in `artifacts/game-mechanics-audit/results.json`

La suite:

- importa direttamente `resolveRound`, il catalogo eventi e le costanti produttive;
- non reimplementa lo scoring;
- usa PRNG deterministico;
- specchia i match fra slot 1 e slot 2;
- è esclusa dalla suite ordinaria;
- si abilita solo con `RUN_GAME_MECHANICS_AUDIT=1`;
- ha simulato **102.000 partite**:
  - 40.000 benchmark contro random;
  - 44.000 partite round-robin;
  - 18.000 partite dedicate alla scala da 0 a 5 evoluzioni.

Comando:

```powershell
$env:RUN_GAME_MECHANICS_AUDIT='1'
npm test -- --config artifacts/game-mechanics-audit/vitest.config.ts
```

Strategie incluse:

- casuale;
- massimo valore immediato;
- evoluzione del gene finale nei primi N round, per N da 1 a 5;
- una evoluzione sul gene con maggiore affinità futura;
- massimizzazione assoluta del round finale;
- evitamento di ogni valore negativo;
- pianificazione dell'intera sequenza per massimizzare il valore pesato dei `USE`;
- valutazione di tutte le possibili risposte legali avversarie nel round.

Limite metodologico: il torneo confronta policy esplicite e una scala esaustiva dell'exploit principale, ma non calcola un equilibrio di Nash misto dell'intero gioco stocastico. I risultati bastano a falsificare l'ipotesi di equilibrio corrente e a dimostrare exploit concreti; non costituiscono una prova di ottimalità globale di una singola policy.

## 4. Risultati quantitativi

### 4.1 Benchmark contro il bot casuale

| Strategia | Win | Draw | Loss | Score medio | USE medi | EVOLVE medi |
|---|---:|---:|---:|---:|---:|---:|
| Random | 37,55% | 23,35% | 39,10% | 1,172–1,208 | 2,925 | 3,075 |
| Greedy immediata | **100%** | 0% | 0% | **6,560–0,081** | 6 | 0 |
| 1 evolve sul gene finale | **100%** | 0% | 0% | 5,780–0,134 | 5 | 1 |
| 2 evolve sul gene finale | **100%** | 0% | 0% | 4,911–0,231 | 4 | 2 |
| 3 evolve sul gene finale | 99,85% | 0,15% | 0% | 4,035–0,349 | 3 | 3 |
| Una evolve sul favorito futuro | **100%** | 0% | 0% | 5,777–0,144 | 5 | 1 |
| 5 evolve, solo round finale | 89,65% | 9,55% | 0,80% | 2,284–0,621 | 1 | 5 |
| Evita penalità | 58,00% | 19,70% | 22,30% | 1,663–0,814 | 6 | 0 |
| Full-sequence USE planner | **100%** | 0% | 0% | 6,571–0,071 | 6 | 0 |
| Response-aware | **100%** | 0% | 0% | 6,560–0,081 | 6 | 0 |

La differenza fra random e greedy è estrema:

- +62,45 punti percentuali di vittoria rispetto al random del benchmark;
- +6,479 di differenziale medio contro il bot random;
- il bot avversario segna in media solo 0,081 punti contro greedy.

Il bot non è un banco di prova del bilanciamento: è quasi un bersaglio passivo.

### 4.2 Conoscere tutta la sequenza

Il pianificatore full-sequence ottiene contro random:

- score medio 6,571 contro 6,560 della greedy immediata;
- solo +0,011 punti medi;
- 11% vittorie e 89% pareggi nello scontro diretto con la greedy immediata.

La conoscenza futura ha quindi poco valore per ottimizzare la pura rotazione dei `USE`: quasi ogni evento offre un gene diverso da `+4`.

La stessa conoscenza diventa invece decisiva per l'exploit del round finale:

- una evoluzione anticipata del gene finale contro greedy: **89% vittorie, 11% pareggi, 0 sconfitte**.

### 4.3 Scala delle evoluzioni finali

Nella tabella seguente ogni cella è la percentuale di vittoria della strategia di riga contro quella di colonna; `E0` significa zero evoluzioni iniziali, `E5` significa cinque.

|  | E0 | E1 | E2 | E3 | E4 | E5 |
|---|---:|---:|---:|---:|---:|---:|
| **E0** | 0% | 0% | 0% | 85% | 100% | 100% |
| **E1** | 100% | 0% | 0% | 0% | 90,4% | 100% |
| **E2** | 22,8% | 100% | 0% | 0% | 0% | 98,2% |
| **E3** | 1,4% | 15% | 100% | 0% | 0% | 0% |
| **E4** | 0% | 0% | 8,2% | 100% | 0% | 0% |
| **E5** | 0% | 0% | 0% | 1,8% | 100% | 0% |

I pareggi, omessi dalla tabella, spiegano le celle in cui vittoria e sconfitta non sommano al 100%.

Pattern principale:

```text
E1 batte E0
E2 batte E1
E3 batte E2
E4 batte E3
E5 batte E4
E0 batte E4 ed E5
```

Non esiste quindi un numero ottimale fisso di `EVOLVE`. Esiste un gioco ciclico di “salire di uno” sull'investimento previsto, finché il costo dei round sacrificati supera i due punti finali.

### 4.4 Peso reale dei round

Peso nominale massimo:

- ciascuno dei round 1–5: `1/7 = 14,29%`;
- round 6: `2/7 = 28,57%`.

Quota empirica dei punti decisivi contro random:

| Strategia | R1 | R2 | R3 | R4 | R5 | R6 |
|---|---:|---:|---:|---:|---:|---:|
| Random | 11,60% | 12,33% | 13,61% | 14,39% | 16,01% | **32,06%** |
| Greedy | 14,26% | 14,25% | 14,15% | 14,34% | 14,33% | **28,67%** |
| 1 evolve finale | 2,41% | 16,10% | 15,97% | 16,20% | 15,87% | **33,46%** |
| 3 evolve finale | 3,25% | 3,68% | 4,21% | 21,85% | 21,40% | **45,61%** |
| 5 evolve finale | 4,91% | 5,56% | 6,35% | 7,06% | 7,28% | **68,85%** |

Fra random, la rimozione del round finale cambia l'esito della partita nel 24,7% dei casi; i singoli round precedenti sono pivotali fra 12,75% e 16,4%.

Il round finale non rende inutili matematicamente tutti gli altri round, ma sposta in modo sufficiente il ritorno di `EVOLVE` da creare l'intero exploit osservato.

### 4.5 Frequenza dei geni

Contributi evento totali sulla sequenza completa:

| Gene | Contributi nei 6 eventi | Totale | Eventi positivi | Eventi negativi |
|---|---|---:|---:|---:|
| STRENGTH | 0, -2, 0, 0, -2, -2 | **-6** | 0 | 3 |
| RESISTANCE | +4, 0, 0, 0, 0, 0 | +4 | 1 | 0 |
| AGILITY | 0, 0, +4, 0, 0, 0 | +4 | 1 | 0 |
| PERCEPTION | -2, +4, 0, 0, 0, 0 | +2 | 1 | 1 |
| METABOLISM | -2, 0, 0, +4, +4, 0 | **+6** | 2 | 1 |
| ADAPTATION | 0, 0, 0, 0, +2, 0 | +2 | 1 | 0 |
| GRIP_CLAWS | 0, 0, 0, 0, 0, +2 | +2 | 1 | 0 |
| CAMOUFLAGE | 0, +2, +4, 0, 0, 0 | **+6** | 2 | 0 |
| WEBBED_LIMBS | 0, 0, 0, +2, 0, +4 | **+6** | 2 | 0 |
| FAT_RESERVES | 0, 0, -2, -4, 0, 0 | **-6** | 0 | 2 |

Selezioni della greedy contro random:

| Gene | Quota azioni |
|---|---:|
| METABOLISM | **28,12%** |
| WEBBED_LIMBS | 18,73% |
| RESISTANCE | 16,67% |
| AGILITY | 16,67% |
| PERCEPTION | 16,67% |
| ADAPTATION | 2,63% |
| GRIP_CLAWS | 0,53% |
| STRENGTH | **0%** |
| CAMOUFLAGE | 0% |
| FAT_RESERVES | **0%** |

Il dato 0% di CAMOUFLAGE dipende dal tie-break deterministico della simulazione: contro i predatori CAMOUFLAGE e AGILITY valgono entrambi +4, ma l'ordine del catalogo sceglie AGILITY. I due geni sono equivalenti in quel caso.

STRENGTH e FAT_RESERVES sono invece sistemicamente deboli:

- non hanno alcun evento positivo;
- hanno totale evento -6;
- evolverli non apre nessuna finestra unica;
- a parità di livello esiste sempre un gene neutro o positivo migliore.

### 4.6 Pareggi, slot e varietà

- Bilanciamento slot sulle 84.000 partite specchiate di benchmark e round-robin:
  - slot 1: **50%** delle partite decisive;
  - slot 2: **50%**.
- Non esiste vantaggio del primo slot nella funzione di risoluzione.
- Random contro random:
  - pareggio partita 23,35%;
  - pareggio round 66,69%.
- Greedy contro la stessa greedy: 100% pareggi partita.
- Greedy contro response-aware: 100% pareggi partita.
- Greedy contro full-sequence: 89% pareggi, 11% sconfitte.

Varietà apparente:

- greedy ha 419 sequenze d'azione vincenti osservate contro random;
- entropia 8,428 bit;
- nessuna sequenza singola supera 0,85% delle vittorie.

Questa varietà deriva soprattutto dalle 720 permutazioni degli eventi. La regola usata in ogni round resta quasi sempre “scegli il +4”.

All'estremo opposto, la strategia con cinque evoluzioni ha soltanto cinque pattern vincenti rilevati e il più comune rappresenta il 39,88% delle vittorie:

```text
EVOLVE METABOLISM ×5 → USE METABOLISM
```

## 5. Problemi trovati

### P1 — Le scelte segrete non sono segrete

- **Tipo:** bug tecnico / integrità competitiva
- **Gravità:** critica
- **Causa:** l'azione è salvata in chiaro prima della scelta avversaria e la RLS consente lettura pubblica di `round_actions`.
- **Esempio:** P1 invia `EVOLVE`; P2 interroga `round_actions`, vede valore 0 e sceglie qualunque `USE` positivo per prendere il round.
- **Abuso esperto:** un client modificato può giocare sistematicamente da secondo decisore pur mantenendo l'apparenza di scelta simultanea.
- **File/funzioni:** `src/lib/game-api.ts:submitRoundAction`; `supabase/schema.sql`, policy `"public actions read"` e `"public actions insert"`.

Questo problema rende secondaria qualunque analisi di equilibrio finché non viene risolto con commit/reveal o con azioni server-private.

### P2 — L'intera sequenza futura è esposta

- **Tipo:** bug di informazione / problema di game design
- **Gravità:** alta
- **Causa:** `GameRecord.round_event_sequence` contiene tutti i sei ID e `games` è pubblicamente leggibile.
- **Esempio:** se `FLASH_FLOOD` è al round 6, un giocatore può evolvere WEBBED_LIMBS dal round 1 e preservarlo al round 5.
- **Abuso esperto:** la policy `E1` usa esattamente questa informazione e batte greedy nell'89% dei confronti, pareggiando il resto.
- **File/funzioni:** `src/lib/game-api.ts:mapGameRecord`, `fetchGameSnapshot`; `supabase/schema.sql`, policy `"public games read"`.

La UI mostra corrente e successivo, ma il payload contiene l'intera sequenza. Nascondere elementi visivi non nasconde dati di protocollo.

### P3 — Doppio punto finale genera un'asta degenerativa di EVOLVE

- **Tipo:** problema di bilanciamento e game design
- **Gravità:** alta
- **Causa matematica:** una evoluzione extra costa tipicamente un punto in un round normale ma può vincere un confronto finale che vale due.
- **Esempio concreto:**
  - sequenza: Ash, Eclipse, Predators, Heat, Nutrient, Flood;
  - E0 usa sempre il favorito;
  - E1 evolve WEBBED_LIMBS al round 1;
  - E0 prende 1 punto al round 1;
  - i round intermedi pareggiano;
  - E1 usa WEBBED_LIMBS livello 1 contro livello 0 al round 6 e prende 2 punti;
  - risultato: E1 vince 2–1.
- **Abuso esperto:** prevedere l'investimento avversario e investirne esattamente uno in più.
- **File/funzioni:** `src/game/config.ts:FINAL_ROUND_POINTS`; `src/game/engine.ts:getRoundPoints`; duplicato in `supabase/functions/resolve-round/index.ts:buildResolution`.

Il pattern è ciclico, non auto-bilanciante: E1 batte E0, E2 batte E1, …, ma E0 batte E4/E5.

### P4 — L'evento conta troppo rispetto al livello

- **Tipo:** problema di bilanciamento
- **Gravità:** alta
- **Causa matematica:** `EVENT_WEIGHT = 2`; il bonus principale vale +4, cioè quattro azioni `EVOLVE`.
- **Esempio:** gene neutro livello 3 vale 3 e perde ancora contro gene favorito livello 0 che vale 4.
- **Abuso esperto:** ignorare quasi tutti i livelli e scegliere il `+4`; usare il livello solo per rompere lo specchio sullo stesso favorito.
- **File/funzioni:** `src/game/round-events.ts:ROUND_EVENT_WEIGHT`; `src/game/scoring.ts:getValidatedTraitUseBreakdown`; duplicato Edge Function.

La greedy produce valori medi fra 3,83 e 4,00 in ogni round senza evolvere mai.

### P5 — Rarità e intensità sono false promesse

- **Tipo:** problema di chiarezza e game design
- **Gravità:** alta
- **Causa:** catalogo di sei eventi, partita di sei round, pescata senza ripetizione; `rarity` e `intensity` non influenzano né frequenza né formula.
- **Esempio:** `PROLONGED_ECLIPSE` è `RARE`, ma compare nel 100% delle partite, esattamente come ogni evento `COMMON`.
- **Abuso esperto:** nessuno nel singolo match; sul lungo periodo elimina sorpresa, deck reading e identità delle rarità.
- **File/funzioni:** `src/game/types.ts:RoundEventDefinition`; `src/game/round-events.ts:generateRoundEventSequence`; generatore SQL duplicato.

### P6 — Due geni sono quasi sempre scelte-trappola

- **Tipo:** problema di bilanciamento
- **Gravità:** alta
- **Causa matematica:** STRENGTH e FAT_RESERVES hanno totale evento -6 e zero eventi positivi.
- **Esempio:** in `HEAT_SPIKE`, FAT_RESERVES livello 0 vale -4; `EVOLVE` vale 0 e qualunque gene neutro vale 0.
- **Abuso esperto:** un giocatore competente non li seleziona; un principiante viene punito per una scelta tematicamente plausibile.
- **File/funzioni:** `src/game/round-events.ts:ROUND_EVENT_DEFINITIONS`.

Il problema non è soltanto la somma: nessuno dei due possiede una nicchia positiva che giustifichi investirvi.

### P7 — Il cooldown crea quasi solo rotazione obbligata

- **Tipo:** problema di game design
- **Gravità:** media
- **Causa sistemica:** ci sono dieci geni e in quasi ogni evento un favorito diverso; il blocco dura un solo round.
- **Esempio:** RESISTANCE, PERCEPTION, AGILITY, METABOLISM e WEBBED_LIMBS coprono cinque famiglie di eventi senza conflitti, salvo l'adiacenza Heat/Nutrient su METABOLISM.
- **Abuso esperto:** pianificare soltanto l'eventuale coppia consecutiva dei due eventi METABOLISM; il resto è automatico.
- **File/funzioni:** `src/game/engine.ts:isTraitUsable`, `tickCooldowns`, `resolvePlayerAction`.

Il full-sequence planner migliora di appena 0,011 punti medi la greedy contro random.

### P8 — Il livello massimo 5 è quasi irrilevante

- **Tipo:** problema di chiarezza e progressione
- **Gravità:** media
- **Causa:** in sei round si può usare un gene a livello 5 soltanto evolvendolo nei primi cinque round e usandolo nel sesto.
- **Esempio:** E5 termina con un solo `USE`, valore 9 sul favorito finale, ma perde contro E0 nel 100% della scala simulata.
- **Abuso esperto:** il cap non guida decisioni normali; serve quasi soltanto a definire l'estremo dell'asta finale.
- **File/funzioni:** `src/game/config.ts:MAX_EFFECTIVE_TRAIT_LEVEL`; `src/game/scoring.ts`; test `new-traits-scoring.test.ts`.

È possibile finire a livello memorizzato 6 evolvendo per sei round, anche se il livello effettivo resta 5.

### P9 — Penalità e valori negativi generano opzioni morte

- **Tipo:** problema di game design
- **Gravità:** media
- **Causa:** un `EVOLVE` vale 0 e sono sempre disponibili molti geni neutrali da 0; un `USE` negativo è quindi dominato.
- **Esempio:** FAT_RESERVES in Heat vale -4; usare un gene neutro vale 0 e non comporta costo futuro significativo.
- **Abuso esperto:** evitare sempre i malus. La strategia “evita penalità” batte random 58%, ma perde il 100% contro tutte le policy ottimizzate principali.
- **File/funzioni:** `src/game/scoring.ts`; `src/game/engine.ts:resolveRound`.

Le penalità comunicano tema, ma oggi non producono il dilemma “accetto un danno per un beneficio”: producono soltanto carte da non premere.

### P10 — Le policy simmetriche collassano in pareggi

- **Tipo:** problema di varietà competitiva
- **Gravità:** media
- **Causa:** informazione e stato simmetrici, risoluzione deterministica e nessun punto assegnato sui pareggi.
- **Esempio:** greedy contro greedy e response-aware contro greedy terminano in pareggio nel 100% del campione.
- **Abuso esperto:** adottare la policy meta impedisce all'avversario di ottenere vantaggio, finché qualcuno non entra nell'asta di EVOLVE.
- **File/funzioni:** `src/game/engine.ts:resolveRound`.

### P11 — Il bot casuale non allena né misura il giocatore

- **Tipo:** problema di game design / AI
- **Gravità:** critica per la modalità VS Bot
- **Causa:** selezione uniforme su circa venti azioni, metà delle quali `EVOLVE`, senza leggere l'evento.
- **Esempio:** il bot fa in media 3,075 `EVOLVE` a partita; contro greedy segna 0,081 punti medi.
- **Abuso esperto:** greedy ha vinto il 100% delle 4.000 partite di benchmark.
- **File/funzioni:** `src/game/bot.ts:getLegalBotActions`, `selectRandomBotAction`; `src/game/vs-bot-round.ts`.

### P12 — Frontend ed Edge Function divergono sul cooldown

- **Tipo:** bug tecnico
- **Gravità:** alta
- **Causa:** il frontend lancia un errore su `USE` in cooldown; la Edge Function trasforma silenziosamente quell'azione in valore 0.
- **Esempio:** AGILITY usata al round 1 e inviata di nuovo come `USE` al round 2:
  - `src/game/engine.ts` → eccezione;
  - Edge Function → roundValue 0, breakdown azzerato, nessuna eccezione.
- **Abuso esperto:** un client modificato può inserire un'azione che il frontend considera impossibile e ottenere una risoluzione server diversa da test e anteprima.
- **File/funzioni:** `src/game/engine.ts:resolvePlayerAction`; `supabase/functions/resolve-round/index.ts:resolvePlayerAction`.

### P13 — Regole duplicate con rischio concreto di drift

- **Tipo:** debito tecnico / integrità
- **Gravità:** alta
- **Causa:** la Edge Function duplica:
  - lista geni;
  - sei definizioni evento;
  - peso evento;
  - cap livello;
  - formula scoring;
  - cooldown;
  - evoluzione;
  - punti del round finale.
- **Esempio:** la divergenza del cooldown è già presente; una futura modifica a un evento richiede aggiornare almeno TypeScript client, Edge Function e talvolta SQL.
- **Abuso esperto:** non è un exploit strategico in sé, ma può creare client preview e risultato server incompatibili.
- **File/funzioni:** `src/game/*`; `supabase/functions/resolve-round/index.ts`; `supabase/schema.sql`; `supabase/migrations/202607220003_vs_bot_mode.sql`.

### P14 — Le policy database consentono manomissione oltre il game design

- **Tipo:** bug tecnico / sicurezza
- **Gravità:** critica
- **Causa:** lettura e scrittura pubbliche su games, players e round_actions; commento nello schema le definisce intenzionali per l'MVP.
- **Esempio:** un client anonimo può tentare aggiornamenti diretti di punteggi, sequenza, stato partita o tratti.
- **Abuso esperto:** altera il risultato senza neppure passare dalla meccanica.
- **File/funzioni:** `supabase/schema.sql`, policy RLS pubbliche.

È fuori dal bilanciamento puro, ma impedisce di definire la modalità PVP come competitiva.

## 6. Strategie dominanti e piano di gioco consigliato oggi

### Contro il bot o un principiante

Piano quasi ottimale e molto semplice:

1. non usare mai un gene con valore negativo;
2. usa il gene col valore immediato più alto;
3. se il migliore è in cooldown, usa il secondo migliore;
4. non evolvere.

Risultato misurato contro random:

- 100% vittorie;
- 6,560 punti medi contro 0,081;
- 6 `USE`, 0 `EVOLVE`.

### Contro un giocatore greedy

1. leggi la sequenza completa;
2. identifica un gene da `+4` nell'evento del round 6;
3. evolvilo una volta al round 1;
4. usa i favoriti nei round 2–5;
5. non usare il gene finale al round 5;
6. usalo al round 6.

Risultato misurato:

- 89% vittorie;
- 11% pareggi;
- 0% sconfitte.

### Contro un avversario esperto

Non esiste una policy pura fissa dimostrata dominante. La best response dipende dal numero di evoluzioni finali previsto:

- se prevedi E0, scegli E1;
- se prevedi E1, scegli E2;
- e così via;
- se prevedi E4/E5, torna a E0 e raccogli i round sacrificati.

Questa è varietà di meta, ma non varietà di espressione: il fulcro resta un solo gene e un solo conteggio.

## 7. Migliorie proposte

## 7.1 Low impact — costanti e formule

### L1 — Portare il round finale a 1 punto

- **Problema risolto:** asta ciclica sulle evoluzioni finali.
- **Modifica:** `FINAL_ROUND_POINTS = 1`.
- **Comportamento previsto:** una evoluzione extra costa un round e può al massimo recuperare un round finale; non genera più automaticamente un saldo +1.
- **Costo tecnico:** basso, ma va applicato anche alla Edge Function.
- **Rischio:** meno comeback; più partite 3–3.
- **Test necessari:** punteggio finale, distribuzione pareggi, scala E0–E5, Edge parity.
- **Priorità:** **P0**.

### L2 — Portare `EVENT_WEIGHT` da 2 a 1

- **Problema risolto:** irrilevanza dei livelli.
- **Modifica:** `roundValue = modifier + effectiveLevel`.
- **Comportamento previsto:** due evoluzioni possono pareggiare un bonus principale +2; un livello può cambiare un confronto fra bonus principale e secondario.
- **Costo tecnico:** basso.
- **Rischio:** EVOLVE può diventare troppo forte se combinato con eventi ripetuti.
- **Test necessari:** matrici USE/EVOLVE per livello 0–3; simulazione ROI per ogni gene.
- **Priorità:** **P0**, da testare insieme a L1.

### L3 — Cap livello a 3

- **Problema risolto:** cap 5 quasi irraggiungibile e livello memorizzato oltre cap.
- **Modifica:** `MAX_EFFECTIVE_TRAIT_LEVEL = 3`; impedire anche incrementi memorizzati oltre 3.
- **Comportamento previsto:** obiettivo leggibile e raggiungibile senza spendere quasi tutta la partita.
- **Costo tecnico:** basso.
- **Rischio:** evoluzioni al cap diventano azioni morte; devono essere disabilitate.
- **Test necessari:** legalità EVOLVE al cap, normalizzazione dati legacy, preview/client/server.
- **Priorità:** P1.

### L4 — Ribilanciare la matrice eventi

- **Problema risolto:** STRENGTH e FAT_RESERVES morti; METABOLISM/CAMOUFLAGE/WEBBED_LIMBS sovraesposti.
- **Modifica:** ogni gene deve avere, nel catalogo completo, almeno:
  - una nicchia positiva;
  - non più di una differenza di 1 nel numero di bonus principali rispetto agli altri;
  - totale affinità entro una banda comune.
- **Comportamento previsto:** investimenti leggibili in tutti i geni.
- **Costo tecnico:** basso sul codice, medio sul content design.
- **Rischio:** omogeneizzazione e perdita di identità.
- **Test necessari:** audit automatico delle somme e delle frequenze; simulazione pick-rate.
- **Priorità:** **P0**.

## 7.2 Medium impact — nuove regole compatibili con l'architettura

### M1 — Mostrare solo evento corrente e prossimo

- **Problema risolto:** pianificazione deterministica del round finale.
- **Regola:** il server conserva la sequenza, il client riceve soltanto gli eventi N e N+1.
- **Comportamento previsto:** EVOLVE diventa una previsione informata a un round, non un investimento certo da cinque round.
- **Costo tecnico:** medio; richiede proiezione server e policy dati.
- **Rischio:** frustrazione se gli eventi sembrano casuali e l'investimento non trova uso.
- **Test necessari:** payload privacy, reconnect, spettatori, Edge resolution, assenza di leak.
- **Priorità:** **P0** per PVP.

Con soli sei eventi tutti usati, un giocatore può comunque dedurre gli ultimi eventi per esclusione. Va abbinata a M2.

### M2 — Catalogo di almeno 12 eventi, pescata di 6

- **Problema risolto:** rarità fittizia e sequenze troppo prevedibili.
- **Regola:** 12+ eventi; una partita ne usa 6 senza ripetizione; probabilità pesate per rarità.
- **Comportamento previsto:** deck reading reale, maggiore rigiocabilità, investimenti non garantiti.
- **Costo tecnico:** medio per contenuti e test.
- **Rischio:** varianza e match sfavorevoli; serve bilanciamento per famiglie di geni.
- **Test necessari:** distribuzione rarità su almeno un milione di draw; copertura geni per sequenza; seed/reconnect.
- **Priorità:** P1.

### M3 — Assegnare 1 punto a ogni round e tie-break sul valore totale

- **Problema risolto:** round finale sovrappesato e pareggi di match.
- **Regola:** tutti i round valgono 1; in caso di 3–3 vince la somma dei sei `roundValue`; ulteriore parità resta draw.
- **Comportamento previsto:** consistenza premiata senza introdurre un'altra valuta durante il match.
- **Costo tecnico:** medio; occorre persistere/derivare il totale.
- **Rischio:** valori estremi possono dominare il tie-break.
- **Test necessari:** valori negativi, reconnect, idempotenza, pareggi.
- **Priorità:** P1.

### M4 — Bot euristico con tre profili

- **Problema risolto:** VS Bot non rappresentativa.
- **Regola:**
  - Facile: 60% greedy, 40% random;
  - Medio: greedy con gestione cooldown e 20% bluff EVOLVE;
  - Difficile: utility su evento corrente/prossimo e stato del punteggio.
- **Comportamento previsto:** apprendimento graduale e partite leggibili.
- **Costo tecnico:** medio.
- **Rischio:** bot deterministico e prevedibile.
- **Test necessari:** legalità, seed, win-rate target, distribuzione azioni.
- **Priorità:** **P0** per VS Bot.

## 7.3 High functionality — refactor coraggioso

### H1 — Motore unico condiviso e commit/reveal

- **Problema risolto:** divergenza client/server e falsa segretezza.
- **Architettura:**
  - un modulo puro e versionato contiene tipi, catalogo, formula e risoluzione;
  - frontend usa il modulo per preview;
  - Edge Function usa lo stesso modulo per autorità;
  - il client invia prima un hash dell'azione con nonce;
  - dopo entrambi i commit invia l'azione; il server verifica l'hash.
- **Comportamento previsto:** vera simultaneità e nessuna possibilità di second-mover.
- **Costo tecnico:** alto.
- **Rischio:** gestione timeout/disconnessioni e migrazione partite in corso.
- **Test necessari:** vector test condivisi, replay golden, commit mismatch, timeout, idempotenza, deployment Deno.
- **Priorità:** **P0** prima di qualunque PVP competitivo.

### H2 — Evoluzione come portafoglio di adattamenti, non asta sul finale

- **Problema risolto:** investimenti concentrati in un solo gene/round.
- **Regola proposta:**
  - cap 3;
  - evento corrente e successivo visibili;
  - `EVOLVE` aumenta di 1 un gene e vale 0 nel round;
  - tutti i round valgono 1;
  - catalogo ampio con ogni gene utile in più famiglie ma nessun gene universalmente migliore;
  - un gene al cap non può più essere evoluto;
  - cooldown di un round resta come vincolo leggibile.
- **Comportamento previsto:** investire è utile soltanto se crea almeno due opportunità future o sorprende una risposta avversaria; non basta accumulare per un jackpot finale.
- **Costo tecnico:** alto per content rebalance e telemetria.
- **Rischio:** senza eventi ben distribuiti `EVOLVE` può diventare ancora chiaramente sbagliato.
- **Test necessari:** equilibrio per gene, ROI di ogni evoluzione, strategie stazionarie, Nash approssimato, playtest ciechi.
- **Priorità:** P1 dopo H1.

## 8. Versione consigliata della meccanica

Questa è la versione che raccomando come prossimo prototipo, mantenendo sei round e due azioni:

### Setup

- 6 round.
- Catalogo di almeno 12 eventi; 6 pescati per partita.
- Pescata senza ripetizione con pesi `COMMON = 3`, `UNCOMMON = 2`, `RARE = 1`; dopo ogni pesca l'evento scelto viene rimosso.
- Il server conosce la sequenza completa.
- Il giocatore vede evento corrente e prossimo.
- Ogni gene parte a livello 0.
- Livello massimo 3, applicato anche allo stato memorizzato.

### Evento

Ogni evento assegna esattamente:

- `+2` a due geni principali;
- `+1` a due geni secondari;
- `0` ai neutrali;
- `-1` a due geni penalizzati.

Niente moltiplicatore globale.

Vincolo di catalogo:

- sui 12 eventi, ogni gene deve ricevere 2 o 3 slot `+2`, 2 o 3 slot `+1` e 2 o 3 slot `-1`;
- le rarità devono modificare davvero la probabilità di pesca;
- nessun gene deve avere valore atteso totale negativo sull'intero catalogo senza una capacità compensativa.
- `intensity` va rimossa dall'interfaccia e dal tipo finché non possiede un effetto testato; non deve restare un'etichetta pseudo-meccanica.

### Azioni

`USE`:

```text
value = level + affinity(evento, gene)
```

- non disponibile se il gene è in cooldown;
- dopo l'uso, cooldown 1.

`EVOLVE`:

```text
roundValue = 0
level = min(3, level + 1)
```

- disponibile anche se il gene è in cooldown;
- non disponibile al livello 3;
- il tick del cooldown avviene una volta per round come oggi.

### Punteggio

- ogni round vale 1 punto;
- pareggio round: 0 punti;
- dopo sei round, in caso di parità punti:
  1. vince chi ha somma maggiore dei sei `roundValue`;
  2. ulteriore parità resta draw.

### Informazione e protocollo

- scelte simultanee con commit/reveal;
- azioni avversarie non leggibili fino alla reveal;
- sequenza futura non inclusa nel payload pubblico;
- stesso motore puro per preview e Edge Function;
- ogni versione delle regole identificata nel record partita per replay e migrazioni.

### Perché dovrebbe funzionare meglio

**Più competitiva**

- elimina il vantaggio di leggere l'azione avversaria;
- rimuove il jackpot fisso del round 6;
- riduce il vantaggio automatico del gene favorito da quattro livelli a due.

**Più comprensibile**

- formula `livello + affinità`;
- rarità realmente collegata alla frequenza;
- cap 3 raggiungibile e visibile;
- ogni round ha lo stesso peso.

**Più varia**

- non compaiono sempre gli stessi eventi;
- tutti i geni hanno nicchie positive;
- il prossimo evento permette piani, ma non una soluzione completa dall'inizio.

**Più soddisfacente**

- un'evoluzione può cambiare una partita in più round, non soltanto nel finale;
- un buon `USE` resta importante;
- il tie-break premia la qualità complessiva senza creare un singolo round jackpot.

**Più coerente col tema**

- l'evoluzione è un investimento sotto incertezza ambientale;
- specializzarsi troppo può essere punito da eventi non garantiti;
- una creatura adattabile costruisce un portafoglio di risposte, invece di caricare un solo gene per il sesto round.

## 9. Test necessari prima di cambiare produzione

1. Vector test condivisi frontend/Edge per ogni combinazione:
   - azione;
   - cooldown;
   - livello;
   - modificatore;
   - pareggio;
   - cap.
2. Property test:
   - simmetria fra slot;
   - idempotenza della risoluzione;
   - nessun livello oltre cap;
   - nessun `USE` illegale risolto silenziosamente.
3. Audit automatico catalogo:
   - frequenza per gene;
   - valore atteso;
   - copertura positiva/negativa;
   - distribuzione rarità.
4. Simulazione di almeno un milione di partite sulla proposta:
   - random;
   - greedy;
   - invest-first-N;
   - one-step lookahead;
   - best response approssimata;
   - strategie miste.
5. Test protocollo:
   - commit/reveal;
   - disconnect;
   - timeout;
   - doppio submit;
   - client malevolo;
   - reconnect senza leak.
6. Target di accettazione suggeriti:
   - nessuna policy semplice sopra 65% contro tutte le altre policy non casuali;
   - nessun gene sotto 5% o sopra 20% di pick-rate aggregato, salvo nicchie dichiarate;
   - bot medio fra 40% e 60% contro greedy base;
   - round finale sotto 25% di pivotalità media;
   - pareggi partita fra policy simmetriche sotto 35% grazie al tie-break.

## 10. Raccomandazione finale

Non aggiungerei abilità speciali, risorse secondarie o eccezioni prima di correggere il nucleo.

Ordine consigliato:

1. rendere davvero segrete le azioni e server-private le informazioni future;
2. unificare il motore frontend/Edge;
3. portare tutti i round a 1 punto;
4. ridurre il peso evento a 1;
5. riequilibrare i geni, in particolare STRENGTH e FAT_RESERVES;
6. ampliare il catalogo e dare significato a rarità/intensità;
7. sostituire il bot casuale con profili euristici;
8. rieseguire questa stessa suite e poi playtest umani.

La meccanica corrente contiene il seme di un buon gioco simultaneo: scegliere fra rendimento immediato e adattamento futuro. Oggi però l'evento decide quasi tutto e il round finale trasforma l'evoluzione in un'asta. La versione raccomandata conserva le due azioni e il loop di sei round, ma fa sì che la decisione difficile sia “quanto mi specializzo sotto incertezza?”, non “quante volte devo caricare il gene del round 6?”.
