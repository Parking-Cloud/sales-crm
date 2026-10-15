"use client";

import { useActionState } from "react";
import { saveEmailSettings, saveMySignature, type EmailFormState } from "@/app/(app)/impostazioni/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/field";
import type { EmailSettings } from "@/lib/email/queries";
import { formatSignature, type Signature } from "@/lib/email/template";

const INITIAL: EmailFormState = { version: 0, status: "idle" };

// "La tua firma" (B2): each user fills their own; {firma} uses it. Optional
// since block 1a-8: when empty {firma} stays empty (Gmail can add its own).
export function SignatureForm({ signature, initialState = INITIAL }: { signature: Signature; initialState?: EmailFormState }) {
  const [state, formAction, pending] = useActionState(saveMySignature, initialState);
  const values = state.values ?? {
    firma_nome: signature.nome ?? "",
    firma_ruolo: signature.ruolo ?? "",
    firma_telefono: signature.telefono ?? "",
    firma_testo: signature.testo ?? "",
  };
  const errors = state.fieldErrors ?? {};
  const preview = formatSignature({ nome: values.firma_nome, ruolo: values.firma_ruolo, telefono: values.firma_telefono, testo: values.firma_testo });
  return (
    <form key={state.version} action={formAction} noValidate className="flex flex-col gap-4">
      {state.status === "saved" && <Alert tone="success">{values.firma_nome ? "Firma salvata." : "Firma del CRM vuota: {firma} resterà vuota."}</Alert>}
      {state.status === "error" && state.message && <Alert tone="critical">{state.message}</Alert>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="firma_nome" label="Nome" error={errors.firma_nome}>
          <Input id="firma_nome" name="firma_nome" defaultValue={values.firma_nome} maxLength={120} autoComplete="name" invalid={Boolean(errors.firma_nome)} />
        </Field>
        <Field id="firma_ruolo" label="Ruolo" error={errors.firma_ruolo}>
          <Input id="firma_ruolo" name="firma_ruolo" defaultValue={values.firma_ruolo} maxLength={120} autoComplete="organization-title" />
        </Field>
        <Field id="firma_telefono" label="Telefono" error={errors.firma_telefono}>
          <Input id="firma_telefono" name="firma_telefono" defaultValue={values.firma_telefono} maxLength={40} inputMode="tel" autoComplete="tel" />
        </Field>
      </div>
      <Field id="firma_testo" label="Testo libero" hint="Facoltativo, per esempio il sito o un orario." error={errors.firma_testo}>
        <Textarea id="firma_testo" name="firma_testo" rows={2} defaultValue={values.firma_testo} maxLength={1000} hasDescription />
      </Field>
      {preview && (
        <div>
          <p className="text-label font-semibold tracking-[0.08em] text-black-60 uppercase">Firma salvata</p>
          <pre className="mt-1 rounded-sm bg-grey-20 p-3 font-sans text-body whitespace-pre-wrap">{preview}</pre>
        </div>
      )}
      <p className="text-caption text-black-80">
        Per la firma con logo impostala in Gmail (Impostazioni → Firma, inserita nelle nuove email): Gmail la aggiunge quando
        apri la bozza.
      </p>
      <div className="flex justify-end">
        <Button type="submit" size="md" disabled={pending} aria-busy={pending || undefined}>
          {pending ? "Salvataggio..." : "Salva la firma"}
        </Button>
      </div>
    </form>
  );
}

// Footer and cold email (B3, B4), administrators.
export function EmailSettingsForm({ settings, initialState = INITIAL }: { settings: EmailSettings; initialState?: EmailFormState }) {
  const [state, formAction, pending] = useActionState(saveEmailSettings, initialState);
  const values = state.values ?? {
    ragione_sociale: settings.ragioneSociale ?? "",
    email_opposizione: settings.emailOpposizione ?? "",
    email_a_freddo: settings.emailAFreddo ? "1" : "",
  };
  const errors = state.fieldErrors ?? {};
  return (
    <form key={state.version} action={formAction} noValidate className="flex flex-col gap-4">
      {state.status === "saved" && <Alert tone="success">Impostazioni salvate.</Alert>}
      {state.status === "error" && state.message && <Alert tone="critical">{state.message}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="ragione_sociale" label="Ragione sociale" hint="Compare nel piede: chi siamo." error={errors.ragione_sociale} required>
          <Input id="ragione_sociale" name="ragione_sociale" defaultValue={values.ragione_sociale} maxLength={200} hasDescription invalid={Boolean(errors.ragione_sociale)} />
        </Field>
        <Field id="email_opposizione" label="Indirizzo per l'opposizione" hint="Nel piede: a chi scrivere per non ricevere più email." error={errors.email_opposizione} required>
          <Input id="email_opposizione" name="email_opposizione" type="email" inputMode="email" defaultValue={values.email_opposizione} hasDescription invalid={Boolean(errors.email_opposizione)} />
        </Field>
      </div>
      <div className="rounded-sm border border-grey-60 p-4">
        <Checkbox
          name="email_a_freddo"
          value="1"
          defaultChecked={values.email_a_freddo === "1"}
          label="Email a freddo: consenti l'invio anche senza permesso registrato"
          hint="Da attivare solo dopo il parere del legale. Finché è spenta, nessuna email parte verso chi non ha un permesso (richiesta in chiamata, contatto in entrata o consenso). La lista di esclusione vale sempre."
        />
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="md" disabled={pending} aria-busy={pending || undefined}>
          {pending ? "Salvataggio..." : "Salva le impostazioni email"}
        </Button>
      </div>
    </form>
  );
}
