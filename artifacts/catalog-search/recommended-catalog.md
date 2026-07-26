# Catalogo raccomandato

**Raccomandazione: catalog-0226.**

Fitness 57.7911, contro 54.8943 del catalogo produttivo corrente.

- Best response: 520 vittorie, 200 pareggi, 0 sconfitte.
- Cooldown blocca il migliore USE nel 7.037% degli stati esatti.
- EVOLVE compare nel 11.9213% delle azioni ottime ed è necessario per l'optimum nel 96.5385% delle sequenze vinte; lookahead cambia il 15.7407%.
- Massimo pick-rate ottimo 32.7778%; floor universale massimo 40%.
- Geni principali duplicati: METABOLISM.

## Perché è la scelta migliore trovata

- Guadagna 2.8968 punti di fitness sul catalogo corrente.
- Aumenta l'impatto del cooldown da 6.1111% a 7.037%.
- Aumenta le decisioni cambiate dal lookahead da 12.2222% a 15.7407%.
- Riduce il picco di concentrazione dei pick da 34.4444% a 32.7778%.
- Non aumenta il floor universale delle policy: resta 40%.

## Matrice completa

| Evento | STRENGTH | RESISTANCE | AGILITY | PERCEPTION | METABOLISM | ADAPTATION | GRIP_CLAWS | CAMOUFLAGE | WEBBED_LIMBS | FAT_RESERVES |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| VOLCANIC_ASH_WAVE | 0 | +1 | -1 | -1 | +1 | 0 | 0 | 0 | 0 | +2 |
| PROLONGED_ECLIPSE | 0 | 0 | 0 | 0 | -1 | +2 | +1 | 0 | 0 | 0 |
| PREDATOR_PACK_MIGRATION | +2 | 0 | +1 | +1 | 0 | 0 | 0 | +1 | 0 | 0 |
| HEAT_SPIKE | 0 | 0 | 0 | 0 | +2 | +1 | 0 | 0 | +1 | -1 |
| NUTRIENT_COLLAPSE | 0 | 0 | 0 | 0 | +2 | +1 | 0 | 0 | -1 | 0 |
| FLASH_FLOOD | +1 | 0 | -1 | 0 | 0 | 0 | +2 | 0 | +1 | -1 |

## Narrative generate

### VOLCANIC_ASH_WAVE

- FAT_RESERVES +2: le riserve energetiche durante periodi senza alimentazione rappresenta la risposta biologica principale alle ceneri abrasive e alla visibilità ridotta.
- RESISTANCE +1: la tolleranza fisiologica contribuisce in modo secondario alle ceneri abrasive e alla visibilità ridotta.
- METABOLISM +1: la regolazione metabolica contribuisce in modo secondario alle ceneri abrasive e alla visibilità ridotta.
- AGILITY -1: la rapidità di manovra diventa un costo biologico alle ceneri abrasive e alla visibilità ridotta.
- PERCEPTION -1: i sensi amplificati diventa un costo biologico alle ceneri abrasive e alla visibilità ridotta.

### PROLONGED_ECLIPSE

- ADAPTATION +2: la plasticità fenotipica rappresenta la risposta biologica principale all’oscurità prolungata e all’orientamento instabile.
- GRIP_CLAWS +1: la presa su superfici instabili contribuisce in modo secondario all’oscurità prolungata e all’orientamento instabile.
- METABOLISM -1: la regolazione metabolica diventa un costo biologico all’oscurità prolungata e all’orientamento instabile.

### PREDATOR_PACK_MIGRATION

- STRENGTH +2: la forza muscolare rappresenta la risposta biologica principale alla pressione dei predatori e agli inseguimenti.
- AGILITY +1: la rapidità di manovra contribuisce in modo secondario alla pressione dei predatori e agli inseguimenti.
- PERCEPTION +1: i sensi amplificati contribuisce in modo secondario alla pressione dei predatori e agli inseguimenti.
- CAMOUFLAGE +1: il mimetismo contribuisce in modo secondario alla pressione dei predatori e agli inseguimenti.

### HEAT_SPIKE

- METABOLISM +2: la regolazione metabolica rappresenta la risposta biologica principale allo stress termico e al consumo energetico.
- ADAPTATION +1: la plasticità fenotipica contribuisce in modo secondario allo stress termico e al consumo energetico.
- WEBBED_LIMBS +1: la propulsione e la termoregolazione degli arti palmati contribuisce in modo secondario allo stress termico e al consumo energetico.
- FAT_RESERVES -1: le riserve energetiche durante periodi senza alimentazione diventa un costo biologico allo stress termico e al consumo energetico.

### NUTRIENT_COLLAPSE

- METABOLISM +2: la regolazione metabolica rappresenta la risposta biologica principale alla scarsità nutritiva e al cambio di dieta.
- ADAPTATION +1: la plasticità fenotipica contribuisce in modo secondario alla scarsità nutritiva e al cambio di dieta.
- WEBBED_LIMBS -1: la propulsione e la termoregolazione degli arti palmati diventa un costo biologico alla scarsità nutritiva e al cambio di dieta.

### FLASH_FLOOD

- GRIP_CLAWS +2: la presa su superfici instabili rappresenta la risposta biologica principale alla corrente rapida e al terreno allagato.
- STRENGTH +1: la forza muscolare contribuisce in modo secondario alla corrente rapida e al terreno allagato.
- WEBBED_LIMBS +1: la propulsione e la termoregolazione degli arti palmati contribuisce in modo secondario alla corrente rapida e al terreno allagato.
- AGILITY -1: la rapidità di manovra diventa un costo biologico alla corrente rapida e al terreno allagato.
- FAT_RESERVES -1: le riserve energetiche durante periodi senza alimentazione diventa un costo biologico alla corrente rapida e al terreno allagato.

## Compromessi

- Best response W/D/L: 520/200/0.
- EVOLVE: 11.9213% delle azioni ottime; necessario per l'optimum nel 96.5385% delle sequenze vinte.
- Cooldown rilevante: 7.037%.
- Pick massimo: 32.7778%.
- Floor universale massimo fra le policy: 40%.

## Problemi ancora presenti

- EVOLVE resta necessario per ottenere l'optimum nel 96.5385% delle sequenze vinte: la matrice migliora il sistema, ma non elimina questa proprietà strutturale delle regole immutabili.
- I geni senza pick nel percorso ottimo ricostruito sono: RESISTANCE, AGILITY, PERCEPTION, CAMOUFLAGE.
- GREEDY resta battibile in 520 sequenze su 720; il risultato premia profondità e varietà complessive, non l'imbattibilità di GREEDY.

La raccomandazione non è applicata automaticamente al catalogo produttivo:
rimane una proposta riproducibile da approvare con revisione di game design.

