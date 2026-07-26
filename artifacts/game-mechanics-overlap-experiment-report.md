# Esperimento controllato: METABOLISM +2 sovrapposto

**GREEDY è ancora imbattibile: no.**  
**GREEDY è battibile in almeno una delle 720 sequenze: sì.**  
**Il cooldown influenza una decisione ottimale: sì.**  
**EVOLVE produce almeno una volta un vantaggio netto: sì.**

## Modifica produttiva

È stata modificata esclusivamente la matrice di `NUTRIENT_COLLAPSE`:

```text
METABOLISM +2
FAT_RESERVES +1
ADAPTATION +1
STRENGTH -1
```

Gli altri cinque eventi e tutte le altre regole sono invariati. La motivazione
di `METABOLISM +2` è stata aggiornata per riferirsi all'efficienza energetica
durante la scarsità nutritiva.

La Edge Function continua a importare `getRoundEventById` dallo stesso file
usato dal frontend; non è stata modificata.

## Before / after esatto

| Catalogo | Vittorie best response | Pareggi | Sconfitte | Δ max |
|---|---:|---:|---:|---:|
| Prima: sei geni `+2` distinti | 0 | 720 | 0 | 0 |
| Dopo: `METABOLISM +2` in due eventi | 512 | 208 | 0 | +2 |

La modifica rompe nettamente l'imbattibilità. Le vittorie non dipendono da
tie-break: tutte le quattro classi deterministiche rilevanti restituiscono gli
stessi aggregati.

## Ordine degli eventi e informazione

### Best response con sequenza completa

| Ordine | Vittorie | Pareggi | Sconfitte | Δ max |
|---|---:|---:|---:|---:|
| `HEAT → NUTRIENT` consecutivi | 108/120 | 12/120 | 0 | +1 |
| `NUTRIENT → HEAT` consecutivi | 116/120 | 4/120 | 0 | +2 |
| Non consecutivi | 288/480 | 192/480 | 0 | +1 |

### Best response con solo corrente e prossimo

| Ordine | Vittorie | Pareggi | Sconfitte | Δ max |
|---|---:|---:|---:|---:|
| `HEAT → NUTRIENT` consecutivi | 38/120 | 82/120 | 0 | +1 |
| `NUTRIENT → HEAT` consecutivi | 72/120 | 48/120 | 0 | +2 |
| Non consecutivi | 262/480 | 218/480 | 0 | +1 |

Nel totale, corrente+prossimo vince 372 sequenze e pareggia 348. La conoscenza
completa migliora il differenziale in 152 sequenze; raggiunge lo stesso
differenziale della policy limitata in 568/720.

Risposte:

1. **Il certificato `W ≤ E` è rotto.** Una evoluzione di `METABOLISM` può
   alimentare due vittorie `+2`, quindi `W=2>E=1`.
2. **Il vantaggio nasce in entrambi gli ordini** e anche quando gli eventi non
   sono consecutivi. `NUTRIENT → HEAT` è il gruppo più favorevole.
3. **La conoscenza completa non è sempre necessaria**, ma aggiunge valore in
   152 sequenze.
4. **Corrente+prossimo è sufficiente per 372 vittorie**, non per replicare
   sempre l'oracolo.

## Il cooldown è una vera decisione

GREEDY trova `METABOLISM` in cooldown nel secondo evento in tutte le 240
sequenze consecutive.

| Secondo evento | Fallback GREEDY catalogo | Occorrenze | Valore |
|---|---|---:|---:|
| `NUTRIENT_COLLAPSE` | `ADAPTATION` | 120 | 1 |
| `HEAT_SPIKE` | `WEBBED_LIMBS` | 120 | 1 |

La best response:

- sfrutta il fallback vincendo direttamente il secondo round in 219/240 casi;
- rinuncia intenzionalmente a `USE METABOLISM` nel primo evento e lo conserva
  per il secondo in 203/240;
- con corrente+prossimo cambia azione rispetto alla massimizzazione immediata
  in 1.796/4.320 decisioni attraversate.

Questi valori mostrano pianificazione reale. Non è soltanto una penalità
automatica applicata simmetricamente.

## Tre controesempi completi

Gli stati completi di tutti i geni prima e dopo ciascun round sono in
[`game-mechanics-solver/results.json`](./game-mechanics-solver/results.json).

### 1. HEAT → NUTRIENT consecutivi

```text
ASH → ECLIPSE → PREDATOR → HEAT → NUTRIENT → FLOOD
```

| R | Best response | Valore | GREEDY | Valore | Score |
|---:|---|---:|---|---:|---:|
| 1 | `USE RESISTANCE` | 2 | `USE RESISTANCE` | 2 | 0–0 |
| 2 | `USE PERCEPTION` | 2 | `USE PERCEPTION` | 2 | 0–0 |
| 3 | `USE AGILITY` | 2 | `USE AGILITY` | 2 | 0–0 |
| 4 | `EVOLVE WEBBED_LIMBS` | 0 | `USE METABOLISM` | 2 | 0–1 |
| 5 | `USE METABOLISM` | 2 | `USE ADAPTATION` | 1 | 1–1 |
| 6 | `USE WEBBED_LIMBS` livello 1 | 3 | `USE WEBBED_LIMBS` | 2 | **2–1** |

La best response conserva `METABOLISM` e usa il round perso per preparare una
seconda vittoria.

### 2. NUTRIENT → HEAT consecutivi

```text
ASH → ECLIPSE → PREDATOR → NUTRIENT → HEAT → FLOOD
```

| R | Best response | Valore | GREEDY | Valore | Score |
|---:|---|---:|---|---:|---:|
| 1 | `EVOLVE AGILITY` | 0 | `USE RESISTANCE` | 2 | 0–1 |
| 2 | `EVOLVE METABOLISM` | 0 | `USE PERCEPTION` | 2 | 0–2 |
| 3 | `USE AGILITY` livello 1 | 3 | `USE AGILITY` | 2 | 1–2 |
| 4 | `USE METABOLISM` livello 1 | 3 | `USE METABOLISM` | 2 | 2–2 |
| 5 | `USE AGILITY` | 1 | `USE WEBBED_LIMBS` | 1 | 2–2 |
| 6 | `USE WEBBED_LIMBS` | 2 | `USE STRENGTH` | 1 | **3–2** |

### 3. Eventi non consecutivi

```text
ASH → ECLIPSE → PREDATOR → HEAT → FLOOD → NUTRIENT
```

| R | Best response | Valore | GREEDY | Valore | Score |
|---:|---|---:|---|---:|---:|
| 1 | `USE RESISTANCE` | 2 | `USE RESISTANCE` | 2 | 0–0 |
| 2 | `USE PERCEPTION` | 2 | `USE PERCEPTION` | 2 | 0–0 |
| 3 | `EVOLVE METABOLISM` | 0 | `USE AGILITY` | 2 | 0–1 |
| 4 | `USE METABOLISM` livello 1 | 3 | `USE METABOLISM` | 2 | 1–1 |
| 5 | `USE WEBBED_LIMBS` | 2 | `USE WEBBED_LIMBS` | 2 | 1–1 |
| 6 | `USE METABOLISM` livello 1 | 3 | `USE METABOLISM` | 2 | **2–1** |

Questo è il controesempio diretto al vecchio certificato: un `EVOLVE` perso,
due vittorie successive.

## FAT_RESERVES e ADAPTATION

Non diventano alternative forti della best response:

- nei 720 percorsi esatti, `ADAPTATION USE` compare 12 volte;
- `FAT_RESERVES USE` compare 10 volte e `FAT_RESERVES EVOLVE` 10 volte;
- in `NUTRIENT_COLLAPSE`, la best response usa `METABOLISM` 613/720 volte.

Nell'audit contro random, la policy dedicata all'alternativa nutritiva evolve
0,828 volte a partita ma ottiene punteggio medio 4,878, inferiore a 5,585 di
GREEDY. Quindi sono opzioni legali reali in alcuni stati, ma non equivalenti a
`METABOLISM`.

## Audit sistemico

L'audit deterministico after contiene 172.000 partite. La baseline precedente è
conservata in
[`game-mechanics-audit/results-before-overlap.json`](./game-mechanics-audit/results-before-overlap.json).

### Benchmark contro random

| Strategia | W/D/L % | Score medio | USE | EVOLVE | Cooldown blocca best % | Tie round % |
|---|---|---:|---:|---:|---:|---:|
| Random | 35,35 / 28,15 / 36,50 | 1,038 | 2,929 | 3,071 | 3,483 | 64,792 |
| GREEDY immediata | 100 / 0 / 0 | 5,585 | 6 | 0 | 5,750 | 5,808 |
| GREEDY gene principale | 100 / 0 / 0 | 5,585 | 6 | 0 | 5,750 | 5,808 |
| Lookahead 1 | 100 / 0 / 0 | 5,375 | 5,687 | 0,313 | 0 | 9,000 |
| Conserva METABOLISM | 100 / 0 / 0 | 5,566 | 6 | 0 | 0 | 6,158 |
| Evolve alternativa nutritiva | 100 / 0 / 0 | 4,878 | 5,172 | 0,828 | 1,217 | 16,275 |
| E1 | 100 / 0 / 0 | 4,768 | 5 | 1 | 2,683 | 17,775 |
| E2 | 99,70 / 0,30 / 0 | 3,876 | 4 | 2 | 1,567 | 30,467 |
| E3 | 98,45 / 1,45 / 0,10 | 3,047 | 3 | 3 | 13,917 | 42,042 |
| Response-aware | 100 / 0 / 0 | 5,585 | 6 | 0 | 5,750 | 5,808 |
| Best response esatta rigiocata | 99,95 / 0,05 / 0 | 5,014 | 5,233 | 0,767 | 0,317 | 14,042 |

GREEDY immediata e gene principale sono empiricamente identiche. Il pick-rate di
`METABOLISM` per GREEDY passa dal 16,67% before al 28,12% after; nella best
response esatta rigiocata arriva al 35,55%. Non emerge però una policy “usa
sempre METABOLISM”.

### Matchup principali

| Strategia sinistra vs destra | W/D/L % |
|---|---:|
| GREEDY vs best response esatta | 0 / 29,50 / 70,50 |
| Lookahead 1 vs GREEDY | 2,75 / 97,25 / 0 |
| Conserva METABOLISM vs GREEDY | 2,75 / 97,25 / 0 |
| Best response vs Lookahead 1 | 42,50 / 51,25 / 6,25 |
| Best response vs Conserva METABOLISM | 48,75 / 46,25 / 5,00 |
| GREEDY vs alternativa nutritiva | 58,50 / 39,75 / 1,75 |

Nessuna strategia non casuale supera il 65% di vittorie contro **tutte** le
altre non casuali. La best response è specializzata contro GREEDY: non è una
strategia dominante universale.

### Peso empirico dei round

Contro random, GREEDY distribuisce i punti decisivi quasi uniformemente
(circa 16,6% per round). La best response sposta peso verso il finale:

```text
R1 13,592%  R2 15,153%  R3 16,491%
R4 17,790%  R5 18,371%  R6 18,604%
```

È coerente con investimenti iniziali e recupero successivo.

## Valutazione

La modifica soddisfa i criteri richiesti:

- GREEDY è battibile in 512 sequenze;
- il risultato non dipende dal tie-break;
- il cooldown cambia azioni ottimali e viene sfruttato;
- nessuna policy semplice supera il 65% contro tutte le altre non casuali;
- non compare una policy obbligatoria che usa sempre `METABOLISM`;
- frontend, Edge e solver usano il catalogo condiviso;
- test, build e lint sono verificati separatamente.

La modifica **migliora la profondità**, non genera soltanto più pareggi:
introduce vittorie esatte, valore del lookahead, conservazione volontaria e
investimenti `EVOLVE` con saldo positivo.

Problemi aperti:

1. `METABOLISM` diventa il gene più concentrato: 28,12% dei pick GREEDY e
   35,55% della best response.
2. `FAT_RESERVES` e `ADAPTATION` restano alternative deboli.
3. La conoscenza completa è molto forte: 512 vittorie contro 372 con un solo
   evento di lookahead.
4. La policy esatta rigiocata è una risposta a GREEDY, non una policy
   universalmente ottima contro avversari arbitrari.

