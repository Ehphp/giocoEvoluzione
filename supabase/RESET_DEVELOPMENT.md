# Reset distruttivo dell'ambiente di sviluppo

Questa procedura elimina tutte le tabelle, le funzioni, i vincoli e i dati nel
`public` schema del progetto selezionato. Usarla esclusivamente sull'ambiente
di sviluppo; non esiste alcuna conversione dei dieci geni precedenti.

1. Esegui `npm run rules:check` e conserva un backup se i dati sono necessari.
2. Per il database locale: avvia lo stack Supabase e lancia `supabase db reset --local`.
3. Per il progetto dev remoto: apri SQL Editor del progetto dev, incolla ed esegui
   l'intero file `supabase/migrations/202607260001_reset_mvp_5_genes.sql` in una
   sola esecuzione.
4. Verifica che `select public.initial_traits();` restituisca esattamente
   `FEROCITY`, `ARMOR`, `AGILITY`, `SENSES` e `CAMOUFLAGE`.

La migrazione e' autosufficiente per rendere identica l'inizializzazione locale
e remota, ma e' generata: non modificarla a mano. `supabase/schema.sql` e
`supabase/generated/game-rules.sql` restano i baseline leggibili; il secondo
deriva dal catalogo TypeScript e la migrazione viene assemblata con
`npm run rules:generate`.
