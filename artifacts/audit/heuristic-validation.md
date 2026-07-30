# Heuristic validation

- 125 stati, 299 ms.
- EVOLVE immediateValue is exactly EVOLVE_ROUND_VALUE; evolution is only the next-visible-event level gain. They are separate terms and not the same value counted twice.

## Heuristic vs lookahead-3

| Scelta heuristic → lookahead | Frequenza | Delta round osservato |
|---|---:|---:|
| USE → USE different | 22.4% | 0.61 |
| USE → EVOLVE | 22.4% | -0.43 |
| EVOLVE → USE | 1.6% | -2.00 |
| same | 43.2% | 0.57 |
| EVOLVE → EVOLVE different | 10.4% | -0.77 |

## Componenti heuristic medie

- immediateValue: 12.680
- matchup: 0.466
- level: 0.184
- conservation: -5.184
- evolution: 5.000
- remainingRounds: 6.770
- scorePressure: 0.000
- decisiveRound: 0.456

Casi heuristic=EVOLVE, lookahead=USE: 2. Vedi JSON per seed, eventi e valutazioni per azione.
