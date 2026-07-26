# Ranking automatico dei cataloghi

Seed: `1369948382`. Candidati valutati: 240.

## Fitness

La fitness (massimo teorico 100 prima delle penalità) usa:

- profondità strategica / best response non banale: 18;
- cooldown rilevante: 14;
- EVOLVE utile ma non obbligatorio: 14;
- decisioni modificate dal lookahead: 12;
- entropia dei pick: 12;
- controllo dei pareggi: 8;
- varietà delle policy: 10;
- penalità dominanza universale: fino a 12;
- penalità concentrazione di un gene: fino a 10;
- penalità EVOLVE obbligatorio: fino a 8.

“EVOLVE obbligatorio” è misurato esattamente: per ogni sequenza il DP
confronta l’optimum completo con l’optimum vincolato a sole azioni USE.

Le componenti premiate sono triangolari attorno a obiettivi intermedi,
quindi la ricerca non massimizza semplicemente le vittorie contro GREEDY.

## Confronto sintetico

| # | Catalogo | Score | Solver W/D/L | EVOLVE % | EVOLVE necessario % | Cooldown % | Lookahead % | Pick max % | Dominance floor % |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| baseline | catalog-0001 | 54.8943 | 512/208/0 | 11.9444 | 98.8281 | 6.1111 | 12.2222 | 34.4444 | 40 |
| 1 | catalog-0226 | 57.7911 | 520/200/0 | 11.9213 | 96.5385 | 7.037 | 15.7407 | 32.7778 | 40 |
| 2 | catalog-0184 | 57.6387 | 518/202/0 | 11.8519 | 96.9112 | 6.9444 | 15.6481 | 32.7778 | 40 |
| 3 | catalog-0187 | 57.6387 | 518/202/0 | 11.8519 | 96.9112 | 6.9444 | 15.6481 | 32.7778 | 40 |
| 4 | catalog-0190 | 57.6387 | 518/202/0 | 11.8519 | 96.9112 | 6.9444 | 15.6481 | 32.7778 | 40 |
| 5 | catalog-0191 | 57.6387 | 518/202/0 | 11.8519 | 96.9112 | 6.9444 | 15.6481 | 32.7778 | 40 |
| 6 | catalog-0197 | 57.6387 | 518/202/0 | 11.8519 | 96.9112 | 6.9444 | 15.6481 | 32.7778 | 40 |
| 7 | catalog-0223 | 57.6387 | 518/202/0 | 11.8519 | 96.9112 | 6.9444 | 15.6481 | 32.7778 | 40 |
| 8 | catalog-0229 | 57.6387 | 518/202/0 | 11.8519 | 96.9112 | 6.9444 | 15.6481 | 32.7778 | 40 |
| 9 | catalog-0232 | 57.6136 | 516/204/0 | 11.9444 | 96.8992 | 6.9444 | 15.5556 | 32.7778 | 40 |
| 10 | catalog-0237 | 57.5889 | 516/204/0 | 11.9444 | 96.8992 | 6.9444 | 15.5556 | 32.7778 | 40 |

## 1. catalog-0226

- Best response: 520 vittorie, 200 pareggi, 0 sconfitte.
- Cooldown blocca il migliore USE nel 7.037% degli stati esatti.
- EVOLVE compare nel 11.9213% delle azioni ottime ed è necessario per l'optimum nel 96.5385% delle sequenze vinte; lookahead cambia il 15.7407%.
- Massimo pick-rate ottimo 32.7778%; floor universale massimo 40%.
- Geni principali duplicati: METABOLISM.

| Evento | STRENGTH | RESISTANCE | AGILITY | PERCEPTION | METABOLISM | ADAPTATION | GRIP_CLAWS | CAMOUFLAGE | WEBBED_LIMBS | FAT_RESERVES |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| VOLCANIC_ASH_WAVE | 0 | +1 | -1 | -1 | +1 | 0 | 0 | 0 | 0 | +2 |
| PROLONGED_ECLIPSE | 0 | 0 | 0 | 0 | -1 | +2 | +1 | 0 | 0 | 0 |
| PREDATOR_PACK_MIGRATION | +2 | 0 | +1 | +1 | 0 | 0 | 0 | +1 | 0 | 0 |
| HEAT_SPIKE | 0 | 0 | 0 | 0 | +2 | +1 | 0 | 0 | +1 | -1 |
| NUTRIENT_COLLAPSE | 0 | 0 | 0 | 0 | +2 | +1 | 0 | 0 | -1 | 0 |
| FLASH_FLOOD | +1 | 0 | -1 | 0 | 0 | 0 | +2 | 0 | +1 | -1 |

Pick-rate best response:

- STRENGTH: 15.2546%
- RESISTANCE: 0%
- AGILITY: 0%
- PERCEPTION: 0%
- METABOLISM: 32.7778%
- ADAPTATION: 20.3009%
- GRIP_CLAWS: 15.1389%
- CAMOUFLAGE: 0%
- WEBBED_LIMBS: 0.3935%
- FAT_RESERVES: 16.1343%

Audit contro random:

| Policy | W/D/L % | Score | USE | EVOLVE | Cooldown % | Tie % |
|---|---:|---:|---:|---:|---:|---:|
| random | 33.0556/24.7222/42.2222 | 1.1347 | 2.9486 | 3.0514 | 2.7546 | 59.375 |
| immediate | 100/0/0 | 5.5472 | 6 | 0 | 7.037 | 6.4815 |
| principal | 100/0/0 | 5.5472 | 6 | 0 | 7.037 | 6.4815 |
| lookahead1 | 100/0/0 | 5.3139 | 5.6667 | 0.3333 | 0 | 10.0926 |
| conserve_metabolism | 100/0/0 | 5.5444 | 6 | 0 | 0 | 6.6204 |
| evolve_alternative | 100/0/0 | 4.8403 | 5.1667 | 0.8333 | 6.2731 | 15.463 |
| E1 | 100/0/0 | 4.7056 | 5 | 1 | 6.5741 | 16.4352 |
| E2 | 99.5833/0.4167/0 | 3.7986 | 4 | 2 | 12.3148 | 29.0509 |
| E3 | 97.7778/2.2222/0 | 3.0278 | 3 | 3 | 14.4444 | 39.7454 |
| response_aware | 100/0/0 | 5.5472 | 6 | 0 | 7.037 | 6.4815 |
| exact_best_response | 100/0/0 | 5.0056 | 5.2847 | 0.7153 | 0.3935 | 13.7963 |

## 2. catalog-0184

- Best response: 518 vittorie, 202 pareggi, 0 sconfitte.
- Cooldown blocca il migliore USE nel 6.9444% degli stati esatti.
- EVOLVE compare nel 11.8519% delle azioni ottime ed è necessario per l'optimum nel 96.9112% delle sequenze vinte; lookahead cambia il 15.6481%.
- Massimo pick-rate ottimo 32.7778%; floor universale massimo 40%.
- Geni principali duplicati: METABOLISM.

| Evento | STRENGTH | RESISTANCE | AGILITY | PERCEPTION | METABOLISM | ADAPTATION | GRIP_CLAWS | CAMOUFLAGE | WEBBED_LIMBS | FAT_RESERVES |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| VOLCANIC_ASH_WAVE | 0 | +1 | 0 | -1 | +1 | 0 | 0 | 0 | -1 | +2 |
| PROLONGED_ECLIPSE | 0 | 0 | 0 | 0 | -1 | +2 | +1 | 0 | 0 | 0 |
| PREDATOR_PACK_MIGRATION | +1 | 0 | +1 | +1 | 0 | 0 | 0 | +2 | 0 | 0 |
| HEAT_SPIKE | 0 | 0 | 0 | 0 | +2 | +1 | 0 | 0 | +1 | -1 |
| NUTRIENT_COLLAPSE | 0 | 0 | 0 | 0 | +2 | +1 | 0 | 0 | 0 | 0 |
| FLASH_FLOOD | +1 | 0 | -1 | 0 | 0 | 0 | +2 | 0 | +1 | -1 |

Pick-rate best response:

- STRENGTH: 0%
- RESISTANCE: 0%
- AGILITY: 0%
- PERCEPTION: 0%
- METABOLISM: 32.7778%
- ADAPTATION: 20.3704%
- GRIP_CLAWS: 14.9537%
- CAMOUFLAGE: 16.1806%
- WEBBED_LIMBS: 0.3704%
- FAT_RESERVES: 15.3472%

Audit contro random:

| Policy | W/D/L % | Score | USE | EVOLVE | Cooldown % | Tie % |
|---|---:|---:|---:|---:|---:|---:|
| random | 33.75/26.5278/39.7222 | 1.1403 | 2.9486 | 3.0514 | 2.5463 | 59.9769 |
| immediate | 100/0/0 | 5.5556 | 6 | 0 | 6.9444 | 6.3426 |
| principal | 100/0/0 | 5.5556 | 6 | 0 | 6.9444 | 6.3426 |
| lookahead1 | 100/0/0 | 5.3083 | 5.6667 | 0.3333 | 0 | 10.1852 |
| conserve_metabolism | 100/0/0 | 5.5486 | 6 | 0 | 0 | 6.5509 |
| evolve_alternative | 100/0/0 | 4.8472 | 5.1667 | 0.8333 | 6.2037 | 15.3472 |
| E1 | 100/0/0 | 4.7278 | 5 | 1 | 6.0648 | 16.2037 |
| E2 | 99.4444/0.4167/0.1389 | 3.7847 | 4 | 2 | 12.8704 | 29.2593 |
| E3 | 97.7778/2.2222/0 | 3.0167 | 3 | 3 | 14.4444 | 39.9306 |
| response_aware | 100/0/0 | 5.5556 | 6 | 0 | 6.9444 | 6.3426 |
| exact_best_response | 100/0/0 | 5.0111 | 5.2889 | 0.7111 | 0.4167 | 13.7269 |

## 3. catalog-0187

- Best response: 518 vittorie, 202 pareggi, 0 sconfitte.
- Cooldown blocca il migliore USE nel 6.9444% degli stati esatti.
- EVOLVE compare nel 11.8519% delle azioni ottime ed è necessario per l'optimum nel 96.9112% delle sequenze vinte; lookahead cambia il 15.6481%.
- Massimo pick-rate ottimo 32.7778%; floor universale massimo 40%.
- Geni principali duplicati: METABOLISM.

| Evento | STRENGTH | RESISTANCE | AGILITY | PERCEPTION | METABOLISM | ADAPTATION | GRIP_CLAWS | CAMOUFLAGE | WEBBED_LIMBS | FAT_RESERVES |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| VOLCANIC_ASH_WAVE | 0 | +1 | 0 | -1 | +1 | 0 | 0 | 0 | -1 | +2 |
| PROLONGED_ECLIPSE | 0 | 0 | 0 | 0 | -1 | +2 | +1 | 0 | 0 | 0 |
| PREDATOR_PACK_MIGRATION | +1 | 0 | +1 | +1 | 0 | 0 | 0 | +2 | 0 | 0 |
| HEAT_SPIKE | 0 | 0 | 0 | 0 | +2 | +1 | 0 | 0 | +1 | -1 |
| NUTRIENT_COLLAPSE | 0 | 0 | 0 | 0 | +2 | +1 | 0 | 0 | -1 | 0 |
| FLASH_FLOOD | +1 | 0 | -1 | 0 | 0 | 0 | +2 | 0 | +1 | -1 |

Pick-rate best response:

- STRENGTH: 0%
- RESISTANCE: 0%
- AGILITY: 0%
- PERCEPTION: 0%
- METABOLISM: 32.7778%
- ADAPTATION: 20.3704%
- GRIP_CLAWS: 14.9537%
- CAMOUFLAGE: 16.1806%
- WEBBED_LIMBS: 0.3704%
- FAT_RESERVES: 15.3472%

Audit contro random:

| Policy | W/D/L % | Score | USE | EVOLVE | Cooldown % | Tie % |
|---|---:|---:|---:|---:|---:|---:|
| random | 34.0278/25.6944/40.2778 | 1.1681 | 2.9486 | 3.0514 | 2.5463 | 58.8889 |
| immediate | 100/0/0 | 5.5569 | 6 | 0 | 6.9444 | 6.3194 |
| principal | 100/0/0 | 5.5569 | 6 | 0 | 6.9444 | 6.3194 |
| lookahead1 | 100/0/0 | 5.3236 | 5.6667 | 0.3333 | 0 | 9.9306 |
| conserve_metabolism | 100/0/0 | 5.5542 | 6 | 0 | 0 | 6.4583 |
| evolve_alternative | 100/0/0 | 4.8486 | 5.1667 | 0.8333 | 6.2037 | 15.3241 |
| E1 | 100/0/0 | 4.7278 | 5 | 1 | 6.0648 | 16.2037 |
| E2 | 99.4444/0.4167/0.1389 | 3.7944 | 4 | 2 | 12.8704 | 29.0972 |
| E3 | 97.7778/2.2222/0 | 3.0319 | 3 | 3 | 14.4444 | 39.6759 |
| response_aware | 100/0/0 | 5.5569 | 6 | 0 | 6.9444 | 6.3194 |
| exact_best_response | 100/0/0 | 5.0236 | 5.2889 | 0.7111 | 0.4167 | 13.5185 |

## 4. catalog-0190

- Best response: 518 vittorie, 202 pareggi, 0 sconfitte.
- Cooldown blocca il migliore USE nel 6.9444% degli stati esatti.
- EVOLVE compare nel 11.8519% delle azioni ottime ed è necessario per l'optimum nel 96.9112% delle sequenze vinte; lookahead cambia il 15.6481%.
- Massimo pick-rate ottimo 32.7778%; floor universale massimo 40%.
- Geni principali duplicati: METABOLISM.

| Evento | STRENGTH | RESISTANCE | AGILITY | PERCEPTION | METABOLISM | ADAPTATION | GRIP_CLAWS | CAMOUFLAGE | WEBBED_LIMBS | FAT_RESERVES |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| VOLCANIC_ASH_WAVE | 0 | +1 | 0 | -1 | +1 | 0 | 0 | 0 | -1 | +2 |
| PROLONGED_ECLIPSE | 0 | 0 | 0 | 0 | 0 | +2 | +1 | +1 | 0 | 0 |
| PREDATOR_PACK_MIGRATION | 0 | 0 | +2 | +1 | 0 | 0 | 0 | +1 | 0 | -1 |
| HEAT_SPIKE | 0 | 0 | 0 | 0 | +2 | +1 | 0 | 0 | +1 | -1 |
| NUTRIENT_COLLAPSE | 0 | 0 | 0 | 0 | +2 | +1 | 0 | 0 | 0 | 0 |
| FLASH_FLOOD | +1 | 0 | -1 | 0 | 0 | 0 | +2 | 0 | +1 | -1 |

Pick-rate best response:

- STRENGTH: 0%
- RESISTANCE: 0%
- AGILITY: 16.1806%
- PERCEPTION: 0%
- METABOLISM: 32.7778%
- ADAPTATION: 20.3704%
- GRIP_CLAWS: 14.9537%
- CAMOUFLAGE: 0%
- WEBBED_LIMBS: 0.3704%
- FAT_RESERVES: 15.3472%

Audit contro random:

| Policy | W/D/L % | Score | USE | EVOLVE | Cooldown % | Tie % |
|---|---:|---:|---:|---:|---:|---:|
| random | 35/24.8611/40.1389 | 1.1333 | 2.9486 | 3.0514 | 2.8704 | 60.1389 |
| immediate | 100/0/0 | 5.5431 | 6 | 0 | 6.9444 | 6.412 |
| principal | 100/0/0 | 5.5431 | 6 | 0 | 6.9444 | 6.412 |
| lookahead1 | 100/0/0 | 5.3014 | 5.6667 | 0.3333 | 0 | 10.162 |
| conserve_metabolism | 100/0/0 | 5.5417 | 6 | 0 | 0 | 6.5278 |
| evolve_alternative | 100/0/0 | 4.8292 | 5.1667 | 0.8333 | 6.2037 | 15.5787 |
| E1 | 99.8611/0.1389/0 | 4.6958 | 5 | 1 | 6.1574 | 16.6204 |
| E2 | 99.4444/0.4167/0.1389 | 3.7764 | 4 | 2 | 11.7593 | 29.4907 |
| E3 | 97.7778/1.9444/0.2778 | 2.9917 | 3 | 3 | 14.4444 | 40.463 |
| response_aware | 100/0/0 | 5.5431 | 6 | 0 | 6.9444 | 6.412 |
| exact_best_response | 100/0/0 | 5.0083 | 5.2889 | 0.7111 | 0.4167 | 13.6574 |

## 5. catalog-0191

- Best response: 518 vittorie, 202 pareggi, 0 sconfitte.
- Cooldown blocca il migliore USE nel 6.9444% degli stati esatti.
- EVOLVE compare nel 11.8519% delle azioni ottime ed è necessario per l'optimum nel 96.9112% delle sequenze vinte; lookahead cambia il 15.6481%.
- Massimo pick-rate ottimo 32.7778%; floor universale massimo 40%.
- Geni principali duplicati: METABOLISM.

| Evento | STRENGTH | RESISTANCE | AGILITY | PERCEPTION | METABOLISM | ADAPTATION | GRIP_CLAWS | CAMOUFLAGE | WEBBED_LIMBS | FAT_RESERVES |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| VOLCANIC_ASH_WAVE | 0 | +1 | -1 | -1 | +1 | 0 | 0 | 0 | 0 | +2 |
| PROLONGED_ECLIPSE | 0 | 0 | 0 | 0 | -1 | +2 | +1 | 0 | 0 | 0 |
| PREDATOR_PACK_MIGRATION | +1 | 0 | +1 | +1 | 0 | 0 | 0 | +2 | 0 | 0 |
| HEAT_SPIKE | 0 | 0 | 0 | 0 | +2 | +1 | 0 | 0 | +1 | -1 |
| NUTRIENT_COLLAPSE | 0 | 0 | 0 | 0 | +2 | +1 | 0 | 0 | -1 | 0 |
| FLASH_FLOOD | +1 | 0 | -1 | 0 | 0 | 0 | +2 | 0 | +1 | -1 |

Pick-rate best response:

- STRENGTH: 0%
- RESISTANCE: 0%
- AGILITY: 0%
- PERCEPTION: 0%
- METABOLISM: 32.7778%
- ADAPTATION: 20.3704%
- GRIP_CLAWS: 14.9537%
- CAMOUFLAGE: 16.1806%
- WEBBED_LIMBS: 0.3704%
- FAT_RESERVES: 15.3472%

Audit contro random:

| Policy | W/D/L % | Score | USE | EVOLVE | Cooldown % | Tie % |
|---|---:|---:|---:|---:|---:|---:|
| random | 32.7778/24.8611/42.3611 | 1.1306 | 2.9486 | 3.0514 | 2.5463 | 59.4213 |
| immediate | 100/0/0 | 5.5556 | 6 | 0 | 6.9444 | 6.3426 |
| principal | 100/0/0 | 5.5556 | 6 | 0 | 6.9444 | 6.3426 |
| lookahead1 | 100/0/0 | 5.3222 | 5.6667 | 0.3333 | 0 | 9.9537 |
| conserve_metabolism | 100/0/0 | 5.5528 | 6 | 0 | 0 | 6.4815 |
| evolve_alternative | 100/0/0 | 4.8514 | 5.1667 | 0.8333 | 6.2037 | 15.2778 |
| E1 | 100/0/0 | 4.7264 | 5 | 1 | 6.0648 | 16.2269 |
| E2 | 99.4444/0.4167/0.1389 | 3.7917 | 4 | 2 | 12.8704 | 29.1435 |
| E3 | 97.7778/2.2222/0 | 3.0264 | 3 | 3 | 14.4444 | 39.7685 |
| response_aware | 100/0/0 | 5.5556 | 6 | 0 | 6.9444 | 6.3426 |
| exact_best_response | 100/0/0 | 5.0194 | 5.2889 | 0.7111 | 0.4167 | 13.588 |

## 6. catalog-0197

- Best response: 518 vittorie, 202 pareggi, 0 sconfitte.
- Cooldown blocca il migliore USE nel 6.9444% degli stati esatti.
- EVOLVE compare nel 11.8519% delle azioni ottime ed è necessario per l'optimum nel 96.9112% delle sequenze vinte; lookahead cambia il 15.6481%.
- Massimo pick-rate ottimo 32.7778%; floor universale massimo 40%.
- Geni principali duplicati: METABOLISM.

| Evento | STRENGTH | RESISTANCE | AGILITY | PERCEPTION | METABOLISM | ADAPTATION | GRIP_CLAWS | CAMOUFLAGE | WEBBED_LIMBS | FAT_RESERVES |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| VOLCANIC_ASH_WAVE | 0 | +1 | 0 | -1 | +1 | 0 | 0 | 0 | -1 | +2 |
| PROLONGED_ECLIPSE | 0 | 0 | 0 | 0 | -1 | +2 | +1 | 0 | 0 | 0 |
| PREDATOR_PACK_MIGRATION | +1 | 0 | +1 | +1 | 0 | 0 | 0 | +2 | 0 | 0 |
| HEAT_SPIKE | 0 | 0 | 0 | 0 | +2 | +1 | 0 | 0 | +1 | -1 |
| NUTRIENT_COLLAPSE | 0 | 0 | 0 | 0 | +2 | +1 | 0 | 0 | -1 | 0 |
| FLASH_FLOOD | +1 | +1 | -1 | 0 | 0 | 0 | +2 | 0 | +1 | -1 |

Pick-rate best response:

- STRENGTH: 0%
- RESISTANCE: 0%
- AGILITY: 0%
- PERCEPTION: 0%
- METABOLISM: 32.7778%
- ADAPTATION: 20.3704%
- GRIP_CLAWS: 14.9537%
- CAMOUFLAGE: 16.1806%
- WEBBED_LIMBS: 0.3704%
- FAT_RESERVES: 15.3472%

Audit contro random:

| Policy | W/D/L % | Score | USE | EVOLVE | Cooldown % | Tie % |
|---|---:|---:|---:|---:|---:|---:|
| random | 35.2778/24.5833/40.1389 | 1.2194 | 2.9486 | 3.0514 | 2.5 | 57.7315 |
| immediate | 100/0/0 | 5.5514 | 6 | 0 | 6.9444 | 6.412 |
| principal | 100/0/0 | 5.5514 | 6 | 0 | 6.9444 | 6.412 |
| lookahead1 | 100/0/0 | 5.3181 | 5.6667 | 0.3333 | 0 | 10.0231 |
| conserve_metabolism | 100/0/0 | 5.5486 | 6 | 0 | 0 | 6.5509 |
| evolve_alternative | 100/0/0 | 4.8431 | 5.1667 | 0.8333 | 6.2037 | 15.3704 |
| E1 | 100/0/0 | 4.725 | 5 | 1 | 6.0648 | 16.25 |
| E2 | 99.4444/0.4167/0.1389 | 3.7903 | 4 | 2 | 12.8704 | 28.9815 |
| E3 | 97.7778/2.2222/0 | 3.0319 | 3 | 3 | 14.4444 | 39.3981 |
| response_aware | 100/0/0 | 5.5514 | 6 | 0 | 6.9444 | 6.412 |
| exact_best_response | 100/0/0 | 5.0194 | 5.2889 | 0.7111 | 0.4167 | 13.5417 |

## 7. catalog-0223

- Best response: 518 vittorie, 202 pareggi, 0 sconfitte.
- Cooldown blocca il migliore USE nel 6.9444% degli stati esatti.
- EVOLVE compare nel 11.8519% delle azioni ottime ed è necessario per l'optimum nel 96.9112% delle sequenze vinte; lookahead cambia il 15.6481%.
- Massimo pick-rate ottimo 32.7778%; floor universale massimo 40%.
- Geni principali duplicati: METABOLISM.

| Evento | STRENGTH | RESISTANCE | AGILITY | PERCEPTION | METABOLISM | ADAPTATION | GRIP_CLAWS | CAMOUFLAGE | WEBBED_LIMBS | FAT_RESERVES |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| VOLCANIC_ASH_WAVE | 0 | +1 | -1 | -1 | +1 | 0 | 0 | 0 | 0 | +2 |
| PROLONGED_ECLIPSE | 0 | 0 | 0 | 0 | -1 | +2 | +1 | 0 | 0 | 0 |
| PREDATOR_PACK_MIGRATION | +1 | 0 | +2 | +1 | 0 | 0 | 0 | +1 | 0 | 0 |
| HEAT_SPIKE | 0 | 0 | 0 | 0 | +2 | +1 | 0 | 0 | +1 | -1 |
| NUTRIENT_COLLAPSE | 0 | 0 | 0 | 0 | +2 | +1 | 0 | 0 | -1 | 0 |
| FLASH_FLOOD | +1 | 0 | -1 | 0 | 0 | 0 | +2 | 0 | +1 | -1 |

Pick-rate best response:

- STRENGTH: 0%
- RESISTANCE: 0%
- AGILITY: 16.1806%
- PERCEPTION: 0%
- METABOLISM: 32.7778%
- ADAPTATION: 20.3704%
- GRIP_CLAWS: 14.9537%
- CAMOUFLAGE: 0%
- WEBBED_LIMBS: 0.3704%
- FAT_RESERVES: 15.3472%

Audit contro random:

| Policy | W/D/L % | Score | USE | EVOLVE | Cooldown % | Tie % |
|---|---:|---:|---:|---:|---:|---:|
| random | 33.1944/24.4444/42.3611 | 1.1361 | 2.9486 | 3.0514 | 2.963 | 59.3519 |
| immediate | 100/0/0 | 5.55 | 6 | 0 | 6.9444 | 6.3194 |
| principal | 100/0/0 | 5.55 | 6 | 0 | 6.9444 | 6.3194 |
| lookahead1 | 100/0/0 | 5.3167 | 5.6667 | 0.3333 | 0 | 9.9306 |
| conserve_metabolism | 100/0/0 | 5.5472 | 6 | 0 | 0 | 6.4583 |
| evolve_alternative | 100/0/0 | 4.8417 | 5.1667 | 0.8333 | 6.2037 | 15.3472 |
| E1 | 99.8611/0.1389/0 | 4.7111 | 5 | 1 | 6.1111 | 16.3657 |
| E2 | 99.5833/0.2778/0.1389 | 3.8222 | 4 | 2 | 10.0926 | 28.6806 |
| E3 | 97.5/2.2222/0.2778 | 3.0097 | 3 | 3 | 13.3333 | 39.9537 |
| response_aware | 100/0/0 | 5.55 | 6 | 0 | 6.9444 | 6.3194 |
| exact_best_response | 100/0/0 | 5.0167 | 5.2889 | 0.7111 | 0.4167 | 13.5648 |

## 8. catalog-0229

- Best response: 518 vittorie, 202 pareggi, 0 sconfitte.
- Cooldown blocca il migliore USE nel 6.9444% degli stati esatti.
- EVOLVE compare nel 11.8519% delle azioni ottime ed è necessario per l'optimum nel 96.9112% delle sequenze vinte; lookahead cambia il 15.6481%.
- Massimo pick-rate ottimo 32.7778%; floor universale massimo 40%.
- Geni principali duplicati: METABOLISM.

| Evento | STRENGTH | RESISTANCE | AGILITY | PERCEPTION | METABOLISM | ADAPTATION | GRIP_CLAWS | CAMOUFLAGE | WEBBED_LIMBS | FAT_RESERVES |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| VOLCANIC_ASH_WAVE | 0 | +1 | 0 | 0 | +1 | 0 | 0 | 0 | -1 | +2 |
| PROLONGED_ECLIPSE | 0 | 0 | 0 | 0 | -1 | +2 | +1 | 0 | 0 | 0 |
| PREDATOR_PACK_MIGRATION | +1 | 0 | +1 | +1 | 0 | 0 | 0 | +2 | 0 | 0 |
| HEAT_SPIKE | 0 | 0 | 0 | 0 | +2 | +1 | 0 | 0 | +1 | -1 |
| NUTRIENT_COLLAPSE | 0 | 0 | 0 | 0 | +2 | +1 | 0 | 0 | -1 | 0 |
| FLASH_FLOOD | +1 | +1 | -1 | 0 | 0 | 0 | +2 | 0 | +1 | -1 |

Pick-rate best response:

- STRENGTH: 0%
- RESISTANCE: 0%
- AGILITY: 0%
- PERCEPTION: 0%
- METABOLISM: 32.7778%
- ADAPTATION: 20.3704%
- GRIP_CLAWS: 14.9537%
- CAMOUFLAGE: 16.1806%
- WEBBED_LIMBS: 0.3704%
- FAT_RESERVES: 15.3472%

Audit contro random:

| Policy | W/D/L % | Score | USE | EVOLVE | Cooldown % | Tie % |
|---|---:|---:|---:|---:|---:|---:|
| random | 35.9722/25.4167/38.6111 | 1.2139 | 2.9486 | 3.0514 | 2.5 | 58.7037 |
| immediate | 100/0/0 | 5.5514 | 6 | 0 | 6.9444 | 6.412 |
| principal | 100/0/0 | 5.5514 | 6 | 0 | 6.9444 | 6.412 |
| lookahead1 | 100/0/0 | 5.3181 | 5.6667 | 0.3333 | 0 | 10.0231 |
| conserve_metabolism | 100/0/0 | 5.5486 | 6 | 0 | 0 | 6.5509 |
| evolve_alternative | 100/0/0 | 4.8403 | 5.1667 | 0.8333 | 6.2037 | 15.4167 |
| E1 | 100/0/0 | 4.725 | 5 | 1 | 6.0648 | 16.25 |
| E2 | 99.4444/0.4167/0.1389 | 3.7819 | 4 | 2 | 12.8704 | 29.1204 |
| E3 | 97.7778/2.2222/0 | 3.0208 | 3 | 3 | 14.4444 | 39.5833 |
| response_aware | 100/0/0 | 5.5514 | 6 | 0 | 6.9444 | 6.412 |
| exact_best_response | 100/0/0 | 5.0194 | 5.2889 | 0.7111 | 0.4167 | 13.5417 |

## 9. catalog-0232

- Best response: 516 vittorie, 204 pareggi, 0 sconfitte.
- Cooldown blocca il migliore USE nel 6.9444% degli stati esatti.
- EVOLVE compare nel 11.9444% delle azioni ottime ed è necessario per l'optimum nel 96.8992% delle sequenze vinte; lookahead cambia il 15.5556%.
- Massimo pick-rate ottimo 32.7778%; floor universale massimo 40%.
- Geni principali duplicati: METABOLISM.

| Evento | STRENGTH | RESISTANCE | AGILITY | PERCEPTION | METABOLISM | ADAPTATION | GRIP_CLAWS | CAMOUFLAGE | WEBBED_LIMBS | FAT_RESERVES |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| VOLCANIC_ASH_WAVE | 0 | 0 | 0 | 0 | +1 | 0 | 0 | 0 | -1 | +2 |
| PROLONGED_ECLIPSE | 0 | 0 | 0 | 0 | -1 | +2 | +1 | 0 | 0 | 0 |
| PREDATOR_PACK_MIGRATION | +1 | 0 | +1 | +1 | -1 | 0 | 0 | +2 | 0 | 0 |
| HEAT_SPIKE | 0 | 0 | 0 | 0 | +2 | +1 | 0 | 0 | 0 | -1 |
| NUTRIENT_COLLAPSE | 0 | 0 | 0 | 0 | +2 | +1 | 0 | 0 | -1 | 0 |
| FLASH_FLOOD | +1 | +1 | -1 | 0 | 0 | 0 | +2 | 0 | +1 | -1 |

Pick-rate best response:

- STRENGTH: 0%
- RESISTANCE: 0%
- AGILITY: 0%
- PERCEPTION: 0%
- METABOLISM: 32.7778%
- ADAPTATION: 20.6481%
- GRIP_CLAWS: 15%
- CAMOUFLAGE: 16.2037%
- WEBBED_LIMBS: 0%
- FAT_RESERVES: 15.3704%

Audit contro random:

| Policy | W/D/L % | Score | USE | EVOLVE | Cooldown % | Tie % |
|---|---:|---:|---:|---:|---:|---:|
| random | 35.6944/26.3889/37.9167 | 1.1653 | 2.9486 | 3.0514 | 2.6157 | 60.4861 |
| immediate | 100/0/0 | 5.5694 | 6 | 0 | 6.9444 | 6.1111 |
| principal | 100/0/0 | 5.5694 | 6 | 0 | 6.9444 | 6.1111 |
| lookahead1 | 100/0/0 | 5.325 | 5.6667 | 0.3333 | 0 | 10.0694 |
| conserve_metabolism | 100/0/0 | 5.5375 | 6 | 0 | 0 | 6.713 |
| evolve_alternative | 100/0/0 | 4.8597 | 5.1667 | 0.8333 | 6.2037 | 15.2315 |
| E1 | 100/0/0 | 4.7375 | 5 | 1 | 6.0648 | 16.0417 |
| E2 | 99.7222/0.2778/0 | 3.8236 | 4 | 2 | 11.2037 | 28.8889 |
| E3 | 97.7778/2.2222/0 | 3.0417 | 3 | 3 | 13.3333 | 39.9306 |
| response_aware | 100/0/0 | 5.5694 | 6 | 0 | 6.9444 | 6.1111 |
| exact_best_response | 100/0/0 | 5.025 | 5.2833 | 0.7167 | 0.2778 | 13.588 |

## 10. catalog-0237

- Best response: 516 vittorie, 204 pareggi, 0 sconfitte.
- Cooldown blocca il migliore USE nel 6.9444% degli stati esatti.
- EVOLVE compare nel 11.9444% delle azioni ottime ed è necessario per l'optimum nel 96.8992% delle sequenze vinte; lookahead cambia il 15.5556%.
- Massimo pick-rate ottimo 32.7778%; floor universale massimo 40%.
- Geni principali duplicati: METABOLISM.

| Evento | STRENGTH | RESISTANCE | AGILITY | PERCEPTION | METABOLISM | ADAPTATION | GRIP_CLAWS | CAMOUFLAGE | WEBBED_LIMBS | FAT_RESERVES |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| VOLCANIC_ASH_WAVE | 0 | +1 | 0 | 0 | +1 | 0 | 0 | 0 | -1 | +2 |
| PROLONGED_ECLIPSE | 0 | 0 | 0 | 0 | -1 | +2 | +1 | 0 | 0 | 0 |
| PREDATOR_PACK_MIGRATION | +1 | 0 | +1 | +1 | 0 | 0 | 0 | +2 | 0 | 0 |
| HEAT_SPIKE | 0 | 0 | 0 | 0 | +2 | +1 | 0 | 0 | 0 | -1 |
| NUTRIENT_COLLAPSE | 0 | 0 | 0 | 0 | +2 | +1 | 0 | 0 | -1 | 0 |
| FLASH_FLOOD | +1 | +1 | 0 | 0 | 0 | 0 | +2 | 0 | +1 | -1 |

Pick-rate best response:

- STRENGTH: 0%
- RESISTANCE: 0%
- AGILITY: 0%
- PERCEPTION: 0%
- METABOLISM: 32.7778%
- ADAPTATION: 20.6481%
- GRIP_CLAWS: 15%
- CAMOUFLAGE: 16.2037%
- WEBBED_LIMBS: 0%
- FAT_RESERVES: 15.3704%

Audit contro random:

| Policy | W/D/L % | Score | USE | EVOLVE | Cooldown % | Tie % |
|---|---:|---:|---:|---:|---:|---:|
| random | 36.1111/26.25/37.6389 | 1.1639 | 2.9486 | 3.0514 | 2.5 | 60.7407 |
| immediate | 100/0/0 | 5.5653 | 6 | 0 | 6.9444 | 6.1806 |
| principal | 100/0/0 | 5.5653 | 6 | 0 | 6.9444 | 6.1806 |
| lookahead1 | 100/0/0 | 5.3208 | 5.6667 | 0.3333 | 0 | 10.1389 |
| conserve_metabolism | 100/0/0 | 5.5333 | 6 | 0 | 0 | 6.7824 |
| evolve_alternative | 100/0/0 | 4.8514 | 5.1667 | 0.8333 | 6.2037 | 15.3472 |
| E1 | 100/0/0 | 4.7347 | 5 | 1 | 6.0648 | 16.088 |
| E2 | 99.4444/0.4167/0.1389 | 3.7889 | 4 | 2 | 12.8704 | 29.2361 |
| E3 | 97.9167/2.0833/0 | 3.0139 | 3 | 3 | 14.4444 | 40.0926 |
| response_aware | 100/0/0 | 5.5653 | 6 | 0 | 6.9444 | 6.1806 |
| exact_best_response | 100/0/0 | 5.0167 | 5.2833 | 0.7167 | 0.2778 | 13.6343 |

