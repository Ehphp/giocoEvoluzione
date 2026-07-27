# Audit baseline - five genes

- Regole: five-genes-v2; fitness: five-genes-fitness-v2.
- Esatto (best response contro greedy): 304 ms, 858240 stati visitati, cache 2749680/858240 hit/miss.
- Torneo policy seeded (720 ordini): greedy=85.0%, evolve-first=0.0%, anti-cooldown=31.9%, future-value-evolve=40.4%, two-evolution-plan=61.6%; pareggi=897.
- Criteri: scelta gene max 27.0%; quota vittorie policy max 38.9% (win rate testa-a-testa max 85.0%); evolve 33.1%; spread ordine=4.

La policy future-value-evolve e un controllo di audit: conosce l ordine futuro e valuta il guadagno atteso prima di rinunciare al punteggio corrente.
