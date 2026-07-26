# Revisione controllata della meccanica — report finale

Data: 26 luglio 2026  
Ambito: scoring, livelli, legalità azioni, catalogo eventi, parità frontend/Edge e retest sistemico  
Schema database, API pubbliche, Realtime, flusso multiplayer e layout: invariati

## Esito

La revisione richiesta è stata implementata.

- `USE = effectiveLevel + somma modificatori evento`.
- `ROUND_EVENT_WEIGHT = 1`.
- Tutti i round, incluso il sesto, assegnano 1 punto.
- Livello effettivo e memorizzato massimo: 3.
- `EVOLVE` a livello 3 è illegale sia nel motore sia nel percorso Edge.
- `USE` in cooldown è illegale in entrambi i percorsi.
- La UI disabilita `EVOLVE` sul gene selezionato a livello 3.
- Il bot non genera più azioni `EVOLVE` illegali al cap.
- Le partite legacy con livelli superiori a 3 vengono normalizzate in lettura.
- La Edge Function non duplica più catalogo, scoring e risoluzione: usa le stesse funzioni pure del frontend.
- Tutti i dieci geni hanno almeno un'affinità positiva.

## Decisioni implementative

### Formula e punti

Costanti correnti:

```ts
ROUND_EVENT_WEIGHT = 1
FINAL_ROUND_POINTS = 1
DEFAULT_ROUND_POINTS = 1
MAX_EFFECTIVE_TRAIT_LEVEL = 3
```

Formula:

```text
USE = min(level, 3) + somma(modificatori evento)
EVOLVE = 0 nel round; level = min(3, level + 1)
```

Il round 6 attraversa lo stesso `getRoundPoints` degli altri round e restituisce 1.

### Compatibilità legacy

`normalizeTraitCollection`:

- completa i geni mancanti;
- converte livelli finiti in interi;
- limita i livelli a `[0, 3]`;
- normalizza cooldown finiti non negativi.

Inoltre, ogni stato prodotto dal motore limita a 3 tutti i livelli finiti. Un record legacy con livello 8 può ancora essere mostrato nel breakdown come `originalLevel: 8`, ma viene valutato e risalvato a livello 3.

### Legalità azioni

`isTraitEvolvable` è la fonte condivisa per motore, UI e bot.

- `USE` con cooldown positivo lancia errore.
- `EVOLVE` a livello 3 lancia errore.
- Nessuna delle due azioni viene trasformata silenziosamente in valore zero.
- La Edge Function restituisce HTTP 400 per queste azioni invalide.

### Parità frontend/Edge

È stata estratta `buildPersistedRoundResolution` in un modulo puro condiviso.

La Edge Function ora importa:

- `normalizeTraitCollection`;
- `getRoundEventById`;
- `buildPersistedRoundResolution`;
- il normale flusso di creazione dell'azione bot.

Sono state rimosse dalla Edge Function le copie locali di:

- costanti;
- catalogo eventi;
- normalizzazione;
- formula di scoring;
- cooldown;
- legalità `USE`/`EVOLVE`;
- risoluzione del round;
- logica del punto finale.

La persistenza e l'orchestrazione idempotente restano locali alla funzione.

## Matrice eventi implementata

| Evento | +2 | +1 | -1 |
|---|---|---|---|
| VOLCANIC_ASH_WAVE | RESISTANCE | FAT_RESERVES | PERCEPTION |
| PROLONGED_ECLIPSE | PERCEPTION | CAMOUFLAGE | METABOLISM |
| PREDATOR_PACK_MIGRATION | AGILITY | CAMOUFLAGE, STRENGTH | FAT_RESERVES |
| HEAT_SPIKE | METABOLISM | WEBBED_LIMBS | FAT_RESERVES |
| NUTRIENT_COLLAPSE | FAT_RESERVES | ADAPTATION | STRENGTH |
| FLASH_FLOOD | WEBBED_LIMBS | GRIP_CLAWS, STRENGTH | AGILITY |

Titoli, descrizioni, categorie, rarità, intensità, art key e ID sono invariati. Le motivazioni testuali sono state adattate ai nuovi effetti.

Totale dei contributi evento prima e dopo:

| Gene | Prima | Dopo | Eventi positivi dopo |
|---|---:|---:|---:|
| STRENGTH | -6 | +1 | 2 |
| RESISTANCE | +4 | +2 | 1 |
| AGILITY | +4 | +1 | 1 |
| PERCEPTION | +2 | +1 | 1 |
| METABOLISM | +6 | +1 | 1 |
| ADAPTATION | +2 | +1 | 1 |
| GRIP_CLAWS | +2 | +1 | 1 |
| CAMOUFLAGE | +6 | +2 | 2 |
| WEBBED_LIMBS | +6 | +3 | 2 |
| FAT_RESERVES | -6 | +1 | 2 |

STRENGTH e FAT_RESERVES non sono più geni senza nicchia positiva.

## Test aggiunti e aggiornati

Copertura esplicita:

1. livello 0 con bonus +2 → valore 2;
2. livello 2 neutro → valore 2;
3. livello 1 con bonus +1 → valore 2;
4. livello 3 con bonus +2 → valore 5;
5. `EVOLVE` da 2 → livello 3 e valore 0;
6. `EVOLVE` da 3 → errore;
7. `USE` in cooldown → errore nei due entry point;
8. `USE` imposta cooldown 1;
9. il round successivo riporta il cooldown a 0;
10. ogni round assegna 1 punto;
11. il round 6 assegna 1, non 2;
12. lo stato risultante non salva livelli superiori a 3;
13. tutti i geni hanno almeno un'affinità positiva;
14. ID dei dieci geni e dei sei eventi invariati;
15. motore e risoluzione persistita producono valori, breakdown, cooldown, livelli, vincitore e punti identici.

La suite ordinaria è passata con:

```text
13 file di test
86 test superati
0 test falliti
```

## Retest sistemico

Risultati grezzi:

- baseline: `artifacts/game-mechanics-audit/results-before.json`;
- revisione: `artifacts/game-mechanics-audit/results.json`;
- simulatore: `artifacts/game-mechanics-audit/simulation.test.ts`.

Campione after: **100.000 partite deterministiche**.

### Benchmark contro random

| Strategia | Win | Draw | Loss | Score medio | USE | EVOLVE | Pareggi round |
|---|---:|---:|---:|---:|---:|---:|---:|
| Random | 34,85% | 29,55% | 35,60% | 1,012–1,034 | 2,929 | 3,071 | 65,92% |
| Greedy immediata | 100% | 0% | 0% | 5,635–0,038 | 6 | 0 | 5,45% |
| E1 gene finale | 100% | 0% | 0% | 4,796–0,137 | 5 | 1 | 17,78% |
| E2 gene finale | 99,90% | 0,10% | 0% | 3,905–0,265 | 4 | 2 | 30,50% |
| E3 gene finale | 98,75% | 1,20% | 0,05% | 3,054–0,400 | 3 | 3 | 42,44% |
| Una evolve sul favorito futuro | 99,95% | 0,05% | 0% | 4,762–0,152 | 5 | 1 | 18,09% |
| Evolve per il prossimo evento | 99,65% | 0,35% | 0% | 3,115–0,439 | 3 | 3 | 40,76% |
| Evita penalità | 59,50% | 23,15% | 17,35% | 1,599–0,749 | 6 | 0 | 60,86% |
| Full-sequence USE | 100% | 0% | 0% | 5,635–0,038 | 6 | 0 | 5,45% |
| Response-aware | 100% | 0% | 0% | 5,635–0,038 | 6 | 0 | 5,45% |

Il bot corrente usa la policy random: contro greedy registra **0% vittorie, 0% pareggi, 100% sconfitte**.

### Matchup deterministici richiesti

| Matchup | Win / Draw / Loss della prima strategia |
|---|---:|
| Random vs random | 34,85% / 29,55% / 35,60% nel benchmark specchiato |
| Greedy vs random | 100% / 0% / 0% |
| Greedy vs greedy | 0% / 100% / 0% |
| E1 vs greedy/E0 | **0% / 100% / 0%** |
| E2 vs E1 | 12,8% / 87,2% / 0% |
| E3 vs E2 | 82,9% / 17,1% / 0% |
| Evolve-prossimo-evento vs greedy | 0% / 100% / 0% |

La vecchia scala automatica è spezzata nel punto decisivo:

```text
Prima: E1 batteva E0 nel 100% del campione della scala.
Dopo:  E1 pareggia E0 nel 100% del campione.
```

E2 non batte più automaticamente E1: pareggia nell'87,2%. Resta un vantaggio rilevante di E3 su E2, dovuto all'interazione fra cap, livelli intermedi e rotazione; è un residuo da osservare, non la precedente catena completa generata dal doppio punto finale.

### Confronto prima/dopo

| Indicatore | Prima | Dopo |
|---|---:|---:|
| E1 vs greedy: vittorie | 89% | **0%** |
| E1 vs greedy: pareggi | 11% | **100%** |
| Greedy vs random: score | 6,560–0,081 | 5,635–0,038 |
| Random vs random: pareggi partita | 23,35% | 29,55% |
| Greedy: quota punti round 6 | 28,67% | **16,61%** |
| E1: quota punti round 6 | 33,46% | **20,06%** |
| Random: quota punti round 6 | 32,06% | **18,41%** |
| E3: quota punti round 6 | 45,61% | **28,96%** |
| Slot 1 fra partite decisive | 50% | 50% |
| Slot 2 fra partite decisive | 50% | 50% |

### Peso empirico dei round after

Quota percentuale dei punti decisivi:

| Strategia | R1 | R2 | R3 | R4 | R5 | R6 |
|---|---:|---:|---:|---:|---:|---:|
| Random | 14,96 | 15,26 | 16,14 | 16,99 | 18,24 | 18,41 |
| Greedy | 16,79 | 16,69 | 16,69 | 16,65 | 16,57 | 16,61 |
| E1 finale | 3,35 | 19,20 | 19,20 | 19,15 | 19,06 | 20,06 |
| E2 finale | 3,96 | 4,14 | 22,76 | 22,65 | 22,54 | 23,96 |
| E3 finale | 4,78 | 5,00 | 5,59 | 28,46 | 27,22 | 28,96 |
| Favorito futuro | 3,36 | 19,47 | 19,37 | 19,30 | 19,27 | 19,23 |
| Prossimo evento | 4,64 | 28,12 | 5,43 | 27,91 | 6,06 | 27,84 |

Per greedy il round finale è ora indistinguibile dagli altri round. Le strategie che sacrificano round iniziali concentrano naturalmente i propri punti nei round giocati, ma non ricevono più un moltiplicatore artificiale al sesto.

### Pick-rate dei geni

Percentuale di tutte le azioni della strategia:

| Gene | Random | Greedy | E1 finale | Favorito futuro | Prossimo evento |
|---|---:|---:|---:|---:|---:|
| STRENGTH | 9,71 | 0 | 0 | 2,09 | 0 |
| RESISTANCE | 10,42 | 16,67 | 13,58 | 9,12 | 15,20 |
| AGILITY | 9,95 | 16,67 | 17,53 | 13,95 | 17,52 |
| PERCEPTION | 9,80 | 16,67 | 17,71 | 14,12 | 17,83 |
| METABOLISM | 10,05 | 16,67 | 17,24 | 5,67 | 18,32 |
| ADAPTATION | 10,22 | 0 | 0 | 1,27 | 0 |
| GRIP_CLAWS | 10,01 | 0 | 0 | 0 | 0 |
| CAMOUFLAGE | 9,79 | 0 | 0 | 0 | 0 |
| WEBBED_LIMBS | 10,01 | 16,67 | 15,21 | 31,14 | 14,08 |
| FAT_RESERVES | 10,05 | 16,67 | 18,73 | 22,63 | 17,05 |

Ogni gene ha ora una nicchia positiva nel catalogo, ma le policy greedy continuano a scegliere soltanto il `+2` principale. I geni soltanto secondari restano situazionali e non entrano nella greedy deterministica finché un principale è sempre disponibile.

### Ricerca di una strategia semplice sopra il 65%

Nessuna strategia testata supera il 65% di vittorie contro **tutte** le altre strategie non casuali.

Il massimo osservato in singoli matchup resta alto, ma ciascuna policy ha almeno un matchup con 0% vittorie. Non è stata trovata una policy semplice universalmente dominante nel torneo.

## File modificati

Produzione:

- `src/game/config.ts`
- `src/game/engine.ts`
- `src/game/scoring.ts`
- `src/game/round-events.ts`
- `src/game/traits-catalog.ts`
- `src/game/bot.ts`
- `src/game/persisted-round-resolution.ts` — nuovo
- `src/components/game-v2/controller/buildGeneSelectionV2ViewModel.ts`
- `supabase/functions/resolve-round/index.ts`

Test:

- `src/game/engine.test.ts`
- `src/game/new-traits-scoring.test.ts`
- `src/game/round-breakdown.test.ts`
- `src/game/round-events.test.ts`
- `src/game/round-flow.test.ts`
- `src/game/scoring-audit.test.ts`
- `src/game/trait-catalog.test.ts`
- `src/game/bot.test.ts`
- `src/game/persisted-round-resolution.test.ts` — nuovo
- `src/components/game-v2/controller/buildGeneSelectionV2ViewModel.test.ts`

Audit:

- `artifacts/game-mechanics-audit/simulation.test.ts`
- `artifacts/game-mechanics-audit/results.json`
- `artifacts/game-mechanics-audit/results-before.json`
- `artifacts/game-mechanics-audit.md` — riferimento baseline corretto
- `artifacts/game-mechanics-revision-report.md` — questo report

## Verifiche eseguite

```text
npm test
13 file, 86 test passati

npm run build
TypeScript build + Vite production build passati

RUN_GAME_MECHANICS_AUDIT=1
npm test -- --config artifacts/game-mechanics-audit/vitest.config.ts
100.000 partite, test passato

npm run lint
passato
```

## Problemi ancora aperti

1. **Bot debole:** il bot casuale perde il 100% contro greedy. Un bot avanzato era esplicitamente fuori scope.
2. **Pareggi fra policy simmetriche:** greedy vs greedy resta 100% draw. Non è stato introdotto un tie-break.
3. **Geni secondari poco scelti dalla greedy:** ADAPTATION, GRIP_CLAWS e CAMOUFLAGE hanno affinità positive, ma non superano mai il principale a livello 0.
4. **Catalogo sempre completo:** i sei eventi esistenti compaiono ancora tutti in ogni partita; rarità e intensità non influenzano la pesca. Nuovi eventi erano fuori scope.
5. **Informazioni e RLS:** commit/reveal e nuove policy non sono stati implementati, come richiesto.
6. **Deployment remoto Edge non eseguito:** la build client e i test condivisi passano; non è stato effettuato un deploy Supabase o un test contro un progetto remoto.
7. **Residuo E3 vs E2:** E3 vince l'82,9% e pareggia il 17,1%; la vecchia catena non è più automatica a partire da E0, ma questo matchup va seguito nei playtest.

## Modifiche non completate

Nessuna modifica richiesta è stata omessa.

Sono rimasti intenzionalmente esclusi:

- commit/reveal;
- policy RLS;
- matchmaking;
- nuovi eventi;
- abilità speciali;
- risorse o valute;
- redesign UI;
- bot avanzato;
- modifiche allo schema.
