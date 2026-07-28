# Metagame audit

- 8 policy; 3 sequenze; seed 1592598566; 6484 ms.
- Tie-break: 36; pareggi fra policy diverse: 13.7%; margine finale medio: 1.64.
- Partite decise prima dell’ultimo round: 156 (R4=26, R5=76, R6=54); matchup 324 (188 decisivi).
- Lookahead: 20624 stati, cache 0/20624 hit/miss.

## Matrice policy

| Policy | Win rate | SX/DX | USE/EVOLVE | Concentrazione |
|---|---:|---:|---:|---:|
| random | 0.0% | 0.0 / 0.0 | 56.7 / 43.3 | 23.0% |
| greedy-use | 37.5% | 37.5 / 37.5 | 100.0 / 0.0 | 29.0% |
| evolve-first | 41.7% | 41.7 / 41.7 | 70.4 / 29.6 | 27.5% |
| heuristic | 41.7% | 41.7 / 41.7 | 73.4 / 26.6 | 22.9% |
| lookahead-2 | 64.6% | 64.6 / 64.6 | 92.7 / 7.3 | 23.2% |
| param-evolve-1 | 39.6% | 39.6 / 39.6 | 84.8 / 15.2 | 36.4% |
| param-matchup | 39.6% | 39.6 / 39.6 | 100.0 / 0.0 | 26.2% |
| param-evolve-behind | 37.5% | 37.5 / 37.5 | 90.3 / 9.7 | 29.5% |

## Anomalie

- Nessuna soglia automatica superata nel campione.

## Esempi riproducibili

- Win rate iniziale anomalo: random vs greedy-use, seed 1814767586, eventi PROLONGED_ECLIPSE, PREDATOR_PACK_MIGRATION, VOLCANIC_ASH_WAVE, NUTRIENT_COLLAPSE, FLASH_FLOOD, HEAT_SPIKE, PROLONGED_ECLIPSE, punteggio 0-4.
- Win rate iniziale anomalo: random vs greedy-use, seed 1814758611, eventi PROLONGED_ECLIPSE, PREDATOR_PACK_MIGRATION, VOLCANIC_ASH_WAVE, NUTRIENT_COLLAPSE, FLASH_FLOOD, HEAT_SPIKE, PROLONGED_ECLIPSE, punteggio 1-2.
- Win rate iniziale anomalo: random vs greedy-use, seed 1814767437, eventi NUTRIENT_COLLAPSE, PROLONGED_ECLIPSE, VOLCANIC_ASH_WAVE, HEAT_SPIKE, PREDATOR_PACK_MIGRATION, FLASH_FLOOD, NUTRIENT_COLLAPSE, punteggio 0-4.
- Win rate iniziale anomalo: random vs greedy-use, seed 1814758524, eventi NUTRIENT_COLLAPSE, PROLONGED_ECLIPSE, VOLCANIC_ASH_WAVE, HEAT_SPIKE, PREDATOR_PACK_MIGRATION, FLASH_FLOOD, NUTRIENT_COLLAPSE, punteggio 1-4.
- Win rate iniziale anomalo: random vs greedy-use, seed 1814767272, eventi NUTRIENT_COLLAPSE, PROLONGED_ECLIPSE, PREDATOR_PACK_MIGRATION, VOLCANIC_ASH_WAVE, FLASH_FLOOD, HEAT_SPIKE, NUTRIENT_COLLAPSE, punteggio 1-4.
- Win rate iniziale anomalo: random vs greedy-use, seed 1814758809, eventi NUTRIENT_COLLAPSE, PROLONGED_ECLIPSE, PREDATOR_PACK_MIGRATION, VOLCANIC_ASH_WAVE, FLASH_FLOOD, HEAT_SPIKE, NUTRIENT_COLLAPSE, punteggio 0-4.
- Win rate iniziale anomalo: random vs evolve-first, seed 1528894806, eventi PROLONGED_ECLIPSE, PREDATOR_PACK_MIGRATION, VOLCANIC_ASH_WAVE, NUTRIENT_COLLAPSE, FLASH_FLOOD, HEAT_SPIKE, PROLONGED_ECLIPSE, punteggio 1-3.
- Win rate iniziale anomalo: random vs evolve-first, seed 1528903271, eventi PROLONGED_ECLIPSE, PREDATOR_PACK_MIGRATION, VOLCANIC_ASH_WAVE, NUTRIENT_COLLAPSE, FLASH_FLOOD, HEAT_SPIKE, PROLONGED_ECLIPSE, punteggio 0-4.
- Win rate iniziale anomalo: random vs evolve-first, seed 1528894969, eventi NUTRIENT_COLLAPSE, PROLONGED_ECLIPSE, VOLCANIC_ASH_WAVE, HEAT_SPIKE, PREDATOR_PACK_MIGRATION, FLASH_FLOOD, NUTRIENT_COLLAPSE, punteggio 2-4.
- Win rate iniziale anomalo: random vs evolve-first, seed 1528903368, eventi NUTRIENT_COLLAPSE, PROLONGED_ECLIPSE, VOLCANIC_ASH_WAVE, HEAT_SPIKE, PREDATOR_PACK_MIGRATION, FLASH_FLOOD, NUTRIENT_COLLAPSE, punteggio 1-4.
- Win rate iniziale anomalo: random vs evolve-first, seed 1528894492, eventi NUTRIENT_COLLAPSE, PROLONGED_ECLIPSE, PREDATOR_PACK_MIGRATION, VOLCANIC_ASH_WAVE, FLASH_FLOOD, HEAT_SPIKE, NUTRIENT_COLLAPSE, punteggio 1-4.
- Win rate iniziale anomalo: random vs evolve-first, seed 1528903469, eventi NUTRIENT_COLLAPSE, PROLONGED_ECLIPSE, PREDATOR_PACK_MIGRATION, VOLCANIC_ASH_WAVE, FLASH_FLOOD, HEAT_SPIKE, NUTRIENT_COLLAPSE, punteggio 1-4.
