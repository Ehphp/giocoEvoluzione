# Solver esatto della best response contro GREEDY

**La strategia GREEDY è battibile: no.**

Con le regole produttive correnti, la migliore risposta non vince in nessuna
delle 720 permutazioni dei sei eventi. In ogni sequenza può arrivare al
pareggio, ma non a un differenziale positivo.

## Risultato aggregato

| Esito della best response | Sequenze |
|---|---:|
| Vittoria | 0 |
| Pareggio | 720 |
| Sconfitta | 0 |
| Massimo differenziale | 0 |
| Minimo differenziale | 0 |

I percorsi completi, inclusi azioni, valori, punteggi, livelli e cooldown prima
e dopo ogni round, sono in [`results.json`](./results.json).

## Metodo esatto

Il solver importa direttamente il catalogo, la legalità delle azioni, lo
scoring e `resolveRound` produttivi. Non contiene una copia delle matrici, del
cooldown o dell'assegnazione dei punti e non usa Monte Carlo.

Per ogni permutazione costruisce due limiti:

1. **Limite inferiore legale:** la policy speculare usa il gene `+2` corrente.
   Ottiene sempre differenziale 0.
2. **Limite superiore:** una DP memoizzata concede all'ottimizzatore tutti i
   livelli produttivi ma rimuove il cooldown. Questo è un rilassamento: contiene
   tutte le sequenze d'azione realmente legali e anche azioni aggiuntive, quindi
   non può sottostimare il risultato reale.

Per tutte le 720 sequenze anche il problema rilassato ha valore 0. Ne segue

```text
0 = limite inferiore ≤ ottimo reale ≤ limite superiore = 0
```

quindi l'ottimo reale è esattamente 0 in ogni caso. La DP rilassata ha visitato
364.830 stati e valutato 7.264.500 transizioni tramite il motore produttivo.

Il solver contiene anche il fallback DP sullo stato produttivo completo
(suffisso degli eventi, livelli e cooldown di entrambi i giocatori). I punteggi
accumulati sono rimossi dalla chiave perché sono costanti additive e non
influenzano legalità o ricompense future; il nodo conserva invece i punti futuri
residui. Il fallback si attiva automaticamente se i due limiti divergono. Con
le regole correnti non si è attivato in alcuna sequenza: tutte e 720 sono state
chiuse dal certificato esatto.

## Perché EVOLVE non crea vantaggio

GREEDY usa un gene di livello 0 con modificatore `+2`, quindi ha valore 2.
Un `EVOLVE` ha valore 0: perde un punto nel round corrente.

Indichiamo con:

- `E` il numero di evoluzioni;
- `W` il numero di round vinti dall'ottimizzatore;
- `L` il numero di `USE` che perdono.

I pareggi non modificano il punteggio, quindi il differenziale finale è

```text
Δ = W − E − L.
```

Nel catalogo corrente, per ciascun gene:

- con un'evoluzione si può superare valore 2 soltanto nel suo evento `+2`, che
  compare al massimo una volta;
- con due evoluzioni si vince sugli eventi con modificatore almeno `+1`, che
  sono al massimo due per gene;
- con tre evoluzioni si sono già consumati tre dei sei round, quindi restano al
  massimo tre azioni capaci di vincere.

Ogni gene può dunque produrre al massimo tante vittorie quante evoluzioni sono
state investite in quel gene. Sommando sui geni, `W ≤ E`; pertanto
`Δ = W − E − L ≤ 0`. Un'evoluzione può recuperare il punto perso con una
vittoria successiva, ma non generare un guadagno netto. Il cooldown può soltanto
ridurre le opzioni rispetto a questo limite superiore.

## Tre best response che pareggiano

La sequenza usata negli esempi è:

```text
VOLCANIC_ASH_WAVE
PROLONGED_ECLIPSE
PREDATOR_PACK_MIGRATION
HEAT_SPIKE
NUTRIENT_COLLAPSE
FLASH_FLOOD
```

| Esempio | Azioni dell'ottimizzatore | Punteggio finale |
|---|---|---:|
| Speculare | `USE RESISTANCE`, `USE PERCEPTION`, `USE AGILITY`, `USE METABOLISM`, `USE FAT_RESERVES`, `USE WEBBED_LIMBS` | 0–0 |
| Evoluzione per il round 2 | `EVOLVE PERCEPTION`, poi `USE PERCEPTION`, quindi i quattro `+2` correnti | 1–1 |
| Evoluzione per il round 3 | `EVOLVE AGILITY`, `USE PERCEPTION`, `USE AGILITY`, quindi i tre `+2` correnti | 1–1 |

Nel secondo esempio il round 1 finisce 0 contro 2 e porta il punteggio a 0–1.
Nel round 2 `PERCEPTION` è a livello 1: `1 + 2 = 3`, batte il valore 2 di
GREEDY e riporta il punteggio a 1–1. Nel terzo esempio lo stesso recupero
avviene al round 3 con `AGILITY`. Tutti i successivi `USE +2` pareggiano.

Per la risposta speculare, round per round:

| Round | Evento | Azione di entrambi | Valori | Livelli dopo | Cooldown dopo | Punteggio |
|---:|---|---|---:|---|---|---:|
| 1 | `VOLCANIC_ASH_WAVE` | `USE RESISTANCE` | 2–2 | tutti 0 | `RESISTANCE=1` | 0–0 |
| 2 | `PROLONGED_ECLIPSE` | `USE PERCEPTION` | 2–2 | tutti 0 | `PERCEPTION=1` | 0–0 |
| 3 | `PREDATOR_PACK_MIGRATION` | `USE AGILITY` | 2–2 | tutti 0 | `AGILITY=1` | 0–0 |
| 4 | `HEAT_SPIKE` | `USE METABOLISM` | 2–2 | tutti 0 | `METABOLISM=1` | 0–0 |
| 5 | `NUTRIENT_COLLAPSE` | `USE FAT_RESERVES` | 2–2 | tutti 0 | `FAT_RESERVES=1` | 0–0 |
| 6 | `FLASH_FLOOD` | `USE WEBBED_LIMBS` | 2–2 | tutti 0 | `WEBBED_LIMBS=1` | 0–0 |

Il gene usato nel round precedente torna a cooldown 0 durante la risoluzione
del round successivo. Poiché i sei geni `+2` sono distinti, il cooldown non
impedisce mai la scelta speculare.

## Varianti richieste

| Variante | Vittorie | Pareggi | Sconfitte | Δ max | Δ min |
|---|---:|---:|---:|---:|---:|
| GREEDY sceglie sempre il `+2` | 0 | 720 | 0 | 0 | 0 |
| GREEDY massimizza valore immediato con livelli/cooldown | 0 | 720 | 0 | 0 | 0 |
| Best response conosce tutta la sequenza | 0 | 720 | 0 | 0 | 0 |
| Best response vede corrente e prossimo | 0 | 720 | 0 | 0 | 0 |

La variante limitata usa in realtà soltanto l'evento corrente: la policy
speculare ottiene 0 in ogni sequenza. Poiché la best response senza limiti di
informazione non può superare 0, anche l'ottimo con informazione limitata è
esattamente 0.

Sui 4.320 turni esaminati per ciascuna definizione di GREEDY, il candidato
massimo è sempre unico: 0 tie, ampiezza massima del tie pari a 1. L'ordine del
catalogo e l'ordine inverso scelgono sempre la stessa azione. Di conseguenza
**tutti** i tie-break deterministici possibili sono equivalenti e
l'imbattibilità non dipende dal tie-break.

## Interpretazione corretta

- **“GREEDY vince spesso”** è un'affermazione statistica contro una
  distribuzione di avversari. Questa analisi non la usa come prova; contro la
  best response GREEDY pareggia sempre.
- **GREEDY è maximin:** sì. Garantisce differenziale almeno 0 e il valore del
  gioco è 0, perché la risposta speculare realizza il pareggio.
- **GREEDY è imbattibile:** sì, nelle regole e nell'orizzonte analizzati.
  Nessuna sequenza legale ottiene differenziale positivo.
- **GREEDY è strettamente dominante:** no. Una policy speculare ottiene lo
  stesso risultato, quindi GREEDY non è strettamente migliore di ogni altra
  strategia in ogni confronto.

## Significato di design

Il catalogo lega ogni evento a un gene `+2` diverso. Questo rende la decisione
locale anche globalmente sicura: il cooldown non entra mai in conflitto e il
costo di `EVOLVE` è bilanciato, nel migliore dei casi, da una sola vittoria per
livello investito. La conoscenza del futuro non crea quindi valore strategico.

Tre modifiche minime capaci di rompere questa struttura, non implementate:

1. Aggiungere `CAMOUFLAGE +1` a un terzo evento. Due evoluzioni potrebbero così
   alimentare tre vittorie, rompendo `W ≤ E`.
2. Assegnare lo stesso gene `+2` a due eventi. Quando sono consecutivi, il
   cooldown rende il `+2` del secondo evento non sempre legale.
3. Abbassare il massimo di un evento da `+2` a `+1`. In quell'evento il gene
   indicato dal catalogo non sarebbe più automaticamente una risposta di
   valore 2 e gli investimenti precedenti potrebbero cambiare il massimo.

Queste sono proposte di design soltanto; nessuna meccanica produttiva è stata
modificata.

## Verifiche automatiche

[`exact-best-response.test.ts`](./exact-best-response.test.ts) controlla:

- unicità e copertura delle 720 permutazioni;
- legalità e replay di ogni percorso tramite `resolveRound`;
- aggiornamento produttivo di livelli e cooldown;
- determinismo e ripetibilità;
- ricostruzione dei percorsi ottimali;
- assenza di mutazioni del catalogo e dello stato iniziale;
- equivalenza delle varianti GREEDY e indipendenza dal tie-break;
- validità delle tre best response di esempio.

