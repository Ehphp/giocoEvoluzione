# Heuristic validation

- 126 stati, 11227 ms.
- EVOLVE immediateValue is exactly EVOLVE_ROUND_VALUE; evolution is only the next-visible-event level gain. They are separate terms and not the same value counted twice.

## Heuristic vs lookahead-3

| Scelta heuristic → lookahead | Frequenza | Delta round osservato |
|---|---:|---:|
| same | 63.5% | 0.85 |
| EVOLVE → USE | 19.0% | -0.92 |
| USE → USE different | 7.1% | -0.44 |
| EVOLVE → EVOLVE different | 6.3% | -1.00 |
| USE → EVOLVE | 4.0% | 2.80 |

## Componenti heuristic medie

- immediateValue: 17.770
- matchup: 0.864
- level: 0.833
- cooldown: -3.532
- evolution: 4.357
- remainingRounds: 5.262
- scorePressure: 1.344
- decisiveRound: 1.252

Casi heuristic=EVOLVE, lookahead=USE: 20. Vedi JSON per seed, eventi e valutazioni per azione.
