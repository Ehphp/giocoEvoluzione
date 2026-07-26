# Solver esatto — esperimento METABOLISM sovrapposto

**GREEDY è ancora imbattibile: no.**  
**GREEDY è battibile in almeno una delle 720 sequenze: sì.**  
**Il cooldown influenza una decisione ottimale: sì.**  
**EVOLVE produce almeno una volta un vantaggio netto: sì.**

## Risultato esatto

| Conoscenza della best response | Vittorie | Pareggi | Sconfitte | Δ max | Δ min |
|---|---:|---:|---:|---:|---:|
| Sequenza completa | 512 | 208 | 0 | +2 | 0 |
| Evento corrente e prossimo | 372 | 348 | 0 | +2 | 0 |

Prima della sovrapposizione `METABOLISM +2`, il risultato era 0 vittorie e
720 pareggi. I risultati precedenti sono conservati in
[`results-before-overlap.json`](./results-before-overlap.json).

## Ordine dei due eventi

| Gruppo | Sequenze | Vittorie | Pareggi | Sconfitte | Δ max |
|---|---:|---:|---:|---:|---:|
| `HEAT_SPIKE → NUTRIENT_COLLAPSE` | 120 | 108 | 12 | 0 | +1 |
| `NUTRIENT_COLLAPSE → HEAT_SPIKE` | 120 | 116 | 4 | 0 | +2 |
| Non consecutivi | 480 | 288 | 192 | 0 | +1 |

La best response completa non perde mai. La sovrapposizione crea due fonti di
vantaggio:

1. se gli eventi sono consecutivi, GREEDY usa `METABOLISM` nel primo e lo trova
   in cooldown nel secondo;
2. se entrambi sono ancora futuri e non consecutivi, una sola evoluzione di
   `METABOLISM` può alimentare due round vinti.

## Cooldown

- Sequenze consecutive: **240**.
- GREEDY trova `METABOLISM` in cooldown nel secondo evento: **240/240**.
- Alternativa catalogo:
  - `ADAPTATION`, valore 1, in 120 `HEAT → NUTRIENT`;
  - `WEBBED_LIMBS`, valore 1, in 120 `NUTRIENT → HEAT`.
- Valore medio dell'alternativa: **1**.
- La best response vince direttamente il secondo round: **219/240**.
- La best response evita intenzionalmente `USE METABOLISM` nel primo evento e
  lo usa nel secondo: **203/240**.

Il cooldown è quindi una decisione strategica, non una semplice penalità
automatica.

## Informazione

La policy esatta che vede corrente e prossimo vince 372 sequenze. La conoscenza
completa migliora il differenziale in 152 sequenze e la policy limitata
raggiunge lo stesso differenziale dell'oracolo in 568/720.

La policy corrente+prossimo sceglie un'azione diversa dalla GREEDY immediata in
1.796 dei 4.320 stati attraversati. Vedere il prossimo evento è utile e
sufficiente per numerosi controesempi, ma non sostituisce sempre la sequenza
completa.

## Tie-break

GREEDY incontra 144 decisioni in parità, tutte di ampiezza 2. Le quattro classi
deterministiche rilevanti sono:

```text
ADAPTATION prima/dopo FAT_RESERVES
STRENGTH prima/dopo GRIP_CLAWS
```

Tutte e quattro producono esattamente:

```text
512 vittorie / 208 pareggi / 0 sconfitte
Δ massimo +2
```

Le azioni GREEDY possono cambiare, ma la battibilità e gli aggregati non
dipendono dal tie-break.

## Perché il precedente certificato W ≤ E non vale più

Prima, ogni gene aveva al massimo un evento `+2`. Un'evoluzione poteva quindi
creare al massimo una vittoria primaria: il punto perso da `EVOLVE` veniva
recuperato, non superato.

Ora `METABOLISM` ha due eventi `+2`. Se l'ottimizzatore evolve una volta prima
di entrambi e i due `USE` non sono bloccati dal cooldown:

```text
EVOLVE: −1 punto
USE livello 1 + modificatore 2: +1 punto contro GREEDY
secondo USE livello 1 + modificatore 2: +1 punto contro GREEDY
saldo netto: +1
```

Quindi per `METABOLISM` può accadere `W = 2 > E = 1`. Nel risultato esatto tutte
le 512 sequenze vinte contengono almeno un `EVOLVE`.

## Metodo

Il solver importa il catalogo, la legalità, lo scoring e `resolveRound`
produttivi. Esamina tutte le 720 permutazioni senza Monte Carlo.

Usa:

- DP esatta su suffisso, livelli e cooldown;
- dominanza sicura dei `USE` perdenti rispetto a un `EVOLVE` legale;
- upper bound ottenuto rimuovendo il cooldown;
- branch-and-bound soltanto quando l'upper bound non può migliorare il migliore
  differenziale già trovato.

Statistiche:

- 395.158 stati del rilassamento;
- 7.867.420 transizioni del rilassamento;
- 7.432 stati produttivi completi;
- 143.058 azioni legali considerate;
- 59.476 rami potati per dominanza;
- 74.484 rami potati tramite upper bound;
- 528 sequenze hanno richiesto il fallback produttivo completo.

La DP corrente+prossimo ha visitato 586.916 stati informativi e considerato
11.466.741 azioni legali.

## Artefatti

- [`exact-best-response.ts`](./exact-best-response.ts)
- [`exact-best-response.test.ts`](./exact-best-response.test.ts)
- [`results.json`](./results.json), con percorso e stato completo round per
  round per tutte le sequenze
- [`report-before-overlap.md`](./report-before-overlap.md)

