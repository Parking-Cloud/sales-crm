# ParkingCloud Sales CRM — Specifica funzionale e tecnica v1


## Sintesi e decisioni prese

Il Sales CRM è una web app interna per 4 utenti che sostituisce l'Excel commerciale: trova le aziende vicino a un parcheggio, ne gestisce contatti e offerte e passa il cliente acquisito al backoffice. Va live in due rilasci (1a e 1b) sui parcheggi pilota. Abbonamenti, pagamenti, fatture e accessi restano fuori dal CRM: li gestirà la piattaforma Parking Cloud secondo il documento "Gestione abbonamenti in piattaforma".

**Decisioni già prese** (9 ottobre 2026)

- Utenti: un amministratore e tre operatori, tutti con account @parkingcloud.eu. L'elenco nominativo è tenuto fuori dal repo (variabile d'ambiente CRM_ALLOWED_USERS).
- Posta: Gmail su Google Workspace.
- Clienti: aziende e privati, con focus sulle aziende.
- Zuretti e Cornalia 11 sono due parcheggi distinti.
- Parcheggi pilota: tre, due a Milano e uno a Roma: Via Friuli 11A, Via Privata Terenzio Mamiani 3a, Autorimessa Lotto – Fiera Milano City (un parcheggio con due ingressi). Stack: Supabase, con sviluppo full stack interno.

**Scelte progettuali proposte qui**

1. La Fase 1 si divide in 1a (lavoro quotidiano, senza integrazioni esterne a parte la mappa) e 1b (Gmail, offerte strutturate, handoff, dashboard).
2. Google Places serve a scoprire le attività; in anagrafica restano solo i dati verificati dall'operatore, con fonte e data.
3. Niente invii massivi: ogni email parte singola, dalla casella dell'operatore, dopo la sua approvazione.
4. Un'anagrafica unica di soggetti (azienda o persona) che in Fase 3 diventa il cliente, senza doppioni.
5. La Fase 3 non si sviluppa dentro il CRM: il CRM consegna i dati alla piattaforma via API.

Nel documento ogni requisito riporta l'origine: **DOC** (allegati), **PROMPT** (prompt master), **PROP** (proposta), **IPOTESI** (da verificare).

## Utenti, ruoli e parcheggi pilota

Due ruoli bastano per l'MVP: l'amministratore configura, gli operatori vendono. Ogni operatore vede tutto il database (team piccolo, lead condivisi), ma ogni lead ha un responsabile.

| Utente | Ruolo | Può fare | Origine |
| --- | --- | --- | --- |
| Amministratore (1 account) | Amministratore | Tutto, più utenti, parcheggi, prodotti e tariffe, template, lista di esclusione, cancellazioni GDPR, esportazioni | DOC |
| Operatori (3 account) | Operatore | Ricerca, import, lead, attività, email, offerte, handoff; non modifica tariffe né cancella definitivamente | DOC |

Un operatore lavora sulla casella condivisa info@, che è anche l'indirizzo pubblicato nei template. Propongo che acceda al CRM con un account personale e invii da info@ come alias, così ogni azione resta attribuita a lui (PROP, da confermare).

**Parcheggi pilota**

| Parcheggio | Indirizzo | Città | Note |
| --- | --- | --- | --- |
| Via Friuli | Via Friuli 11A | Da confermare |  |
| Mamiani | Via Privata Terenzio Mamiani 3a | Da confermare |  |
| Autorimessa Lotto – Fiera Milano City | Due ingressi (Via Masaccio e un secondo da confermare) | Da confermare | Un solo parcheggio |

Il pilota è di tre parcheggi: due a Milano e uno a Roma. Va indicato quale è a Roma prima di inserirli nel CRM (blocco 1a-2); l'indirizzo "Via dei Bruzi 11, 00185" ricevuto in precedenza è romano. Zuretti e Cornalia 11 entrano nel CRM come parcheggi storici, per l'import dell'Excel.

## Analisi AS-IS

L'Excel regge un solo parcheggio e un solo operatore alla volta: non dice a quale parcheggio appartiene un lead, lo stato è vuoto in 41 righe su 70 e i due fogli si collegano per nome, quindi il collegamento si rompe a ogni nome diverso.

### Documento A — ParkingCloud\_CRM\_Parcheggi\_Zuretti.xlsx

| Foglio | Contenuto | Problemi trovati |
| --- | --- | --- |
| Anagrafica Attività Commerciali | 70 aziende contattate a freddo tra il 24 settembre e il 5 ottobre 2026 | Nessuna colonna parcheggio; 25 email su 70 non sono email ("Compilare form sul sito", "Non disponibile"); più valori in una cella separati da "//"; due colonne chiamate "Email"; "Numero Posti Potenziali" sempre vuota; ID non continui (73, poi 301 e 659) |
| Gestione Prospect/richieste | 31 richieste e offerte, quelle datate tra febbraio e marzo 2026 | 23 nomi su 31 non sono in anagrafica (molti sono persone fisiche), quindi il VLOOKUP sul nome va in errore; prezzi scritti come testo ("250 € / 12€ giorno / 3€ ora"); combinazioni di prodotti in una cella |
| Mail Template | 2 template: uffici e attività commerciali | Indirizzo e firma scritti a mano (Via Zuretti, numero di telefono) |
| Tabella Tariffe | Voci per Emilio Cornalia 11: orario, giornaliero 7-19 e H24, mensile e annuale 5/7 e 7/7 | Nessun prezzo compilato |

Stati usati oggi: Very interested / Interested / Not interested; chiamata Chiamati / Da chiamare; email Inviata / Da inviare; offerta Accettata / Rifiutata / In attesa.

Cosa insegnano i dati:

- **I motivi di perdita si ripetono**: si spostano coi mezzi, hanno già un parcheggio interno, si trasferiscono, prezzo alto (con il prezzo del concorrente: 100, 150, 200 €). Diventano una lista fissa e alimentano lo scoring della Fase 2.
- **Il prodotto non è solo l'abbonamento**: un hotel ha accettato una convenzione con codice sconto per la sosta breve, e il template per le attività commerciali vende proprio questo.
- **Le offerte combinano più righe**: 3 posti fissi + 4 serali; 3 posti con ricarica elettrica e decorrenze diverse.
- **Il registro dei contatti è dentro le note**, come diario con date in testa.

### Ristrutturazione dell'Excel nel CRM

| Colonna Excel | Diventa nel CRM | Trasformazione all'import |
| --- | --- | --- |
| Stato | Interesse nella fase dell'opportunità | Very interested/Interested → Interessato; Not interested → Persa con motivo; vuoto → Da contattare |
| ID\_Contatto | Riferimento esterno (legacy\_id) | Conservato solo come traccia |
| Nome Azienda, Settore | Soggetto: denominazione, categoria | Settore libero ricondotto a una lista di categorie |
| Nome e Ruolo Referente | Contatto collegato al soggetto | Uno per riga |
| Sito, Email, Telefono | Canali del soggetto o del contatto | Separati su "//"; "Non disponibile" → vuoto; "Compilare form sul sito" → canale "form web" |
| Data primo/ultimo contatto | Calcolate dalle attività | Non più scritte a mano |
| Email (Inviata), Chiamata | Attività di tipo email e chiamata | Una attività per data |
| Note | Attività con data | Il diario si spezza sulle date "gg/mm/aaaa:"; ciò che non si spezza resta nota |
| Prospect (foglio 2) | Soggetto + opportunità + offerta | Abbinato all'anagrafica se il nome coincide, altrimenti nuovo soggetto (persona o azienda) |
| Offerta, N posti, Stato, Feedback | Offerta con righe, esito e motivo | Importo numerico se leggibile, altrimenti nel testo dell'offerta |
| Mail Template | Template con variabili | {{parcheggio.indirizzo}}, {{utente.firma}} al posto del testo fisso |
| Tabella Tariffe | Listino del parcheggio Cornalia 11 | Prezzi da inserire a mano |

L'anagrafica dell'Excel va sul parcheggio Zuretti. Il foglio Prospect ha date di febbraio e marzo: va chiarito se riguarda Zuretti o Cornalia 11 (IPOTESI).

### Documento B — Gestione abbonamenti in piattaforma (29 settembre 2026)

Descrive l'intero ciclo dell'abbonamento dentro la piattaforma Parking Cloud: sito e app per la sottoscrizione, profili app per i beneficiari, varchi, Stripe e Fatture in Cloud. Contiene 64 requisiti (RF-01…RF-64) in nove aree, nove stati del contratto e 24 punti aperti (6 spuntati).

La conseguenza per il CRM è netta: questi requisiti appartengono alla piattaforma, perché toccano app, sito, varchi e pagamenti che il CRM non possiede. Il CRM deve solo produrre il cliente e l'offerta accettata nel formato che la piattaforma userà per creare il contratto.

## Processo TO-BE

Ogni lead nasce legato a un parcheggio e arriva al backoffice come scheda di handoff: niente più copia a mano tra fogli.

&#91;embedded content: processo TO-BE · 10 fasi, 1 ingresso diretto\]

Cosa cambia rispetto a oggi:

- **Un'azienda, tante opportunità**: la stessa azienda può essere lead su Friuli e su Mamiani, con stati diversi.
- **Attività invece di note**: ogni chiamata ed email è un'attività con data, esito e prossimo passo; "da richiamare" diventa un promemoria con scadenza.
- **Le richieste in entrata** (privati e aziende che scrivono a info@) entrano direttamente come opportunità, senza passare dalla ricerca su mappa.

## Perimetro delle fasi

La 1a basta da sola per lavorare i parcheggi pilota; ogni fase successiva aggiunge valore senza bloccare la precedente.

| Fase | Contenuto | Va live quando | Dipende da |
| --- | --- | --- | --- |
| 1a — CRM operativo | Login, parcheggi e listini, ricerca su mappa e import selettivo, anagrafica soggetti e contatti, import Excel, pipeline, attività e promemoria, template con anteprima e copia (o apertura in Gmail), lista di esclusione, audit | I 4 utenti lavorano i pilota senza Excel | Chiave Google Maps; prezzi dei pilota |
| 1b — Invio e chiusura | Invio da Gmail con approvazione e registro automatico, offerte strutturate con PDF, scheda di handoff, dashboard KPI, esportazioni | Prima offerta inviata e passata al BO dal CRM | App OAuth interna su Workspace |
| 2 — Automazione | Arricchimento dati, scoring spiegabile, suggerimento prodotto, email personalizzate con AI, follow-up assistiti, analisi conversioni | Dopo almeno un mese di dati del pilota | Storico esiti e motivi di perdita |
| 3 — Integrazione abbonamenti | Il CRM crea cliente e richiesta di contratto nella piattaforma via API e ne legge lo stato | Quando la piattaforma espone le API del documento B | Sviluppo RF-01…RF-64 lato piattaforma |

**Fuori scope del CRM in ogni fase** (stanno nella piattaforma): pagamenti, Stripe, fatture e Fatture in Cloud, firma del contratto, beneficiari, targhe, PIN, Bluetooth, varchi, rendiconti host.

**Fuori scope dell'MVP**: multi-tenant, app mobile, invii massivi o sequenze automatiche, scraping di siti terzi.

## Requisiti funzionali Fase 1

Trentuno requisiti in nove moduli; ogni riga è una storia per l'agente di sviluppo e la colonna centrale è il suo criterio di accettazione.

| ID | Come utente voglio | Criterio di accettazione | Fase | Origine |
| --- | --- | --- | --- | --- |
| **A. Parcheggi e listini** |  |  |  |  |
| CRM-01 | Creare, modificare e archiviare un parcheggio | Nome, tipo (autorimessa o aziendale), indirizzo geocodificato con coordinate, capacità, posti commercializzabili, raggio di ricerca, responsabile, stato campagna (bozza, attiva, in pausa, chiusa); archiviare non cancella i lead | 1a | PROMPT |
| CRM-02 | Definire i prodotti di un parcheggio | Prodotto = nome libero + tipo (abbonamento, sosta breve, carnet, convenzione con codice sconto, servizio aggiuntivo) + giorni (es. 5/7, 7/7) + fascia oraria + periodo (ora, giorno, mese, anno) + prezzo netto + IVA + note; Full Time, Diurno, Serale, Notturno sono esempi precompilati, non categorie fisse | 1a | PROMPT + PROP |
| CRM-03 | Indicare i posti disponibili per prodotto | Numero di posti per prodotto e fascia; il CRM avvisa se le offerte accettate superano la disponibilità, senza bloccare | 1a | PROMPT |
| **B. Ricerca geografica** |  |  |  |  |
| CRM-04 | Cercare attività vicino a un parcheggio | Da un parcheggio: raggio (default quello del parcheggio) e categorie; risultati su mappa e in tabella con distanza in linea d'aria | 1a | PROMPT |
| CRM-05 | Vedere la distanza a piedi | Calcolata su richiesta per i risultati selezionati, non per tutti (costo) | 1b | PROMPT |
| CRM-06 | Capire cosa ho già nel CRM | Ogni risultato mostra "già presente" (stesso place\_id, oppure stesso telefono o dominio del sito) e "in lista di esclusione" | 1a | PROMPT |
| CRM-07 | Importare solo i risultati scelti | Selezione multipla → crea soggetto + opportunità "Individuata" sul parcheggio; salvati place\_id, fonte e data | 1a | PROMPT |
| **C. Soggetti e contatti** |  |  |  |  |
| CRM-08 | Avere un'anagrafica unica | Soggetto = azienda o persona; collegabile a più parcheggi e opportunità; P.IVA e codice fiscale opzionali | 1a | PROMPT + DOC |
| CRM-09 | Sapere da dove viene ogni dato | Telefono, email, sito, referente, dipendenti stimati e parcheggio privato hanno fonte, data e stato (verificato, stimato, da verificare); le stime hanno un'etichetta visibile | 1a | PROMPT |
| CRM-10 | Gestire più referenti | Contatti con nome, ruolo, email, telefono, canale preferito, flag "non contattare" | 1a | PROMPT |
| CRM-11 | Evitare doppioni | Avviso alla creazione se coincidono P.IVA, dominio, telefono o nome simile nello stesso CAP; unione manuale di due soggetti con storico conservato | 1a | PROMPT + PROP |
| **D. Import Excel/CSV** |  |  |  |  |
| CRM-12 | Caricare un file | .xlsx e .csv; scelta del foglio e del parcheggio di destinazione | 1a | PROMPT |
| CRM-13 | Mappare le colonne | Mappatura proposta in automatico per il file Zuretti (tabella in Analisi AS-IS), modificabile e salvabile | 1a | PROMPT |
| CRM-14 | Vedere l'anteprima prima di importare | Righe valide, con avvisi, duplicate, scartate; il diario delle note già diviso in attività | 1a | PROMPT |
| CRM-15 | Importare in modo reversibile | Ogni import ha un ID; "annulla import" cancella solo ciò che ha creato; report errori scaricabile. Nota (blocco 1a-1, 12 ottobre 2026): import\_batches è in sola scrittura, quindi annullato\_il non si può ancora valorizzare, e le righe importate non hanno ancora il riferimento al batch; entrambi rinviati al blocco 1a-4 | 1a | PROP |
| **E. Pipeline e attività** |  |  |  |  |
| CRM-16 | Seguire ogni opportunità | Vista kanban e tabella per fase (sezione Modello dati); filtri per parcheggio, responsabile, fase, prossima attività | 1a | PROMPT |
| CRM-17 | Chiudere un'opportunità persa | Motivo obbligatorio dalla lista (mezzi pubblici, ha già parcheggio, trasloco, prezzo, nessun bisogno, non raggiungibile, altro) + prezzo del concorrente se noto | 1a | DOC + PROP |
| CRM-18 | Registrare una chiamata | Esito (risposto, non risponde, numero errato, richiamare), nota, prossima attività con data; in 2 clic | 1a | PROMPT |
| CRM-19 | Avere i miei promemoria | Lista "Oggi" con attività scadute e in scadenza dell'utente; nessuna opportunità aperta senza prossima attività (avviso) | 1a | PROMPT |
| CRM-20 | Vedere lo storico | Cronologia di attività, email e cambi di fase per soggetto e opportunità, con autore | 1a | PROMPT |
| **F. Email** |  |  |  |  |
| CRM-21 | Usare template con variabili | Variabili: azienda, referente, parcheggio, indirizzo, prodotti e prezzi, firma utente; anteprima con i dati reali | 1a | PROMPT |
| CRM-22 | Inviare in sicurezza (1a) | Il CRM controlla l'ammissibilità (sezione Compliance), poi apre la bozza in Gmail o copia il testo; l'invio si registra con un clic | 1a | PROP |
| CRM-23 | Inviare da Gmail (1b) | Invio dalla casella dell'utente dopo approvazione, uno per volta; email salvata come attività con thread ID | 1b | PROMPT |
| CRM-24 | Vedere le risposte (1b) | Le risposte nel thread compaiono nella cronologia e generano un promemoria | 1b | PROP |
| **G. Offerte** |  |  |  |  |
| CRM-25 | Comporre un'offerta | Righe da listino: prodotto, posti, prezzo, sconto, IVA, durata, decorrenza, frequenza di pagamento per riga; condizioni con gli stessi parametri di RF-54 del documento B; totale mensile e annuo calcolato | 1b | PROMPT + DOC |
| CRM-26 | Inviare l'offerta in PDF | PDF dal template, allegato all'email; versioni numerate; stati: bozza, inviata, accettata, rifiutata, scaduta | 1b | PROMPT |
| **H. Handoff al backoffice** |  |  |  |  |
| CRM-27 | Passare il cliente al BO | Da offerta accettata: scheda con cliente, dati fiscali di RF-05 (ragione sociale, P.IVA, SDI o PEC; codice fiscale per i privati), parcheggio, righe, decorrenza, referente, note, operatore; stati: da prendere in carico, presa in carico, attivata, bloccata | 1b | PROMPT |
| CRM-28 | Chiudere il cerchio | Chi attiva nel BO inserisce il riferimento cliente o contratto; solo allora l'opportunità risulta "attivata" | 1b | PROMPT |
| **I. Dashboard e amministrazione** |  |  |  |  |
| CRM-29 | Vedere i KPI | Parcheggi attivi, soggetti individuati, qualificati, contattati, opportunità aperte, offerte inviate e accettate, conversione, valore acquisito (€/anno), attività scadute; filtri parcheggio, periodo, operatore | 1b | PROMPT |
| CRM-30 | Esportare i dati | CSV di soggetti, opportunità, attività, offerte | 1b | PROMPT |
| CRM-31 | Gestire richieste GDPR | L'admin cancella o anonimizza un soggetto o un contatto, lasciando in lista di esclusione solo l'identificativo minimo | 1a | PROMPT |

**Schermate**: Oggi (promemoria), Parcheggi, Dettaglio parcheggio con listino, Ricerca su mappa, Soggetti, Scheda soggetto, Pipeline, Scheda opportunità, Offerta, Handoff, Import, Template, Dashboard, Impostazioni. I wireframe si definiscono sull'UI Kit Parking Cloud (PROP).

## Modello dati

Ventitré tabelle PostgreSQL standard per l'MVP; rispetto alla lista del prompt unisco ParkingLeads dentro Opportunities e Companies/persone dentro un'unica tabella soggetti, così non nascono doppioni né ora né in Fase 3.

### Tabelle MVP

| Tabella | Campi principali | Relazioni e vincoli |
| --- | --- | --- |
| users | id (= auth), email, nome, ruolo (admin, operatore), firma\_email, attivo | email unica, dominio @parkingcloud.eu |
| parking\_facilities | nome, tipo, indirizzo, lat, lng, capacità, posti\_commerciali, raggio\_m, responsabile\_id, stato\_campagna, archived\_at | responsabile → users |
| parking\_products | parking\_id, nome, tipo, giorni, ora\_da, ora\_a, periodo, prezzo\_netto, iva\_pct, posti\_disponibili, attivo | → parking\_facilities |
| parties | tipo (azienda, persona), denominazione, nome, cognome, categoria, piva, codice\_fiscale, sito, dominio, telefono, email, dipendenti\_stimati, parcheggio\_privato (sì, no, non noto), non\_contattare, merged\_into\_id | piva unica se presente; merged\_into → parties |
| party\_locations | party\_id, indirizzo, cap, città, lat, lng, principale | → parties; indice geografico |
| contacts | party\_id, nome, cognome, ruolo, email, telefono, non\_contattare | → parties |
| opportunities | party\_id, parking\_id, contact\_id, responsabile\_id, fase, esito (aperta, vinta, persa), motivo\_perdita, prezzo\_concorrente, prodotto\_interesse\_id, posti\_richiesti, valore\_mensile\_stimato, prossima\_attività\_il, campaign\_id | una sola aperta per coppia soggetto + parcheggio |
| activities | opportunity\_id, party\_id, contact\_id, user\_id, tipo (chiamata, email, nota, incontro, cambio fase), esito, testo, avvenuta\_il, communication\_id | almeno uno tra opportunity e party |
| tasks | opportunity\_id, assegnatario\_id, titolo, scadenza, completata\_il | → users |
| campaigns, campaign\_recipients | parking\_id, nome, categorie, periodo; opportunity\_id | Nell'MVP una campagna per parcheggio |
| email\_templates | nome, uso (uffici, attività commerciali, offerta), oggetto, corpo, versione | variabili validate al salvataggio |
| communications | opportunity\_id, contact\_id, a, oggetto, corpo, stato (bozza, approvata, inviata, fallita), controllo\_ammissibilità, approvata\_da, inviata\_il, gmail\_message\_id, gmail\_thread\_id | gmail\_message\_id unico |
| offers, offer\_items | opportunity\_id, versione, stato, inviata\_il, accettata\_il, motivo\_rifiuto, valida\_fino, condizioni, pdf\_path; prodotto, descrizione, posti, prezzo\_netto, sconto\_pct, iva\_pct, durata\_mesi, decorrenza | (opportunity, versione) unica |
| backoffice\_handoffs | offer\_id, stato, assegnatario\_id, trasferita\_il, presa\_il, rif\_cliente\_bo, rif\_contratto\_bo, snapshot (json) | una per offerta accettata |
| external\_references | entità, entità\_id, sistema (google\_places, backoffice, excel), id\_esterno, letto\_il | (sistema, id\_esterno) unico |
| data\_sources, field\_provenance | nome, licenza, conservazione\_giorni; entità, campo, fonte, acquisito\_il, verificato\_il, stato (verificato, stimato, da verificare) | una riga per campo sensibile |
| contact\_permissions, suppression\_list | contatto o soggetto, canale, base, fonte, data, stato; valore normalizzato (email, telefono, dominio), motivo | valore unico in lista |
| audit\_logs, import\_batches | utente, entità, azione, prima, dopo, quando; file, utente, conteggi, annullato\_il | sola scrittura |

### Fasi dell'opportunità

Fase ed esito sono separati: la fase dice dove sono, l'esito se è finita.

| Fase | Entra quando | Stati del prompt assorbiti |
| --- | --- | --- |
| Individuata | Import da mappa o da file | Azienda individuata, Da qualificare |
| Da contattare | Dati verificati e canale ammesso | Da contattare |
| Contattata | Prima attività di contatto riuscita | Primo contatto effettuato |
| Interessata | Esigenza espressa o richiesta in entrata | Interessato, Richiesta ricevuta |
| Offerta inviata | Un'offerta in stato inviata | Offerta inviata |
| Vinta | Offerta accettata | Offerta accettata |
| Passata al BO | Handoff creato | Passato al backoffice |
| Attivata | Riferimento BO inserito | Nuova: abbonamento effettivamente attivo |

Non interessato, Offerta rifiutata e Non raggiungibile diventano **esito persa** con motivo; Da richiamare diventa un **promemoria**; Non contattare diventa un **flag sul soggetto o contatto** con voce in lista di esclusione.

### Deduplicazione

1. Stesso place\_id Google, stessa P.IVA o stesso valore in lista di esclusione: blocco, si apre il soggetto esistente.
2. Stesso telefono normalizzato (+39…) o stesso dominio del sito (esclusi gmail, libero, hotmail e simili): avviso con proposta di unione.
3. Nome simile (somiglianza trigrammi ≥ 0,6) nello stesso CAP: avviso.

Migrazioni in SQL versionato, senza funzioni proprietarie del provider. Il multi-tenant si aggiunge dopo con una colonna org\_id e le relative policy, senza toccare l'MVP.

## Fonti dati, integrazioni e compliance

Google Places va usato come motore di scoperta, non come database: i termini permettono di conservare il place\_id, ma latitudine e longitudine solo per 30 giorni, e i contenuti Places vanno mostrati su una mappa Google ([termini dei servizi](https://cloud.google.com/maps-platform/terms/maps-service-terms)).

**Modello ibrido per i dati geografici** (deciso il 12 ottobre 2026):

- **Indirizzi nostri** (parcheggi; in futuro le sedi verificate dei soggetti): geocodifica con OpenStreetMap Nominatim. Le coordinate si conservano, con l'attribuzione "© OpenStreetMap contributors".
- **Ricerca delle aziende** (blocco 1a-5): Google Places. Si conserva il place\_id; le coordinate Google restano al massimo 30 giorni.
- Ogni coordinata salvata registra la fonte (`nominatim`, `manuale`, `google`) e la data dell'ultimo aggiornamento.

### OpenStreetMap Nominatim

| Uso | Servizio | Regole d'uso |
| --- | --- | --- |
| Coordinate del parcheggio (e in futuro delle sedi verificate) | Nominatim search, formato jsonv2, solo Italia, un risultato | Solo lato server; User-Agent identificativo con indirizzo di contatto; al massimo 1 richiesta al secondo; una richiesta solo quando l'admin salva un indirizzo cambiato, mai in blocco |

Il risultato si salva solo dopo la conferma dell'admin; in alternativa lat e lng si inseriscono a mano (fonte `manuale`). Nominatim è gratuito; i dati sono sotto licenza ODbL e vanno attribuiti dove si mostrano ([copyright OpenStreetMap](https://www.openstreetmap.org/copyright), [policy d'uso Nominatim](https://operations.osmfoundation.org/policies/nominatim/)).

### Google Maps Platform

| Uso | API e SKU | Quota gratuita al mese | Oltre la quota (per 1.000) |
| --- | --- | --- | --- |
| Ricerca attività vicine (nome, indirizzo, tipo, posizione) | Nearby Search Pro | 5.000 | 32 $ |
| Telefono e sito dei soli risultati scelti | Place Details Enterprise | 1.000 | 20 $ |
| Distanza a piedi dei risultati scelti | Compute Route Matrix Essentials | 10.000 | 5 $ |
| Mappa nel CRM | Dynamic Maps | 10.000 | 7 $ |

Fonte: [listino Google Maps Platform](https://developers.google.com/maps/billing-and-pricing/pricing), letto il 9 ottobre 2026. Telefono e sito chiesti già nella ricerca la porterebbero allo SKU Enterprise (1.000 gratis, 35 $ oltre), quindi si chiedono dopo, solo per i risultati importati. Ogni ricerca restituisce al massimo 20 risultati ([documentazione Nearby Search](https://developers.google.com/maps/documentation/places/web-service/nearby-search)): per un raggio denso servono più chiamate, una per categoria.

Regole di conservazione (PROP, da validare):

- **place\_id**: conservato, serve per deduplicare e rileggere i dati.
- **Coordinate da Places**: cancellate o rilette entro 30 giorni da un job notturno. La posizione permanente del soggetto viene dalla geocodifica del suo indirizzo verificato con Nominatim (vedi sopra).
- **Nome, telefono, sito**: entrano in anagrafica come dato verificato solo dopo che l'operatore li ha confermati sul sito dell'azienda o in chiamata; la fonte registrata è quella.

Arricchimento (dipendenti, P.IVA, parcheggio privato) resta manuale in Fase 1. In Fase 2 si valutano fonti a pagamento con licenza chiara (Registro Imprese, banche dati aziendali) e gli strumenti già in uso in azienda (Clay, Outscraper), verificando che i termini permettano la conservazione.

### Gmail

- App OAuth di tipo **interno** sul Workspace parkingcloud.eu: ogni utente collega la propria casella.
- 1a: nessuna API, bozza aperta in Gmail con link precompilato.
- 1b: permesso di invio (gmail.send) e lettura dei thread avviati dal CRM per vedere le risposte.
- Invio da info@ come alias "Invia come" della casella dell'operatore (da configurare in Gmail).

### Regole sulle comunicazioni commerciali

Per il Garante l'obbligo di consenso dell'art. 130 del Codice privacy vale per il contraente "indipendentemente dalla natura giuridica (persona fisica o persona giuridica)" ([provvedimento 7 maggio 2015](https://www.garanteprivacy.it/web/guest/home/docweb/-/docweb-display/docweb/4207931)). Il CRM quindi parte prudente; le soglie vanno confermate da un legale.

Il processo reale dell'Excel è già quello giusto: prima si chiama, poi si manda l'email di presentazione a chi la chiede. Il CRM lo rende la regola.

| Canale | Ammesso quando | Registrato come |
| --- | --- | --- |
| Telefono | Numero aziendale non in lista di esclusione; per ditte individuali e professionisti, verifica sul Registro delle opposizioni (IPOTESI, da validare) | Attività chiamata |
| Email | Il contatto l'ha chiesta in chiamata, ha scritto lui per primo, o esiste un consenso registrato | Permesso con base, fonte, data, operatore |
| Email a freddo | Disattivata di default; attivabile dall'admin solo dopo il parere legale | Policy in impostazioni |

Ogni email riporta chi siamo, come abbiamo avuto il contatto e come opporsi. Un'opposizione, da qualsiasi canale, mette il soggetto in lista di esclusione e blocca ogni invio successivo, anche da import futuri.

## Architettura, Source of Truth e costi

Tengo lo stack del prompt (Next.js, Supabase, Netlify): Supabase porta in un solo servizio database, login Google e archivio dei PDF, così l'MVP sta in circa 25-34 $ al mese.

&#91;embedded content: architettura · 3 componenti interni, 3 esterni\]

### Scelte tecniche

| Tema | Scelta | Origine |
| --- | --- | --- |
| Frontend | Next.js (App Router), React, TypeScript, Tailwind con i token dell'UI Kit Parking Cloud | PROMPT + PROP |
| Server | Route handler e server action su Netlify Functions; chiavi Google e token Gmail solo lato server | PROP |
| Database | Supabase PostgreSQL, migrazioni SQL versionate, estensioni standard (pg\_trgm, postgis o earthdistance) | PROMPT |
| Login | Supabase Auth con Google, accesso solo per @parkingcloud.eu presenti nella tabella users | PROP |
| Permessi | Row Level Security: tutti gli utenti attivi leggono; scrittura per ruolo; tabelle di configurazione solo admin | PROMPT |
| Segreti | Token Gmail cifrati nel database (Vault di Supabase o pgcrypto), chiavi in variabili d'ambiente Netlify | PROP |
| Job | pg\_cron per promemoria e pulizia delle coordinate Places; funzioni pianificate Netlify per le chiamate API (IPOTESI: verificare disponibilità sul piano) | PROP |
| Audit | Trigger su tabelle principali che scrivono in audit\_logs (chi, cosa, prima, dopo) | PROMPT |
| Backup | Backup giornalieri Supabase Pro (7 giorni) + dump settimanale su Google Drive con GitHub Actions | PROP |
| Automazioni | Nessun n8n nell'MVP: i job sopra bastano | PROP |

Nei progetti recenti (FM Dashboard) usate Netlify Functions con Neon. Supabase è stato scelto il 9 ottobre perché evita di costruire login e permessi a mano. Lo sviluppo è full stack interno (COO con Claude Code): schema, permessi e funzioni server compresi, in un repo e un database separati dalla piattaforma.

### Source of Truth

| Dato | Proprietario | Chi lo modifica | Sincronizzazione | Conflitti |
| --- | --- | --- | --- | --- |
| Soggetti, contatti, lead, attività, offerte | CRM | Utenti CRM | — | Ultima modifica vince, con audit |
| Parcheggi e listini commerciali | CRM nell'MVP; piattaforma in Fase 3 (IPOTESI) | Admin CRM, poi piattaforma | Fase 3: lettura via API, CRM in sola lettura | Vince la piattaforma |
| Email | Gmail | Utente | Il CRM salva copia e ID del messaggio | Vince Gmail |
| Cliente operativo, contratto, pagamenti, fatture, accessi | Piattaforma (documento B) | Backoffice | MVP: riferimento inserito a mano; Fase 3: webhook | Vince la piattaforma |
| Stato di attivazione | Piattaforma | Backoffice | MVP manuale; Fase 3 webhook con ID esterno e idempotenza | Vince la piattaforma |

### Costi mensili stimati

| Voce | Pilota (2-4 parcheggi) | 5 | 10 | 25 |
| --- | --- | --- | --- | --- |
| Supabase Pro (fisso) | 25 $ | 25 $ | 25 $ | 25 $ |
| Netlify (Free, oppure Personal 9 $ se si superano i crediti) | 0-9 $ | 0-9 $ | 0-9 $ | 0-9 $ |
| Google Maps (variabile) | 0 $ | 0 $ | 0 $ | circa 30 $ |
| Gmail API, dominio (sottodominio di parkingcloud.eu), backup su Drive | 0 $ | 0 $ | 0 $ | 0 $ |
| **Totale** | **25-34 $** | **25-34 $** | **25-34 $** | **55-64 $** |

Prezzi da [Supabase](https://supabase.com/pricing), [Netlify](https://www.netlify.com/pricing/) e listino Google, letti il 9 ottobre 2026. Ipotesi Maps: ogni parcheggio nuovo nel mese richiede 30 ricerche e 100 dettagli; a 25 parcheggi nuovi nello stesso mese i dettagli superano di 1.500 la quota gratuita (1.500 × 20 $ / 1.000). Il piano gratuito Supabase non va bene in produzione: va in pausa dopo una settimana di inattività e non ha backup. AI (Fase 2): da stimare sul volume reale del pilota. Lo sviluppo è interno con Claude Code: nessun costo una tantum oltre al tempo di revisione.

## Fase 2 e Fase 3

### Fase 2 — Automazione commerciale

La Fase 2 parte dai dati del pilota: senza esiti e motivi di perdita registrati, scoring e suggerimenti non hanno basi.

| Funzione | Come funziona | Regola di sicurezza |
| --- | --- | --- |
| Lead scoring | Somma di punti per fattore: distanza a piedi, categoria, dimensione stimata, segnali di bisogno, qualità dei contatti, storico della categoria su quel parcheggio; pesi configurabili dall'admin | Ogni punteggio mostra i fattori che lo compongono; i fattori stimati sono marcati come tali |
| Pesi dai dati | Tassi di conversione e motivi di perdita per categoria e distanza calcolati dal pilota | Si aggiornano solo con almeno 20 esiti per categoria (PROP) |
| Arricchimento | Fonti con licenza (Registro Imprese, banche dati, Clay o Outscraper) per P.IVA, dipendenti, sito | Il dato arricchito entra come "stimato" o "da verificare", mai come verificato |
| Email con AI | Il modello LLM personalizza il template partendo da categoria, note e prodotto | L'operatore approva sempre; il modello non inventa prezzi né dati: usa solo campi del CRM |
| Suggerimento prodotto | Regole: categoria e orari tipici → prodotto (es. ristorante → serale o convenzione, studio → 5/7 diurno) | Proposta, non scelta automatica |
| Follow-up assistiti | Promemoria proposti secondo esito e giorni trascorsi | Nessun invio automatico |
| Analisi | Funnel per parcheggio, categoria e operatore; costo per lead qualificato | — |

### Fase 3 — Integrazione con la gestione abbonamenti

I 64 requisiti del documento B vivono nella piattaforma; quattro aree (segnate **Ora**) vanno però allineate già nella Fase 1, così le offerte del CRM diventano contratti senza essere riscritte.

| Area (RF) | Dove vive | Stato nel backoffice | Cosa cambia per il CRM |
| --- | --- | --- | --- |
| A. Catalogo e piani (RF-01…RF-03) | Piattaforma | Da sviluppare (IPOTESI) | **Ora**: le righe d'offerta registrano frequenza di pagamento; in Fase 3 il CRM legge i piani via API e smette di gestire il proprio listino |
| B. Sottoscrizione (RF-04…RF-08) | Piattaforma | Da sviluppare | **Ora**: l'handoff raccoglie i dati di RF-05 (ragione sociale, P.IVA, codice SDI o PEC, referente; per i privati codice fiscale) |
| C. Pagamenti (RF-09…RF-15) | Piattaforma + Stripe | Stripe Connect già in uso per gli host; abbonamenti da sviluppare | Nessuno; in Fase 3 il CRM legge lo stato |
| D. Ciclo del contratto (RF-16…RF-21) | Piattaforma | Da sviluppare | Fase 3: scadenze e disdette visibili sul soggetto; un rinnovo in arrivo può aprire un'opportunità (PROP) |
| E. Fatturazione (RF-22…RF-25, RF-40) | Piattaforma + Fatture in Cloud | Da integrare | Nessuno |
| F. Host e commissioni (RF-26, RF-27, RF-34…RF-39, RF-41) | Piattaforma | Da sviluppare | Fase 2: mostrare il margine dell'offerta se la commissione dell'host è nota (PROP) |
| G. Back-office e migrazione (RF-28…RF-33) | Piattaforma | Da sviluppare | **Ora**: i clienti attivi (45 aziende e 16 privati citati in RF-32) vanno importati anche nel CRM come soggetti "cliente", così nessuno li contatta a freddo |
| Condizioni e firma (RF-54…RF-64) | Piattaforma | Da sviluppare; provider di firma da scegliere | **Ora**: le condizioni dell'offerta usano gli stessi parametri della tabella di RF-54 (frequenza, tempistica, durata, rinnovo, preavviso, energia, cauzione, sconto) |
| Accesso e beneficiari (RF-42…RF-53) | Piattaforma + varchi | ANPR e Bluetooth già integrati per le prenotazioni (IPOTESI); beneficiari da sviluppare | L'offerta registra solo numero di posti e modalità di accesso del parcheggio |

**Contratto di integrazione proposto** (da definire con il CTO):

1. Il CRM crea il cliente e la richiesta di contratto con una chiave di idempotenza uguale all'ID dell'handoff: un invio ripetuto non crea doppioni.
2. La piattaforma risponde con i suoi ID, salvati in external\_references.
3. A ogni cambio di stato del contratto la piattaforma invia un webhook firmato; il CRM aggiorna l'opportunità (Attivata, poi eventuale Chiuso).
4. Errori in coda con nuovi tentativi a intervalli crescenti; dopo 5 tentativi l'handoff passa a "bloccato" e avvisa l'admin.
5. Ogni notte un confronto tra handoff e contratti segnala le differenze in una lista per l'admin.

Le 24 decisioni aperte del documento B restano aperte e non bloccano il CRM. Due incidono sulle offerte già dalla Fase 1: quanto costa il mensile rispetto all'annuale e se l'annuale si paga in anticipo o a rate.

## Pilota, go-live e rischi

Il pilota dura 4 settimane sui parcheggi pilota e misura una cosa sopra tutte: quante opportunità qualificate produce un operatore a settimana rispetto all'Excel.

### Piano del pilota

1. **Prima del via**: import dell'Excel Zuretti in staging, controllo a campione di 10 righe, poi import in produzione; import dei clienti attivi come soggetti "cliente".
2. **Settimana 1**: ricerca su mappa per ogni parcheggio pilota, qualifica e prime chiamate; i 4 utenti lavorano solo nel CRM.
3. **Settimane 2-4**: contatti, offerte e handoff; revisione settimanale di bug e richieste (30 minuti).
4. **Fine pilota**: confronto dei KPI con la base Excel e decisione sulla 1b o sulla Fase 2.

| KPI | Come si misura |
| --- | --- |
| Aziende individuate per parcheggio | Risultati della ricerca importati |
| Aziende rilevanti | Importate ÷ trovate su mappa |
| Contatti validi | Chiamate con esito "risposto" ÷ chiamate fatte |
| Tempo per lead qualificato | Cronometrato su 10 lead con Excel e 10 col CRM |
| Opportunità, offerte, conversioni | Dalla pipeline, per parcheggio e operatore |
| Costo per lead qualificato | Costi mensili ÷ lead qualificati |

La base Excel: 70 aziende in anagrafica su Zuretti, quasi tutte lavorate in 8 giorni lavorativi (24 settembre – 5 ottobre): 8 "Interested", 21 "Not interested", 41 senza stato.

### Test di accettazione principali

- Import del file Zuretti: 70 righe, nessuna persa, diario delle note diviso in attività, duplicati segnalati.
- Ricerca su un parcheggio pilota: risultati su mappa e tabella, "già presente" corretto, coordinate Places assenti dal database dopo 30 giorni.
- Un operatore non modifica le tariffe; un utente fuori da @parkingcloud.eu non entra.
- Un'email verso un contatto senza permesso o in lista di esclusione non si può inviare.
- Un'opportunità persa senza motivo non si salva.
- Ogni modifica a fase, offerta e handoff compare nel registro con autore.

### Rilascio, backup e rollback

- Ambienti staging e produzione separati (due progetti Supabase, due siti Netlify o branch deploy).
- Rilascio solo con test superati e prova del COO in staging.
- Rollback del codice: redeploy della versione precedente su Netlify. Rollback dei dati: migrazioni con script di ritorno; ripristino dal backup giornaliero; "annulla import" per gli import.
- Problemi segnalati in un progetto Jira dedicato o in PCBO con etichetta CRM (da decidere).

### Checklist di go-live

- [ ] Prezzi e prodotti dei parcheggi pilota inseriti
- [ ] Chiave Google Maps con limiti di quota e budget alert impostati
- [ ] App OAuth interna creata su Workspace (anche per il login)
- [ ] Utenti creati con i ruoli giusti
- [ ] Template email rivisti, con informativa e opposizione
- [ ] Excel Zuretti importato e verificato
- [ ] Clienti attivi importati come "cliente"
- [ ] Backup giornaliero e dump settimanale verificati con un ripristino di prova
- [ ] Policy email validata dal legale
- [ ] Sottodominio (es. crm.parkingcloud.eu) attivo con HTTPS

### Rischi

| Rischio | Effetto | Mitigazione |
| --- | --- | --- |
| Policy email troppo stretta | Meno contatti via email | Il telefono resta il canale principale, come oggi |
| Costi Places oltre la quota | Spesa imprevista | Dettagli solo sui risultati scelti, budget alert, cache del place\_id |
| Termini Google interpretati male | Contestazione sui dati conservati | Regole di conservazione della sezione Fonti dati, verifica legale |
| Adozione bassa (si torna all'Excel) | Dati sparsi | Excel congelato in sola lettura dal go-live; schermata "Oggi" come punto d'ingresso |
| Fase 3 lato piattaforma in ritardo | Handoff manuale più a lungo | La 1b funziona da sola; l'integrazione è un'aggiunta |
| Stack diverso dal resto (Supabase vs Neon) | Due sistemi da mantenere | Scelto Supabase il 9 ottobre; repo e database separati dalla piattaforma |

## Decisioni aperte

Nessuna blocca più l'avvio dello sviluppo (deciso il 9 ottobre: tre parcheggi pilota, due a Milano e uno a Roma; stack Supabase; sviluppo full stack interno); le altre servono prima del go-live o della fase indicata.

| # | Domanda | Chi decide | Serve per | Proposta o esito |
| --- | --- | --- | --- | --- |
| 1 | Quale dei tre parcheggi pilota è a Roma; secondo ingresso di Lotto | COO | Setup 1a | Due a Milano, uno a Roma; Lotto è un solo parcheggio |
| 2 | Prodotti e prezzi dei parcheggi pilota e di Cornalia 11 | COO, CEO | Go-live 1a | — |
| 3 | Il foglio Prospect riguarda Zuretti o Cornalia 11? | COO | Import | Zuretti per default |
| 4 | Supabase o Neon | COO | Avvio sviluppo | Deciso: Supabase |
| 5 | Operatore di info@: account personale con alias? | COO | Utenti 1a | Sì |
| 6 | Email a freddo verso aziende e verifica sul Registro delle opposizioni | Legale | Policy email | Disattivata finché non c'è parere |
| 7 | Dove si tracciano bug e richieste del CRM | COO | Pilota | Jira, nuovo progetto |
| 8 | Elenco dei clienti attivi da importare come "cliente" e sua fonte | COO | Go-live | Il file contratti citato in RF-32 |
| 9 | Mensile più caro dell'annuale? Annuale anticipato o a rate? | CEO | Offerte 1b | Dal documento B, punti aperti |
| 10 | Testo e condizioni standard dell'offerta PDF | CEO, CSO | 1b | Partire dal template uffici |
| 11 | API della piattaforma per clienti e contratti; parcheggi e listini letti dalla piattaforma | CTO | Fase 3 | Contratto di integrazione in Fase 2 e Fase 3 |
| 12 | Fonti di arricchimento a pagamento e budget | CEO | Fase 2 | Prova su 100 aziende del pilota |

## Istruzioni per l'AI coding agent

L'agente lavora a blocchi: un blocco per sessione, ognuno chiuso da test e da una checklist di regressione prima del successivo.

### Regole generali

- All'inizio di ogni sessione: pull del repo e lettura di CLAUDE.md, che riassume questa specifica e le decisioni prese.
- Non inventare dati, campi o capacità delle API: se un dato manca, fermarsi e chiedere.
- Ogni modifica allo schema è una migrazione SQL nuova, mai una modifica a una già applicata; policy RLS in migrazioni dedicate.
- Chiavi e token solo lato server; nessun segreto nel codice o nel client.
- Testi dell'interfaccia in italiano; componenti e token dell'UI Kit Parking Cloud.
- Test automatici per regole di business (fasi, dedup, ammissibilità email, import) e un test end-to-end per blocco.
- Fine blocco: report con file toccati, migrazioni, test eseguiti e cosa verificare a mano in staging.

### Backlog a blocchi

| Blocco | Contenuto | Requisiti | Verifica |
| --- | --- | --- | --- |
| 1a-0 | Repo, Next.js, Tailwind con token UI Kit, Supabase staging e produzione, deploy Netlify, CLAUDE.md | — | Pagina vuota online in staging con login |
| 1a-1 | Schema completo, RLS, trigger di audit, login Google limitato al dominio, ruoli | CRM-31 in parte | Utente esterno respinto; operatore non scrive tabelle admin |
| 1a-2 | Parcheggi, prodotti, disponibilità, geocodifica | CRM-01…CRM-03 | Parcheggio pilota creato con listino |
| 1a-3 | Soggetti, sedi, contatti, provenienza dei dati, deduplicazione, unione | CRM-08…CRM-11 | Doppione per P.IVA bloccato, per telefono segnalato |
| 1a-4 | Import Excel/CSV con mappatura Zuretti, anteprima, annulla import | CRM-12…CRM-15 | File Zuretti importato: 70 righe, note divise in attività |
| 1a-5 | Ricerca su mappa, tabella, import selettivo, job che cancella le coordinate dopo 30 giorni | CRM-04, CRM-06, CRM-07 | Ricerca su un pilota; "già presente" corretto |
| 1a-6 | Pipeline kanban e tabella, attività, promemoria, schermata Oggi, storico | CRM-16…CRM-20 | Persa senza motivo rifiutata; promemoria in Oggi |
| 1a-7 | Template con variabili, controllo di ammissibilità, bozza in Gmail, lista di esclusione, cancellazione GDPR | CRM-21, CRM-22, CRM-31 | Invio bloccato per contatto senza permesso |
| 1b-1 | Gmail API: collegamento casella, invio approvato, lettura risposte | CRM-23, CRM-24 | Email inviata e risposta visibile nel thread |
| 1b-2 | Offerte con righe e condizioni RF-54, PDF, versioni | CRM-25, CRM-26 | PDF corretto per un'offerta a più righe |
| 1b-3 | Handoff, presa in carico, riferimento BO, fase Attivata | CRM-27, CRM-28 | Opportunità Attivata solo con riferimento BO |
| 1b-4 | Distanza a piedi, dashboard KPI, esportazioni | CRM-05, CRM-29, CRM-30 | KPI coerenti con i dati di staging |

I comandi operativi per ogni blocco si preparano dopo l'approvazione di questa specifica.

### Fonti

- [Google Maps Platform — listino](https://developers.google.com/maps/billing-and-pricing/pricing)
- [Google Maps Platform — termini dei servizi](https://cloud.google.com/maps-platform/terms/maps-service-terms)
- [Places API — Nearby Search](https://developers.google.com/maps/documentation/places/web-service/nearby-search)
- [Supabase — prezzi](https://supabase.com/pricing)
- [Netlify — prezzi](https://www.netlify.com/pricing/)
- [Garante privacy — provvedimento del 7 maggio 2015](https://www.garanteprivacy.it/web/guest/home/docweb/-/docweb-display/docweb/4207931)
- Allegati: ParkingCloud\_CRM\_Parcheggi\_Zuretti.xlsx; Gestione abbonamenti in piattaforma — Requisiti (29 settembre 2026); prompt master del Sales CRM
