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

## Reset del solo dominio evolutivo delle creature

Per ripartire con gli account e il resto del gioco intatti, applica prima le
migration al progetto dev. Poi, esclusivamente in una breve finestra di
manutenzione, esegui:

```powershell
$env:SUPABASE_URL = 'https://<project-ref>.supabase.co'
$env:SUPABASE_SERVICE_ROLE_KEY = '<service-role>'
npm run reset:creature-evolution-environment -- --confirm-destructive-reset
```

La procedura richiede il flag esatto, verifica l'asset canonico nel bucket
`creature-transformation-sources`, ricrea tutte le creature come
`VERDANT_HATCHLING` base e svuota ricorsivamente ogni oggetto fisico del bucket
`creature-transformation-experiments`. Non caricare nuove generazioni mentre
la procedura e' in corso.
