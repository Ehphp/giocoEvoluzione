# Confronto delle pipeline A/B del Creature Transformation Lab

## Scopo e perimetro

Il laboratorio contiene due percorsi di generazione reale affiancabili per una stessa creatura e uno stesso target anatomico:

- **A — Current pipeline**: il flusso di produzione esistente, mantenuto invariato e usato come controllo.
- **B — Lineage-first experimental**: un percorso isolato che riceve esplicitamente la storia visiva da preservare e privilegia una nuova evoluzione forte del target scelto.

Questo documento descrive il comportamento implementato, non un risultato qualitativo: nessuna delle due pipeline promuove automaticamente un asset nel profilo durante l'esperimento A/B. Entrambe producono esclusivamente `EXPERIMENT_ONLY` e richiedono provider immagini `REAL` configurato lato server.

## Vista d'insieme

```text
Input condiviso: creatura + target anatomico + sorgente (corrente o risultato sperimentale)
                                  |
                  +---------------+----------------+
                  |                                |
                  v                                v
        A — Current pipeline             B — Lineage-first experimental
        direzione deterministica         lineage e istruzione amministratore
                  |                                |
                  v                                v
        concept AI validato/evaluato       prompt lineage-first diretto
                  |                                |
                  +---------------+----------------+
                                  |
                                  v
                  image edit REAL asincrono e validazione PNG
                                  |
                                  v
                     Storage raw privato + ledger richiesta
                                  |
                                  v
             confronto UI, prompt/hash, metriche e review A/B manuale
```

## Confronto sintetico

| Aspetto | A — Current pipeline | B — Lineage-first experimental |
| --- | --- | --- |
| Operazione pubblica | `GENERATE_CURRENT_PIPELINE_EXPERIMENT` | `GENERATE_LINEAGE_FIRST_EXPERIMENT` |
| Intenzione | Baseline controllata del percorso attuale | Testare evoluzioni più creative che non cancellino la storia |
| Input specifico | Solo `creatureId`, `evolutionTargetId`, chiave di idempotenza e sorgente sperimentale facoltativa | Gli stessi input più `identityTraits`, `acquiredTraits` e istruzione facoltativa |
| Scelta della mutazione | `resolveEvolutionDirection` sceglie `visualTraitId` e funzione dal target, dalle trasformazioni precedenti e dal seed della chiave | Il target è scelto dall'operatore; la forma dell'evoluzione resta intenzionalmente aperta al modello |
| Concept | Generato in modalità `AI`, poi validato semanticamente ed evaluato | Nessun concept di produzione; compone direttamente un prompt sperimentale |
| Prompt | Template standard `creature-transformation-v1`, con impegni del concept, vincoli anatomici, palette e stile | Template `lineage-first-experimental-v1`, centrato su identità e tratti già acquisiti |
| Chiamate al modello | Una per il concept AI e una per l'image edit | Una sola per l'image edit |
| Vincolo creativo | Mutazione locale, incrementale e aderente al concept validato | Sviluppo forte, anche radicale, del solo target; non semplice variazione decorativa |
| Gestione della storia | La pipeline usa le trasformazioni adottate per scegliere la direzione e il template riceve tale contesto | La storia è un input esplicito e modificabile dell'esperimento; include tratti identitari e acquisiti |
| Output | PNG raw su fondo solido, `EXPERIMENT_ONLY` | PNG raw su fondo solido, `EXPERIMENT_ONLY` |
| Adozione/progressione | Non attivata nel percorso A/B | Esplicitamente impossibile nel percorso |

## Invarianti dell'esperimento

L'interfaccia presenta A e B come confronto sulla stessa sorgente. La sorgente iniziale è la visuale produttiva corrente della creatura; dopo una generazione B conclusa, il suo risultato può essere selezionato come nuova sorgente sperimentale condivisa. Il server accetta tale sorgente solo se appartiene allo stesso profilo e alla stessa creatura, è `SUCCEEDED`, è `EXPERIMENT_ONLY` e ha un `resultPath` privato valido.

Per una coppia A/B utile, l'operatore deve mantenere costanti:

- creatura;
- sorgente, verificabile con lo `sourceSha256` nel ledger;
- target anatomico;
- provider/modello/qualità e limiti di costo configurati;
- una sola esecuzione per pipeline, salvo un piano esplicito di repliche.

La parità non è però bloccata con una chiave di coppia server-side: A e B sono richieste indipendenti e possono essere lanciate in momenti diversi. Le istruzioni lineage, il concept A generato dall'AI e la natura non deterministica del provider immagini sono variabili intenzionali. Perciò il confronto è un pilot qualitativo controllato, non un esperimento statistico automaticamente randomizzato.

## Pipeline A — Current pipeline

### 1. Preparazione e autorizzazione

La route verifica autenticazione, laboratorio abilitato e presenza del profilo nella allowlist `CREATURE_TRANSFORMATION_LINEAGE_EXPERIMENT_PROFILE_IDS`. Applica inoltre le protezioni per immagini a pagamento: abilitazione del pilot `REAL`, allowlist del provider reale o permesso di generazione, provider/API key/modello/costo configurati e costo stimato non superiore al limite per richiesta. Quote giornaliere, budget, limiti globali di concorrenza e cooldown sono applicati dal ledger al momento della generazione immagine.

### 2. Risoluzione della direzione

Il resolver legge l'identità canonica, la visuale corrente e le trasformazioni precedentemente adottate. Da `evolutionTargetId`, storia e seed derivato dalla chiave di idempotenza, `resolveEvolutionDirection` restituisce un `visualTraitId` e una funzione evolutiva. Se non esiste una direzione ammissibile, la richiesta termina con `CONCEPT_REJECTED` prima dell'image edit.

### 3. Concept controllato

La route invoca internamente `GENERATE_CONCEPT` con:

```text
conceptMode = AI
intensity = 2
idempotencyKey = <chiave A>:concept
```

Il concept generato deve superare validazione contro identità, Visual Trait, target e funzione evolutiva, quindi l'evaluazione qualitativa del concept. Questo crea una separazione netta tra la scelta strutturata della trasformazione e il rendering dell'immagine. Un errore o un concept respinto impedisce il passo successivo.

### 4. Composizione del prompt

Il concept validato viene trasformato nel prompt standard v1, organizzato in sezioni `IDENTITY`, `TRANSFORMATION`, `PRESERVE`, `AVOID`, `STYLE` e `TECHNICAL`. In particolare il prompt:

- richiede la stessa creatura e la stessa identità strutturale;
- limita la mutazione al target e alle aree di supporto dichiarate;
- prescrive morfologia, materiale, mutazioni secondarie, intensità, funzione evolutiva e regole di colore del concept;
- conserva volto, posa, composizione, silhouette e regioni non target;
- richiede PNG 1024×1536, creatura completa e margini integri.

Poiché questo è A/B, il servizio è invocato con destinazione `RAW_EXPERIMENT`: anziché alpha nativo, richiede un fondo opaco uniforme e contrastato, destinato a un eventuale post-processing. Il risultato non viene trattato come visuale di produzione.

### 5. Generazione, persistenza e stato

La generazione immagine è richiesta come `REAL` con chiave `<chiave A>:image`. La richiesta è riservata nel ledger, portata a `RUNNING`, passata a una task asincrona e la route risponde `202`. Al completamento, il PNG viene validato e salvato nel bucket raw degli esperimenti; il record memorizza provider, modello, hash sorgente/risultato/prompt, snapshot del concept, tempi, warning, costo e `assetReadiness = EXPERIMENT_ONLY`.

## Pipeline B — Lineage-first experimental

### 1. Input lineage

Oltre a creatura, target e chiave di idempotenza, B riceve un oggetto `lineage`:

```ts
{
  identityTraits: string[]
  acquiredTraits: Array<{ target?: EvolutionTargetId; description: string }>
}
```

La validazione accetta al massimo 16 tratti identitari dopo normalizzazione e al massimo 24 tratti acquisiti, ciascuno non vuoto e lungo al massimo 500 caratteri. Un'istruzione amministratore è facoltativa e limitata a 2.000 caratteri. Questi dati sono contesto sperimentale: non scrivono concept, track o stato di progressione del prodotto.

### 2. Prompt diretto

Non esiste un passaggio di concept AI né una valutazione del concept. `composeLineageFirstPrompt` costruisce un prompt con i seguenti impegni:

- edit della sorgente, stessa creatura e stesso individuo;
- identità canonica più tratti identitari forniti;
- target anatomico dominante e chiaramente leggibile;
- tratti acquisiti che devono rimanere visibili;
- principio: *preserve the past, do not prescribe the future*;
- libertà di inventare uno sviluppo forte e sorprendente del target, senza ridurlo a decorazione;
- se il target è già evoluto, sviluppo di ciò che è visibile anziché sostituzione con un'idea scollegata;
- stabilità dei tratti non target, stile, posa, composizione, inquadratura e silhouette;
- PNG opaco 1024×1536 su fondo solido, senza testo, oggetti o scena.

La differenza chiave è quindi dove risiede il controllo: A controlla a monte un concept strutturato; B espone alla sperimentazione la proposta evolutiva, imponendo però continuità storica e confini del target direttamente nel prompt.

### 3. Generazione, validazione e persistenza

Anche B effettua reservation, stato `RUNNING` e task asincrona `REAL`. Legge la stessa sorgente canonica o la sorgente sperimentale autorizzata. Valida sorgente e output rispetto alla render specification; per l'output raw non richiede alpha. Salva il PNG raw privato e registra `sourceSha256`, `resultSha256`, `promptSha256`, testo del prompt, provider, modello, latenza, costo, warning e `assetReadiness = EXPERIMENT_ONLY`. La versione di template registrata è `lineage-first-experimental-v1`.

## Comportamento comune dopo la generazione

Entrambe le richieste sono idempotenti nel profilo. Una richiesta completata viene recuperata senza una seconda chiamata al provider; una in corso restituisce lo stato accettato finché non diventa stale; una fallita non viene rieseguita automaticamente. Le transizioni persistite sono `RESERVED → RUNNING → SUCCEEDED|FAILED`.

Lo stato viene interrogato con `GET_REQUEST_STATUS`, limitato al proprietario della richiesta. Per gli asset `EXPERIMENT_ONLY` la risposta può esporre nella UI il prompt e il suo SHA-256, oltre a una nuova signed URL a vita breve. I path di Storage, segreti, byte e URL firmate persistite non sono esposti al browser.

## Review A/B e dati raccolti

Una volta che B ha successo, l'operatore può inviare `SUBMIT_LINEAGE_COMPARISON_REVIEW`. La review associa obbligatoriamente il risultato B e facoltativamente il risultato A della stessa creatura e dello stesso profilo. Registra punteggi interi 1–5 per:

- `creativeSurprise`;
- `targetTransformationStrength`;
- `creatureContinuity`;
- `lineagePreservation`;
- `nonTargetStability`.

Registra inoltre la preferenza `CURRENT`, `LINEAGE_FIRST` oppure `NONE`. La migration `202608090001_lineage_first_experiment_reviews.sql` applica RLS senza permessi browser diretti e espone una RPC `security definer` solo al `service_role`. La review B è ammessa soltanto se il relativo record è del profilo e della creatura, riuscito e `EXPERIMENT_ONLY`; un upsert mantiene una sola review per coppia profilo/richiesta lineage.

## Sicurezza e isolamento

Le differenze creative non cambiano la superficie di sicurezza:

- il client non può scegliere provider, modello, qualità, costo, prompt finale, bucket o path;
- sorgenti sperimentali arbitrarie non sono accettate: si passa soltanto un ID richiesta che il server autorizza;
- entrambe le pipeline richiedono allowlist lineage e tutte le protezioni `REAL` lato server;
- i risultati A/B restano fuori da `creature_visual_versions` e non possono modificare `player_creatures`;
- la tabella di review non ha foreign key né RPC per creare una versione visuale ufficiale.

## Conseguenze pratiche e criteri decisionali

Scegliere A quando serve una baseline riproducibile rispetto ai vincoli attuali di concept: è la misura migliore per verificare aderenza a target, palette, pose e mutazione localizzata. Scegliere B quando l'obiettivo è capire se una creatura con evoluzioni precedenti può sviluppare un target in modo più distintivo senza perdere continuità o destabilizzare il resto del corpo.

Un esito favorevole a B non è sufficiente per promuoverla. Prima di modificare il percorso di produzione occorre raccogliere più confronti con sorgente/target costanti, verificare i cinque punteggi della review, confrontare failure rate, latenza e costo effettivo, e definire come convertire il contesto lineage libero in un contratto validabile. La pipeline B è volutamente separata proprio per permettere questo apprendimento senza alterare la progressione visuale esistente.

## Riferimenti di implementazione

- UI e workspace A/B: `src/components/creature-transformation-lab/CreatureTransformationLab.tsx`.
- Contratti e validazione input: `shared/creature-transformations/contracts.ts` e `supabase/functions/generate-creature-transformation/request-validation.ts`.
- Orchestrazione, autorizzazioni e stato: `supabase/functions/generate-creature-transformation/edge-orchestration.ts`.
- Rendering A: `supabase/functions/generate-creature-transformation/image-generation-service.ts` e `shared/creature-transformations/prompt-template-v1.ts`.
- Rendering B: `supabase/functions/generate-creature-transformation/lineage-first-image-service.ts` e `shared/creature-transformations/experimental-lineage.ts`.
- Persistenza review A/B: `supabase/migrations/202608090001_lineage_first_experiment_reviews.sql`.
