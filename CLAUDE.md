# ParkingCloud Sales CRM

Web app interna per il team commerciale Parking Cloud: trova aziende vicino ai parcheggi, gestisce lead, contatti, offerte e il passaggio del cliente al backoffice. Specifica completa: `docs/spec.md` (fonte di verità funzionale; in caso di dubbio vale la specifica, poi chiedere).

## Stack
- Next.js 15 (App Router), React, TypeScript strict, Tailwind CSS v4.
- Supabase: PostgreSQL, Auth (login Google solo @parkingcloud.eu), Storage. Client con `@supabase/ssr`.
- Hosting Netlify (staging e produzione separati).
- Node 20 (vedi `.nvmrc`), npm. Sul PC di Francesco il PATH ha Node 24 prima di nvm: usare esplicitamente Node 20.

## Perimetro
- Sviluppo full stack interno (Francesco con Claude Code): frontend, schema, RLS, funzioni server e job li scriviamo noi, in questo repo.
- Non si tocca il backend né i database della piattaforma Parking Cloud. L'integrazione con la piattaforma (Fase 3) passerà da API concordate.

## Repo pubblico (regole aggiuntive)
- Il repo è PUBBLICO. Mai committare: chiavi, password, stringhe di connessione, file .env, email di persone, nomi di clienti o prospect, dati reali (export, Excel, CSV).
- Elenco utenti autorizzati: solo nella variabile d'ambiente CRM_ALLOWED_USERS (formato `email:ruolo,email:ruolo`), mai in migrazioni, seed o codice.
- Dati di test: solo inventati e chiaramente finti (es. "Azienda Esempio Srl").
- Prima di ogni commit: `git diff --cached` controllato per segreti ed email; se il push viene bloccato dalla push protection di GitHub, fermarsi e avvisare.

## Struttura
- `src/app/` pagine; `src/app/(app)/` area autenticata.
- `src/lib/supabase/` client browser e server; nessuna chiave privata nel client.
- `src/styles/ui-kit-tokens.css` token dell'UI Kit Parking Cloud v3.1 (copiati dal backoffice): unica fonte di colori, spaziature, raggi, ombre, font.
- `supabase/migrations/` migrazioni SQL versionate.
- `docs/spec.md` specifica.

## Regole
- Un blocco del backlog (spec, sezione "Istruzioni per l'AI coding agent") per sessione; a fine blocco test, checklist di regressione e report.
- Branch dedicato da main aggiornato, mai commit su main. Un commit per argomento, messaggi conventional (`feat(area): ...`). Niente Co-Authored-By.
- Nessun push senza OK di Francesco. Branch pushato: solo commit nuovi, mai force.
- Nessuna nuova dipendenza senza chiederla; lockfile nello stesso commit.
- Schema: ogni modifica è una migrazione nuova, mai modificare una migrazione già applicata. Policy RLS in migrazioni dedicate. Solo SQL PostgreSQL standard (estensioni ammesse: pg_trgm, earthdistance o postgis, pg_cron).
- Segreti: Code non inserisce né legge chiavi, password o token. `.env*` mai committati né incollati in chat; `.env.example` contiene solo i nomi.
- Chiavi Google (Places, Routes) e token Gmail solo lato server.
- Non inventare dati, campi o capacità delle API: se manca qualcosa, fermarsi e chiedere.
- UI in italiano, codice e commenti in inglese. Componenti e token dell'UI Kit; una sola CTA primaria per schermata; badge mai distinti dal solo colore; focus visibile.
- Testi: semplici e concreti, niente gergo inglese se esiste un termine italiano chiaro, niente emoji.
- Verifiche: `npm run lint`, `npx tsc --noEmit`, `npm run build`; screenshot PNG fuori dal repo in `Sviluppi\screenshots\sales-crm\<blocco>\` a 1440 e 390 px, Edge headless su porte dalla 9360 in su.
- Dev server sulla porta 3100 (3000/3001 sono del backoffice).

## Dati e compliance (sintesi)
- Google Places: si conserva solo place_id; coordinate Places cancellate entro 30 giorni; contenuti Places mostrati solo su mappa Google.
- Email: niente invii massivi; ogni invio singolo e approvato; email solo se esiste un permesso registrato (richiesta in chiamata, contatto in entrata, consenso). Lista di esclusione sempre controllata.
- Abbonamenti, pagamenti, fatture, accessi NON si sviluppano qui: vivono nella piattaforma Parking Cloud.
