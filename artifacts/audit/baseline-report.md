# Audit baseline - five genes

- Regole: five-genes-v2; fitness: five-genes-fitness-v2.
- Esatto (best response contro greedy): 288 ms, 858240 stati visitati, cache 2749680/858240 hit/miss.
- Torneo policy seeded (720 ordini): greedy=93.1%, evolve-first=0.0%, anti-cooldown=42.4%, future-value-evolve=49.9%; pareggi=316.
- Criteri: scelta gene max 27.0%; quota vittorie policy max 50.2% (win rate testa-a-testa max 93.1%); evolve 33.1%; spread ordine=4.

La policy future-value-evolve e un controllo di audit: conosce l ordine futuro e valuta il guadagno atteso prima di rinunciare al punteggio corrente.
