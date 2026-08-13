# Evoluzione delle creature — pipeline FLUX

FLUX è l'unica pipeline di produzione. Non esiste più un percorso concept strutturato/OpenAI Images,
né un routing `legacy|flux`: il codice, i flag e le UI di quelle pipeline sono stati rimossi.

## Percorso produttivo

```text
progress track (target sbloccato dal draft di battaglia)
      -> resolver identità + body-plan canonico
      -> anatomy contract (topologia invariante + libertà del target)
      -> lineage target-aware (stato del target + lineage stabilita)
      -> FLUX micro-concept (JSON stretto, OpenAI Responses)
      -> FLUX prompt deterministico
      -> fal.ai (image edit)
      -> ImageValidator (sorgente e risultato raw)
      -> background removal nel browser + display asset
      -> adoption / rollback della visual version
```

Idempotenza, quote, budget, reservation, storage, background removal, `ImageValidator` e
adoption/rollback sono invariati: il refactor riguarda il dominio dell'evoluzione e il prompt.

## Tassonomia dei target

| Target | Cosa autorizza |
| --- | --- |
| `TAIL` | forma, lunghezza, punta, pinne e strutture ancorate alla coda |
| `LIMBS_AND_FEET` | arti come **sistema unico**: lunghezza, massa, articolazioni, piedi, artigli, membrane |
| `HEAD_AND_CROWN` | corna, palchi, antenne, creste, orecchie, strutture craniali e sensoriali |
| `BODY_SHAPE` | volume, lunghezza del tronco, torace, dorso, distribuzione delle masse, silhouette |
| `DORSAL_STRUCTURES` | spine, creste, pinne, placche, membrane, vele e gobbe ancorate al dorso |
| `SKIN_AND_COVERING` | materiale, texture, pattern, colore e traslucenza del rivestimento |
| `WINGS` | solo per body-plan alati: apertura, membrane, nervature, profilo |
| `TENTACLES` | solo per body-plan tentacolari: lunghezza, sezione, ventose, appendici |

Il principio è **preserve topology, free morphology**: il contratto anatomico fissa il numero di
teste, arti, ali, tentacoli e code e i loro attachment point, mentre il target riceve allowance
positive e precise. `BODY_SHAPE` cambia la forma del corpo (non aggiunge placche);
`DORSAL_STRUCTURES` aggiunge strutture dorsali (non riproporziona il resto).

I target disponibili non sono una costante globale: li dichiara il body-plan
(`shared/creature-transformations/flux-evolution/body-plan-registry.ts`). Una creatura
serpentiforme non offre `LIMBS_AND_FEET`, una alata offre `WINGS`.

## Lineage target-aware

L'immagine sorgente è la verità visiva. Lo storico adottato viene diviso in due, server-side:

- **CURRENT TARGET STATE** — evoluzioni già adottate sullo stesso target o famiglia anatomica.
  Il micro-concept deve svilupparle, non sostituirle né ridescriverle da zero.
- **OTHER ESTABLISHED EVOLUTIONS** — il resto della lineage, già visibile nella sorgente:
  *preserve, do not recreate, do not reinterpret as the new mutation*.

Il prompt FLUX contiene le quattro sezioni in ordine: `CURRENT SOURCE IMAGE`,
`CURRENT TARGET STATE`, `OTHER ESTABLISHED EVOLUTIONS`, `NEW MUTATION`. Il client non può
inviare lineage: viene derivata da visuale attiva + trasformazioni adottate.

## Capability: mutazioni anatomiche e strutturali

- `ANATOMICAL_MUTATION` — rispetta la topologia corrente. È il caso normale.
- `BODY_PLAN_MUTATION` — può modificarla, ma solo con una trasformazione del catalogo
  (`ADD_LIMB_PAIR`, `BIPEDAL_TRANSITION`, `FORELIMBS_TO_WINGS`, `TAIL_SPLIT`) dichiarata dal
  body-plan corrente e con la policy server-side `CREATURE_EVOLUTION_BODY_PLAN_MUTATION_ENABLED`
  attiva. Di default è **disattivata**, quindi il gameplay normale non può generarne.

Il body-plan canonico di una creatura è `body-plan di partenza + mutazioni strutturali adottate`,
derivato dallo storico delle visual version. Dopo l'adozione di `ADD_LIMB_PAIR` un quadrupede
diventa `SIX_LIMBED` e ogni generazione successiva riceve un contratto con sei arti.

## Superfici Lab

Il Lab (`#creature-transformation-lab`, allowlist server-side + flag VITE) usa la stessa pipeline:

- avvio della generazione produttiva su un percorso `READY`;
- **Evolution Chain Simulator**: N step consecutivi che non toccano nessun track, ognuno
  usando l'asset finale processato dello step precedente come sorgente e i propri step come
  lineage adottata. È qui che si esercita end-to-end la capability strutturale.
