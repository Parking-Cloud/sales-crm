"use client";

import { useActionState, useState } from "react";
import { saveParty } from "@/app/(app)/prospect/actions";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import type { RawValues } from "@/lib/parking/validation";
import { INITIAL_PARTY_FORM_STATE, type PartyFormState } from "@/lib/parties/form-state";
import {
  PARTY_CATEGORIES,
  PARTY_TYPE_LABELS,
  PRIVATE_PARKING_LABELS,
  type PartyType,
  type PrivateParking,
} from "@/lib/parties/labels";
import type { DataSource, Party, Provenance } from "@/lib/parties/queries";
import { TRACKED_FIELD_LABELS, type TrackedField } from "@/lib/parties/validation";
import { ENTRY_STAGE_OPTIONS, ORIGINS, ORIGIN_LABELS, defaultStageFor, type Origin } from "@/lib/pipeline/entry";
import type { ParkingOption } from "@/lib/pipeline/queries";
import { DuplicatePanel } from "./duplicate-panel";
import { ProvenancePicker } from "./provenance";

function initialValues(party: Party | null): RawValues {
  return {
    tipo: party?.tipo ?? "azienda",
    denominazione: party?.denominazione ?? "",
    nome: party?.nome ?? "",
    cognome: party?.cognome ?? "",
    categoria: party?.categoria ?? "",
    piva: party?.piva ?? "",
    codice_fiscale: party?.codice_fiscale ?? "",
    sito: party?.sito ?? "",
    telefono: party?.telefono ?? "",
    email: party?.email ?? "",
    form_web_url: party?.form_web_url ?? "",
    dipendenti_stimati: party?.dipendenti_stimati === null || party?.dipendenti_stimati === undefined ? "" : String(party.dipendenti_stimati),
    parcheggio_privato: party?.parcheggio_privato ?? "non_noto",
    indirizzo: "",
    cap: "",
    citta: "",
    parcheggio_interesse: "",
    origine: "",
    fase_iniziale: "",
  };
}

export function PartyForm({
  party,
  sources,
  provenance = [],
  parkings = [],
  initialState = INITIAL_PARTY_FORM_STATE,
  action = saveParty,
}: {
  party: Party | null;
  sources: DataSource[];
  provenance?: Provenance[];
  // New party: car parks for "Parcheggio di interesse".
  parkings?: ParkingOption[];
  // For previews only.
  initialState?: PartyFormState;
  action?: typeof saveParty;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const values = state.values ?? initialValues(party);
  return (
    <form key={state.version} action={formAction} noValidate className="flex flex-col gap-6">
      {party && <input type="hidden" name="id" value={party.id} />}
      {state.status === "error" && state.message && <Alert tone="critical">{state.message}</Alert>}
      {state.status === "duplicate-block" && state.duplicates && (
        <DuplicatePanel level="blocco" matches={state.duplicates} pending={pending} />
      )}
      {state.status === "duplicate-warning" && state.duplicates && (
        <DuplicatePanel level="avviso" matches={state.duplicates} pending={pending} />
      )}
      <PartyFields
        values={values}
        errors={state.fieldErrors ?? {}}
        sources={sources}
        provenance={provenance}
        isNew={!party}
        partyId={party?.id ?? null}
      />
      {!party && <PipelineEntryFields values={values} errors={state.fieldErrors ?? {}} parkings={parkings} />}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <ButtonLink href={party ? `/prospect/${party.id}` : "/prospect"} size="md">
          Annulla
        </ButtonLink>
        <Button type="submit" variant="primary" size="md" disabled={pending} aria-busy={pending || undefined}>
          {pending ? "Controllo e salvataggio..." : "Salva"}
        </Button>
      </div>
    </form>
  );
}

function PartyFields({
  values,
  errors,
  sources,
  provenance,
  isNew,
  partyId,
}: {
  values: RawValues;
  errors: Record<string, string>;
  sources: DataSource[];
  provenance: Provenance[];
  isNew: boolean;
  partyId: string | null;
}) {
  const [tipo, setTipo] = useState<PartyType>(values.tipo === "persona" ? "persona" : "azienda");
  const company = tipo === "azienda";

  const current = (field: TrackedField) =>
    provenance.find((row) => row.entita === "parties" && row.entita_id === partyId && row.campo === field);

  const text = (
    name: string,
    label: string,
    options: { required?: boolean; hint?: string; type?: string; inputMode?: "numeric" | "tel" | "email" | "url" } = {},
  ) => (
    <Field id={name} label={label} hint={options.hint} error={errors[name]} required={options.required}>
      <Input
        id={name}
        name={name}
        type={options.type ?? "text"}
        inputMode={options.inputMode}
        defaultValue={values[name]}
        autoComplete="off"
        invalid={Boolean(errors[name])}
        hasDescription={Boolean(errors[name] || options.hint)}
      />
    </Field>
  );

  const tracked = (name: TrackedField, control: React.ReactNode) => (
    <div className="flex flex-col gap-2">
      {control}
      <ProvenancePicker
        field={name}
        label={TRACKED_FIELD_LABELS[name]}
        sources={sources}
        defaultStatus={current(name)?.stato}
        defaultSourceId={current(name)?.fonte_id}
      />
    </div>
  );

  return (
    <>
      <section className="rounded-md border border-grey-60 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="sezione-anagrafica">
        <h2 id="sezione-anagrafica" className="text-h4 font-semibold">
          Anagrafica
        </h2>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <Field id="tipo" label="Tipo" error={errors.tipo} required>
            <Select id="tipo" name="tipo" value={tipo} onChange={(event) => setTipo(event.target.value as PartyType)}>
              {(Object.keys(PARTY_TYPE_LABELS) as PartyType[]).map((type) => (
                <option key={type} value={type}>
                  {PARTY_TYPE_LABELS[type]}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="categoria" label="Categoria" error={errors.categoria}>
            <Select id="categoria" name="categoria" defaultValue={values.categoria} invalid={Boolean(errors.categoria)}>
              <option value="">Non indicata</option>
              {PARTY_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </Select>
          </Field>
          {company ? (
            <>
              <div className="sm:col-span-2">{text("denominazione", "Denominazione", { required: true })}</div>
              {text("piva", "Partita IVA", { hint: "Facoltativa. 11 cifre." })}
            </>
          ) : (
            <>
              {text("nome", "Nome")}
              {text("cognome", "Cognome", { hint: "Nome o cognome: almeno uno dei due." })}
              {text("codice_fiscale", "Codice fiscale", { hint: "Facoltativo." })}
            </>
          )}
        </div>
      </section>

      <section className="rounded-md border border-grey-60 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="sezione-recapiti">
        <h2 id="sezione-recapiti" className="text-h4 font-semibold">
          Recapiti e dati
        </h2>
        <p className="mt-1 text-caption text-black-60">
          Per ogni dato indica da dove viene e se l&apos;hai verificato. Si salva solo per i dati che cambi.
        </p>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          {tracked(
            "telefono",
            text("telefono", "Telefono", { inputMode: "tel", hint: "Un solo numero, salvato come +39. Gli altri vanno nei contatti." }),
          )}
          {tracked(
            "email",
            text("email", company ? "Email generica" : "Email", { type: "email", inputMode: "email", hint: "Per esempio info@azienda.it." }),
          )}
          {company &&
            tracked("sito", text("sito", "Sito", { inputMode: "url", hint: "Il dominio si ricava da qui, senza www." }))}
          {company && text("form_web_url", "Canale: form sul sito", { inputMode: "url", hint: "Indirizzo della pagina con il modulo di contatto." })}
          {company &&
            tracked("dipendenti_stimati", text("dipendenti_stimati", "Dipendenti stimati", { inputMode: "numeric" }))}
          {company &&
            tracked(
              "parcheggio_privato",
              <Field id="parcheggio_privato" label="Parcheggio privato" error={errors.parcheggio_privato}>
                <Select id="parcheggio_privato" name="parcheggio_privato" defaultValue={values.parcheggio_privato}>
                  {(Object.keys(PRIVATE_PARKING_LABELS) as PrivateParking[]).map((option) => (
                    <option key={option} value={option}>
                      {PRIVATE_PARKING_LABELS[option]}
                    </option>
                  ))}
                </Select>
              </Field>,
            )}
        </div>
      </section>

      {isNew && (
        <section className="rounded-md border border-grey-60 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="sezione-sede">
          <h2 id="sezione-sede" className="text-h4 font-semibold">
            Sede principale
          </h2>
          <p className="mt-1 text-caption text-black-60">
            Facoltativa. Serve anche al controllo dei doppioni (nome simile nella stessa zona). Le coordinate si
            calcolano dalla scheda.
          </p>
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">{text("indirizzo", "Indirizzo")}</div>
            {text("cap", "CAP", { inputMode: "numeric" })}
            {text("citta", "Città")}
          </div>
        </section>
      )}
    </>
  );
}

// New party only (block 1a-7, A2): optional car park of interest. When it is
// chosen an opportunity is created too; "Contatto in entrata" proposes the
// stage "Interessata". The duplicate check still runs first.
function PipelineEntryFields({
  values,
  errors,
  parkings,
}: {
  values: RawValues;
  errors: Record<string, string>;
  parkings: ParkingOption[];
}) {
  const [parkingId, setParkingId] = useState(values.parcheggio_interesse ?? "");
  const [origine, setOrigine] = useState(values.origine ?? "");
  const [fase, setFase] = useState(values.fase_iniziale || defaultStageFor((origine || null) as Origin | null));
  const disabled = parkingId === "";
  return (
    <section className="rounded-md border border-grey-60 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="sezione-parcheggio">
      <h2 id="sezione-parcheggio" className="text-h4 font-semibold">
        Parcheggio di interesse
      </h2>
      <p className="mt-1 text-caption text-black-60">
        Facoltativo. Se lo scegli nasce anche l&apos;opportunità su quel parcheggio, assegnata a te.
      </p>
      <div className="mt-4 grid gap-5 sm:grid-cols-3">
        <Field id="parcheggio_interesse" label="Parcheggio" error={errors.parcheggio_interesse}>
          <Select
            id="parcheggio_interesse"
            name="parcheggio_interesse"
            value={parkingId}
            onChange={(event) => setParkingId(event.target.value)}
            invalid={Boolean(errors.parcheggio_interesse)}
          >
            <option value="">Nessuno</option>
            {parkings.map((parking) => (
              <option key={parking.id} value={parking.id}>
                {parking.nome}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="origine" label="Origine" error={errors.origine}>
          <Select
            id="origine"
            name="origine"
            value={origine}
            disabled={disabled}
            onChange={(event) => {
              setOrigine(event.target.value);
              setFase(defaultStageFor((event.target.value || null) as Origin | null));
            }}
            invalid={Boolean(errors.origine)}
          >
            <option value="">Non indicata</option>
            {ORIGINS.map((origin) => (
              <option key={origin} value={origin}>
                {ORIGIN_LABELS[origin]}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="fase_iniziale" label="Fase iniziale" hint="Proposta in base all'origine." error={errors.fase_iniziale}>
          <Select
            id="fase_iniziale"
            name="fase_iniziale"
            value={fase}
            disabled={disabled}
            onChange={(event) => setFase(event.target.value)}
            hasDescription
            invalid={Boolean(errors.fase_iniziale)}
          >
            {ENTRY_STAGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </section>
  );
}
