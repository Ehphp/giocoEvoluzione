# Audit baseline — five genes

- Metodo: ricerca esatta su 720 permutazioni, contro deterministic-immediate-greedy.
- Tempo: 1233 ms; stati memoizzati: 1898640.
- Esiti: 532 vittorie, 188 pareggi, 0 sconfitte (26.11% pareggi).
- Pareggi di round: 490; distribuzione punteggi finali: 3-2=480, 4-2=42, 4-1=10, 3-3=188.
- Livello 3: raggiunto in 2/720 sequenze (0.28%), round medio 5, usi successivi medi 1.00.
- Confronto con tetto al livello 2: 0 terze evoluzioni hanno aumentato il risultato ottimo; 2 non lo hanno aumentato.
- Azioni ottime: EVOLVE:AQUATIC=624, USE:MOBILITY=440, USE:AQUATIC=739, USE:METABOLISM=939, EVOLVE:METABOLISM=500, EVOLVE:MOBILITY=285, USE:SENSES=316, EVOLVE:SENSES=80, USE:RESILIENCE=268, EVOLVE:RESILIENCE=129.
- Valori per gene (somma/media): AQUATIC=2897/2.13, MOBILITY=1616/2.23, METABOLISM=3599/2.50, SENSES=1016/2.57, RESILIENCE=933/2.35.
- Valori per evento (somma/media): VOLCANIC_ASH_WAVE=1168/1.62, PROLONGED_ECLIPSE=1139/1.58, PREDATOR_PACK_MIGRATION=1348/1.87, HEAT_SPIKE=2093/2.91, NUTRIENT_COLLAPSE=2086/2.90, FLASH_FLOOD=2227/3.09.

## Esito

Il baseline esatto rispetta il budget di 3 secondi.
Non sono state modificate automaticamente né la matrice né le soglie: il report descrive soltanto il baseline.
