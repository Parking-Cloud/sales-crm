"use client";

import { useActionState } from "react";
import { saveContact } from "@/app/(app)/prospect/actions";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { CONTACT_CHANNEL_LABELS, type ContactChannel } from "@/lib/parties/labels";
import { INITIAL_PARTY_FORM_STATE, type PartyFormState } from "@/lib/parties/form-state";
import type { Contact, DataSource, Provenance } from "@/lib/parties/queries";
import { ProvenancePicker } from "./provenance";

// Contact person of a party. "Non contattare" is set from the party page,
// with a reason, not here.
export function ContactForm({
  partyId,
  contact,
  sources,
  provenance,
  initialState = INITIAL_PARTY_FORM_STATE,
}: {
  partyId: string;
  contact: Contact | null;
  sources: DataSource[];
  provenance?: Provenance;
  initialState?: PartyFormState;
}) {
  const [state, formAction, pending] = useActionState(saveContact, initialState);
  const errors = state.fieldErrors ?? {};
  const values = state.values ?? {
    nome: contact?.nome ?? "",
    cognome: contact?.cognome ?? "",
    ruolo: contact?.ruolo ?? "",
    email: contact?.email ?? "",
    telefono: contact?.telefono ?? "",
    canale_preferito: contact?.canale_preferito ?? "",
  };

  const text = (name: string, label: string, hint?: string, type = "text") => (
    <Field id={name} label={label} hint={hint} error={errors[name]}>
      <Input
        id={name}
        name={name}
        type={type}
        defaultValue={values[name]}
        autoComplete="off"
        invalid={Boolean(errors[name])}
        hasDescription={Boolean(errors[name] || hint)}
      />
    </Field>
  );

  return (
    <form key={state.version} action={formAction} noValidate className="flex flex-col gap-6">
      <input type="hidden" name="party_id" value={partyId} />
      {contact && <input type="hidden" name="id" value={contact.id} />}
      {state.status === "error" && state.message && <Alert tone="critical">{state.message}</Alert>}
      {contact?.non_contattare && (
        <Alert tone="critical" title="Non contattare">
          Questo contatto ha chiesto di non essere contattato.
        </Alert>
      )}
      <section className="rounded-md border border-grey-60 bg-white p-5 shadow-sm sm:p-6" aria-labelledby="sezione-contatto">
        <h2 id="sezione-contatto" className="text-h4 font-semibold">
          Referente
        </h2>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          {text("nome", "Nome")}
          {text("cognome", "Cognome")}
          <div className="sm:col-span-2">{text("ruolo", "Ruolo", "Per esempio Responsabile del personale.")}</div>
          <div className="sm:col-span-2">
            <ProvenancePicker
              field="referente"
              label="Referente"
              sources={sources}
              defaultStatus={provenance?.stato}
              defaultSourceId={provenance?.fonte_id}
            />
          </div>
          {text("email", "Email", undefined, "email")}
          {text("telefono", "Telefono", "Anche più numeri, separati da virgola. Salvati come +39.", "tel")}
          <Field id="canale_preferito" label="Canale preferito" error={errors.canale_preferito}>
            <Select id="canale_preferito" name="canale_preferito" defaultValue={values.canale_preferito}>
              <option value="">Non indicato</option>
              {(Object.keys(CONTACT_CHANNEL_LABELS) as ContactChannel[]).map((channel) => (
                <option key={channel} value={channel}>
                  {CONTACT_CHANNEL_LABELS[channel]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </section>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <ButtonLink href={`/prospect/${partyId}#contatti`} size="md">
          Annulla
        </ButtonLink>
        <Button type="submit" variant="primary" size="md" disabled={pending} aria-busy={pending || undefined}>
          {pending ? "Salvataggio..." : "Salva contatto"}
        </Button>
      </div>
    </form>
  );
}
