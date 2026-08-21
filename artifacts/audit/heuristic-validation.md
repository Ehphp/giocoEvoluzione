# Heuristic validation

- 126 stati, 439 ms.
- EVOLVE immediateValue is exactly EVOLVE_ROUND_VALUE; evolution is only the next-visible-event level gain. They are separate terms and not the same value counted twice.

## Heuristic vs lookahead-3

| Scelta heuristic → lookahead | Frequenza | Delta round osservato |
|---|---:|---:|
| USE → USE different | 31.7% | 0.70 |
| USE → EVOLVE | 23.8% | -0.30 |
| EVOLVE → USE | 4.8% | -2.67 |
| same | 33.3% | 0.83 |
| EVOLVE → EVOLVE different | 6.3% | -2.63 |

## Componenti heuristic medie

- immediateValue: 14.968
- matchup: 0.509
- level: 0.183
- conservation: -8.135
- evolution: 8.135
- remainingRounds: 6.331
- scorePressure: 0.187
- decisiveRound: 0.571

Casi heuristic=EVOLVE, lookahead=USE: 6. Vedi JSON per seed, eventi e valutazioni per azione.
