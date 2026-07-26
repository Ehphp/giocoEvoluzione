# Refactor UI/UX e fattibilità del redesign del catalogo

Data verifica: 2026-07-26.

## Esito

La Parte A è implementata e verificata. La matrice delle affinità non è stata
modificata perché i vincoli obbligatori della Parte B sono matematicamente
incompatibili:

```text
6 eventi × 1 gene principale per evento = 6 assegnazioni +2 disponibili
10 geni × 2 eventi principali per gene = 20 assegnazioni +2 richieste
6 ≠ 20
```

Il limite non dipende dalla scelta biologica delle associazioni, dal solver o
dal tie-break. Non esiste alcuna matrice che lo superi mantenendo
contemporaneamente 6 eventi, 10 geni, un solo +2 per evento e due +2 per gene.
Per questo non è stato prodotto un “after” non conforme e non sono state
alterate formule, scoring, cooldown, multiplayer, Realtime, database o Edge
Function.

## UI/UX implementata

- Evento corrente e prossimo evento sono mostrati in una gerarchia esplicita.
- La card successiva usa il 70% della larghezza della card corrente.
- Long press a 420 ms con soli modificatori non nulli, ordinati `+2`, `+1`,
  `-1`, `-2`.
- Il pannello si chiude al rilascio, al puntatore esterno e con swipe down.
- I geni sono ordinati da sinistra a destra dal peggiore al migliore in base al
  valore USE immediatamente ottenibile.
- Legalità e cooldown sono inclusi: un USE illegale non ha valore ottenibile,
  ma la carta resta nello slider ed è disabilitata.
- Tie-break deterministico: valore, livello, nome alfabetico.
- A inizio partita e a ogni cambio round viene selezionato il gene migliore.
- Il cambio d’ordine usa una transizione e il gene selezionato riceve uno
  scroll fluido; l’ordine viene ricalcolato anche dopo un’evoluzione.
- Nell’ultimo round resta visibile la sezione “Prossimo evento” con lo stato di
  fine ecosistema.

## Matrice corrente (before)

| Evento | +2 principale | +1 | -1 |
|---|---|---|---|
| Ceneri vulcaniche | RESISTANCE | FAT_RESERVES | PERCEPTION |
| Eclissi prolungata | PERCEPTION | CAMOUFLAGE | METABOLISM |
| Migrazione predatori | AGILITY | CAMOUFLAGE, STRENGTH | FAT_RESERVES |
| Picco termico | METABOLISM | WEBBED_LIMBS | FAT_RESERVES |
| Collasso nutrienti | METABOLISM | FAT_RESERVES, ADAPTATION | STRENGTH |
| Inondazione lampo | WEBBED_LIMBS | GRIP_CLAWS, STRENGTH | AGILITY |

Distribuzione dei principali: METABOLISM 2; RESISTANCE, PERCEPTION, AGILITY e
WEBBED_LIMBS 1; gli altri cinque geni 0.

## Nuova matrice (after)

Non prodotta: una matrice conforme richiederebbe 20 slot principali, mentre il
catalogo invariato ne offre 6. Aggiornare le descrizioni narrative in assenza
di una matrice valida avrebbe creato una divergenza tra testo e logica.

## Solver esatto rieseguito sul baseline

Il solver produttivo ha esaminato tutte le 720 permutazioni e ha superato 7
verifiche su 7.

| Best response contro GREEDY | Vittorie | Pareggi | Sconfitte | Δ max | Δ min |
|---|---:|---:|---:|---:|---:|
| Sequenza completa | 512 | 208 | 0 | +2 | 0 |
| Evento corrente + prossimo | 372 | 348 | 0 | +2 | 0 |

Metriche strategiche del baseline:

- cooldown rilevante in tutte le 240 sequenze con HEAT e NUTRIENT consecutivi;
- la best response conserva intenzionalmente METABOLISM in 203/240 di queste
  sequenze;
- tutte le 512 sequenze vinte dalla best response completa contengono almeno un
  EVOLVE, quindi EVOLVE genera vantaggio netto nel 71,11% delle permutazioni;
- conoscere corrente + prossimo cambia l’azione rispetto a GREEDY in
  1.796/4.320 stati attraversati (41,57%);
- la conoscenza completa migliora il differenziale rispetto al solo lookahead
  in 152/720 sequenze.

Il dettaglio round-per-round è in
`artifacts/game-mechanics-solver/results.json`; il riepilogo metodologico è in
`artifacts/game-mechanics-solver/report.md`.

## Audit completo rieseguito sul baseline

L’audit deterministico ha simulato 172.000 partite ed è passato. La tabella
seguente mostra W/D/L percentuale della strategia di riga contro quella di
colonna per le policy richieste.

| Riga \ Colonna | Random | GREEDY | Lookahead | E1 | E2 | E3 | Response | Best response |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Random | 37,25/27/35,75 | 0/0/100 | 0/0/100 | 0/0/100 | 0/0,25/99,75 | 0/1/99 | 0/0/100 | 0/0/100 |
| GREEDY | 100/0/0 | 0/100/0 | 0/97,25/2,75 | 11/50,25/38,75 | 75,75/23/1,25 | 94,25/5,75/0 | 0/100/0 | 0/29,5/70,5 |
| Lookahead | 100/0/0 | 2,75/97,25/0 | 0/100/0 | 1,25/74,5/24,25 | 70,5/29,5/0 | 79,25/20,75/0 | 2,75/97,25/0 | 6,25/51,25/42,5 |
| E1 | 100/0/0 | 38,75/50,25/11 | 24,25/74,5/1,25 | 0/100/0 | 8,25/71,5/20,25 | 9,25/85,5/5,25 | 38,75/50,25/11 | 0/69/31 |
| E2 | 99,75/0,25/0 | 1,25/23/75,75 | 0/29,5/70,5 | 20,25/71,5/8,25 | 0/100/0 | 0/9,25/90,75 | 1,25/23/75,75 | 9,25/12,75/78 |
| E3 | 99/1/0 | 0/5,75/94,25 | 0/20,75/79,25 | 5,25/85,5/9,25 | 90,75/9,25/0 | 0/100/0 | 0/5,75/94,25 | 1,5/27,25/71,25 |
| Response-aware | 100/0/0 | 0/100/0 | 0/97,25/2,75 | 11/50,25/38,75 | 75,75/23/1,25 | 94,25/5,75/0 | 0/100/0 | 0/29,5/70,5 |
| Best response | 100/0/0 | 70,5/29,5/0 | 42,5/51,25/6,25 | 31/69/0 | 78/12,75/9,25 | 71,25/27,25/1,5 | 70,5/29,5/0 | 0/100/0 |

Uso medio azioni e impatto cooldown nel benchmark contro random:

| Strategia | USE medi | EVOLVE medi | Miglior USE bloccato dal cooldown |
|---|---:|---:|---:|
| Random | 2,929 | 3,071 | 3,483% |
| GREEDY | 6 | 0 | 5,75% |
| Lookahead | 5,687 | 0,313 | 0% |
| E1 | 5 | 1 | 2,683% |
| E2 | 4 | 2 | 1,567% |
| E3 | 3 | 3 | 13,917% |
| Response-aware | 6 | 0 | 5,75% |
| Best response | 5,233 | 0,767 | 0,317% |

Il file `artifacts/game-mechanics-audit/results.json` contiene inoltre pick-rate
completi, uso medio per gene, distribuzione del valore per round, quota dei
punti decisivi, entropia dei pattern vincenti e tutti i matchup.

## Valutazione dei criteri

| Criterio | Baseline | Esito |
|---|---|---|
| Ogni gene +2 esattamente due volte | 6 slot disponibili contro 20 richiesti | Impossibile |
| GREEDY non imbattibile | Best response vince 512/720 | Soddisfatto |
| Nessuna policy semplice oltre ~65% contro tutte le non casuali | E2/E3 superano largamente alcune policy | Non soddisfatto |
| Cooldown frequente nelle decisioni ottimali | 203/240 conservazioni intenzionali nella coppia critica | Parzialmente soddisfatto |
| EVOLVE utile ma non obbligatorio | Vantaggio netto possibile; GREEDY/response usano 0 EVOLVE | Soddisfatto |
| Nessun gene dominante | METABOLISM 28,12% dei pick GREEDY | Non soddisfatto |
| Lookahead utile ma non risolutivo | 372 vittorie; full knowledge migliore in 152 sequenze | Soddisfatto |
| Test/build/lint puliti | 93 test, build e lint verdi | Soddisfatto |

## Raccomandazione

Non promuovere un nuovo catalogo finché il contratto non viene corretto.
Esistono due correzioni coerenti:

1. se “ogni gene principale esattamente due volte” è irrinunciabile, portare il
   catalogo a 20 eventi mantenendo un solo +2 per evento;
2. se 6 eventi e 10 geni sono irrinunciabili, sostituire quel vincolo con uno
   fattibile, per esempio “ogni gene ha affinità positiva in esattamente due
   eventi”, mantenendo un solo +2 per evento e definendo separatamente quante
   ripetizioni +2 sono ammesse.

Fino a tale decisione, mantenere in produzione la matrice corrente: è
imperfetta e concentra METABOLISM, ma è coerente, testata e migliore di una
matrice che violi silenziosamente i criteri di accettazione.
