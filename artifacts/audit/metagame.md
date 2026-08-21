# Metagame audit

- 8 policy; 3 sequenze; seed 1592598566; 940 ms.
- Tie-break: 48; pareggi fra policy diverse: 6.5%; margine finale medio: 1.81.
- Partite decise prima dell’ultimo round: 198 (R4=20, R5=82, R6=96); matchup 528 (410 decisivi).
- Combat Mutations: Elastic 670; Core armato 662; bonus 420; armato non consumato 242.
- Lookahead: 9068 stati, cache 0/9068 hit/miss.

## Matrice policy

| Policy | Win rate | SX/DX | USE/EVOLVE | Concentrazione |
|---|---:|---:|---:|---:|
| random | 0.0% | 0.0 / 0.0 | 54.3 / 45.7 | 23.2% |
| greedy-immediate-use | 33.3% | 33.3 / 33.3 | 89.7 / 10.3 | 29.9% |
| evolve-first | 39.6% | 39.6 / 39.6 | 70.7 / 29.3 | 22.9% |
| heuristic | 60.4% | 60.4 / 60.4 | 86.8 / 13.2 | 26.0% |
| lookahead-2 | 72.9% | 72.9 / 72.9 | 83.9 / 16.1 | 27.1% |
| param-evolve-1 | 45.8% | 45.8 / 45.8 | 84.2 / 15.8 | 31.6% |
| param-matchup | 35.4% | 35.4 / 35.4 | 89.3 / 10.7 | 32.0% |
| param-evolve-behind | 39.6% | 39.6 / 39.6 | 72.3 / 27.7 | 28.4% |

## Matrice loadout 2/4

| Loadout | Score rate | SX/DX | Evolvi | Effetti | Azioni illegali |
|---|---:|---:|---:|---|---:|
| ELASTIC_LIMBS+ADAPTIVE_CORE | 56.9% | 44.4 / 44.4 | 7.1% | ELASTIC_LIMBS=72, ADAPTIVE_CORE=126 | 0 |
| ELASTIC_LIMBS+ARMORED_MEMORY | 67.4% | 52.8 / 55.6 | 0.0% | ELASTIC_LIMBS=72, ARMORED_MEMORY=72 | 0 |
| ELASTIC_LIMBS+RECOVERY_SURGE | 61.8% | 44.4 / 47.2 | 7.1% | ELASTIC_LIMBS=72, RECOVERY_SURGE=72 | 0 |
| ADAPTIVE_CORE+ARMORED_MEMORY | 34.7% | 22.2 / 16.7 | 7.1% | ADAPTIVE_CORE=118, ARMORED_MEMORY=72 | 0 |
| ADAPTIVE_CORE+RECOVERY_SURGE | 43.8% | 33.3 / 36.1 | 7.1% | ADAPTIVE_CORE=144, RECOVERY_SURGE=72 | 0 |
| ARMORED_MEMORY+RECOVERY_SURGE | 35.4% | 22.2 / 19.4 | 7.1% | ARMORED_MEMORY=72, RECOVERY_SURGE=72 | 0 |

## Anomalie

- dominant-policy: {"type":"dominant-policy","policy":"lookahead-2","value":0.7291666666666666,"examples":[]}

## Esempi riproducibili

- Win rate iniziale anomalo: random vs greedy-immediate-use, seed -185225444, eventi NUTRIENT_COLLAPSE, PROLONGED_ECLIPSE, VOLCANIC_ASH_WAVE, HEAT_SPIKE, PREDATOR_PACK_MIGRATION, FLASH_FLOOD, NUTRIENT_COLLAPSE, punteggio 1-4.
- Win rate iniziale anomalo: random vs greedy-immediate-use, seed -185233976, eventi NUTRIENT_COLLAPSE, PROLONGED_ECLIPSE, PREDATOR_PACK_MIGRATION, VOLCANIC_ASH_WAVE, FLASH_FLOOD, HEAT_SPIKE, NUTRIENT_COLLAPSE, punteggio 0-4.
- Win rate iniziale anomalo: random vs greedy-immediate-use, seed -185225479, eventi NUTRIENT_COLLAPSE, PROLONGED_ECLIPSE, PREDATOR_PACK_MIGRATION, VOLCANIC_ASH_WAVE, FLASH_FLOOD, HEAT_SPIKE, NUTRIENT_COLLAPSE, punteggio 2-3.
- Win rate iniziale anomalo: random vs evolve-first, seed 1528894806, eventi PROLONGED_ECLIPSE, PREDATOR_PACK_MIGRATION, VOLCANIC_ASH_WAVE, NUTRIENT_COLLAPSE, FLASH_FLOOD, HEAT_SPIKE, PROLONGED_ECLIPSE, punteggio 2-4.
- Tie-break: random vs evolve-first, seed 1528903271, eventi PROLONGED_ECLIPSE, PREDATOR_PACK_MIGRATION, VOLCANIC_ASH_WAVE, NUTRIENT_COLLAPSE, FLASH_FLOOD, HEAT_SPIKE, PROLONGED_ECLIPSE, punteggio 3-3.
- Win rate iniziale anomalo: random vs evolve-first, seed 1528894969, eventi NUTRIENT_COLLAPSE, PROLONGED_ECLIPSE, VOLCANIC_ASH_WAVE, HEAT_SPIKE, PREDATOR_PACK_MIGRATION, FLASH_FLOOD, NUTRIENT_COLLAPSE, punteggio 1-4.
- Win rate iniziale anomalo: random vs evolve-first, seed 1528903368, eventi NUTRIENT_COLLAPSE, PROLONGED_ECLIPSE, VOLCANIC_ASH_WAVE, HEAT_SPIKE, PREDATOR_PACK_MIGRATION, FLASH_FLOOD, NUTRIENT_COLLAPSE, punteggio 1-4.
- Tie-break: random vs evolve-first, seed 1528894492, eventi NUTRIENT_COLLAPSE, PROLONGED_ECLIPSE, PREDATOR_PACK_MIGRATION, VOLCANIC_ASH_WAVE, FLASH_FLOOD, HEAT_SPIKE, NUTRIENT_COLLAPSE, punteggio 3-3.
- Win rate iniziale anomalo: random vs evolve-first, seed 1528903469, eventi NUTRIENT_COLLAPSE, PROLONGED_ECLIPSE, PREDATOR_PACK_MIGRATION, VOLCANIC_ASH_WAVE, FLASH_FLOOD, HEAT_SPIKE, NUTRIENT_COLLAPSE, punteggio 2-4.
- Win rate iniziale anomalo: random vs heuristic, seed -281354474, eventi PROLONGED_ECLIPSE, PREDATOR_PACK_MIGRATION, VOLCANIC_ASH_WAVE, NUTRIENT_COLLAPSE, FLASH_FLOOD, HEAT_SPIKE, PROLONGED_ECLIPSE, punteggio 1-4.
- Win rate iniziale anomalo: random vs heuristic, seed -281347033, eventi PROLONGED_ECLIPSE, PREDATOR_PACK_MIGRATION, VOLCANIC_ASH_WAVE, NUTRIENT_COLLAPSE, FLASH_FLOOD, HEAT_SPIKE, PROLONGED_ECLIPSE, punteggio 1-4.
- Win rate iniziale anomalo: random vs heuristic, seed -281354311, eventi NUTRIENT_COLLAPSE, PROLONGED_ECLIPSE, VOLCANIC_ASH_WAVE, HEAT_SPIKE, PREDATOR_PACK_MIGRATION, FLASH_FLOOD, NUTRIENT_COLLAPSE, punteggio 1-4.
