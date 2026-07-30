# Metagame audit

- 8 policy; 3 sequenze; seed 1592598566; 382 ms.
- Tie-break: 44; pareggi fra policy diverse: 4.8%; margine finale medio: 1.84.
- Partite decise prima dell’ultimo round: 174 (R4=42, R5=76, R6=56); matchup 534 (426 decisivi).
- Lookahead: 8276 stati, cache 0/8276 hit/miss.

## Matrice policy

| Policy | Win rate | SX/DX | USE/EVOLVE | Concentrazione |
|---|---:|---:|---:|---:|
| random | 2.1% | 2.1 / 2.1 | 52.8 / 47.2 | 24.1% |
| greedy-immediate-use | 47.9% | 47.9 / 47.9 | 86.9 / 13.1 | 22.4% |
| evolve-first | 35.4% | 35.4 / 35.4 | 70.4 / 29.6 | 21.6% |
| heuristic | 52.1% | 52.1 / 52.1 | 86.0 / 14.0 | 26.0% |
| lookahead-2 | 77.1% | 77.1 / 77.1 | 85.0 / 15.0 | 23.9% |
| param-evolve-1 | 41.7% | 41.7 / 41.7 | 75.1 / 24.9 | 34.6% |
| param-matchup | 43.8% | 43.8 / 43.8 | 87.3 / 12.7 | 22.9% |
| param-evolve-behind | 33.3% | 33.3 / 33.3 | 71.7 / 28.3 | 32.1% |

## Anomalie

- dominant-policy: {"type":"dominant-policy","policy":"lookahead-2","value":0.7708333333333334,"examples":[]}

## Esempi riproducibili

- Tie-break: random vs greedy-immediate-use, seed -185225293, eventi PROLONGED_ECLIPSE, PREDATOR_PACK_MIGRATION, VOLCANIC_ASH_WAVE, NUTRIENT_COLLAPSE, FLASH_FLOOD, HEAT_SPIKE, PROLONGED_ECLIPSE, punteggio 3-3.
- Win rate iniziale anomalo: random vs greedy-immediate-use, seed -185225444, eventi NUTRIENT_COLLAPSE, PROLONGED_ECLIPSE, VOLCANIC_ASH_WAVE, HEAT_SPIKE, PREDATOR_PACK_MIGRATION, FLASH_FLOOD, NUTRIENT_COLLAPSE, punteggio 1-4.
- Win rate iniziale anomalo: random vs greedy-immediate-use, seed -185233976, eventi NUTRIENT_COLLAPSE, PROLONGED_ECLIPSE, PREDATOR_PACK_MIGRATION, VOLCANIC_ASH_WAVE, FLASH_FLOOD, HEAT_SPIKE, NUTRIENT_COLLAPSE, punteggio 0-4.
- Tie-break: random vs greedy-immediate-use, seed -185225479, eventi NUTRIENT_COLLAPSE, PROLONGED_ECLIPSE, PREDATOR_PACK_MIGRATION, VOLCANIC_ASH_WAVE, FLASH_FLOOD, HEAT_SPIKE, NUTRIENT_COLLAPSE, punteggio 3-3.
- Tie-break: random vs evolve-first, seed 1528894806, eventi PROLONGED_ECLIPSE, PREDATOR_PACK_MIGRATION, VOLCANIC_ASH_WAVE, NUTRIENT_COLLAPSE, FLASH_FLOOD, HEAT_SPIKE, PROLONGED_ECLIPSE, punteggio 3-3.
- Win rate iniziale anomalo: random vs evolve-first, seed 1528903271, eventi PROLONGED_ECLIPSE, PREDATOR_PACK_MIGRATION, VOLCANIC_ASH_WAVE, NUTRIENT_COLLAPSE, FLASH_FLOOD, HEAT_SPIKE, PROLONGED_ECLIPSE, punteggio 2-3.
- Win rate iniziale anomalo: random vs evolve-first, seed 1528894969, eventi NUTRIENT_COLLAPSE, PROLONGED_ECLIPSE, VOLCANIC_ASH_WAVE, HEAT_SPIKE, PREDATOR_PACK_MIGRATION, FLASH_FLOOD, NUTRIENT_COLLAPSE, punteggio 1-4.
- Win rate iniziale anomalo: random vs evolve-first, seed 1528903368, eventi NUTRIENT_COLLAPSE, PROLONGED_ECLIPSE, VOLCANIC_ASH_WAVE, HEAT_SPIKE, PREDATOR_PACK_MIGRATION, FLASH_FLOOD, NUTRIENT_COLLAPSE, punteggio 1-4.
- Tie-break: random vs evolve-first, seed 1528894492, eventi NUTRIENT_COLLAPSE, PROLONGED_ECLIPSE, PREDATOR_PACK_MIGRATION, VOLCANIC_ASH_WAVE, FLASH_FLOOD, HEAT_SPIKE, NUTRIENT_COLLAPSE, punteggio 3-3.
- Win rate iniziale anomalo: random vs evolve-first, seed 1528903469, eventi NUTRIENT_COLLAPSE, PROLONGED_ECLIPSE, PREDATOR_PACK_MIGRATION, VOLCANIC_ASH_WAVE, FLASH_FLOOD, HEAT_SPIKE, NUTRIENT_COLLAPSE, punteggio 2-3.
- Win rate iniziale anomalo: random vs heuristic, seed -281354474, eventi PROLONGED_ECLIPSE, PREDATOR_PACK_MIGRATION, VOLCANIC_ASH_WAVE, NUTRIENT_COLLAPSE, FLASH_FLOOD, HEAT_SPIKE, PROLONGED_ECLIPSE, punteggio 0-4.
- Win rate iniziale anomalo: random vs heuristic, seed -281347033, eventi PROLONGED_ECLIPSE, PREDATOR_PACK_MIGRATION, VOLCANIC_ASH_WAVE, NUTRIENT_COLLAPSE, FLASH_FLOOD, HEAT_SPIKE, PROLONGED_ECLIPSE, punteggio 1-4.
