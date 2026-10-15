"use client";

import { useActionState, useRef, useState } from "react";
import { saveTemplate, type TemplateFormState } from "@/app/(app)/template/actions";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import {
  TEMPLATE_USES,
  TEMPLATE_USE_LABELS,
  TEMPLATE_VARIABLES,
  TEMPLATE_VARIABLE_LABELS,
  unknownVariables,
  type TemplateVariable,
} from "@/lib/email/template";
import type { TemplateVersion } from "@/lib/email/queries";

const INITIAL: TemplateFormState = { version: 0, status: "idle" };

// New template, or a new version of an existing one (B1). The variables can
// be inserted with a click; unknown ones are flagged while typing and
// refused when saving.
export function TemplateForm({
  template,
  initialState = INITIAL,
  action = saveTemplate,
}: {
  // The latest version, when saving a new version.
  template: TemplateVersion | null;
  // For previews only.
  initialState?: TemplateFormState;
  action?: typeof saveTemplate;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const values = state.values ?? {
    nome: template?.nome ?? "",
    uso: template?.uso ?? "uffici",
    oggetto: template?.oggetto ?? "",
    corpo: template?.corpo ?? "",
  };
  return (
    <form key={state.version} action={formAction} noValidate className="flex flex-col gap-5">
      {template && <input type="hidden" name="famiglia" value={template.famigliaId} />}
      {state.status === "error" && state.message && <Alert tone="critical">{state.message}</Alert>}
      <Fields values={values} errors={state.fieldErrors ?? {}} />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <ButtonLink href={template ? `/template/${template.famigliaId}` : "/template"} size="md">
          Annulla
        </ButtonLink>
        <Button type="submit" variant="primary" size="md" disabled={pending} aria-busy={pending || undefined}>
          {pending ? "Salvataggio..." : template ? `Salva come versione ${template.versione + 1}` : "Salva il template"}
        </Button>
      </div>
    </form>
  );
}

function Fields({ values, errors }: { values: NonNullable<TemplateFormState["values"]>; errors: Record<string, string> }) {
  const [oggetto, setOggetto] = useState(values.oggetto);
  const [corpo, setCorpo] = useState(values.corpo);
  const [focus, setFocus] = useState<"oggetto" | "corpo">("corpo");
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const unknownSubject = unknownVariables(oggetto);
  const unknownBody = unknownVariables(corpo);

  function insert(variable: TemplateVariable) {
    const token = `{${variable}}`;
    const target = focus === "oggetto" ? subjectRef.current : bodyRef.current;
    const current = focus === "oggetto" ? oggetto : corpo;
    const start = target?.selectionStart ?? current.length;
    const end = target?.selectionEnd ?? current.length;
    const next = current.slice(0, start) + token + current.slice(end);
    if (focus === "oggetto") setOggetto(next);
    else setCorpo(next);
    requestAnimationFrame(() => {
      target?.focus();
      target?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  const unknownText = (names: string[]) => `Variabili sconosciute: ${names.map((name) => `{${name}}`).join(", ")}.`;

  return (
    <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
      <section aria-labelledby="testo-titolo" className="flex flex-col gap-5 rounded-md border border-grey-60 bg-white p-5 shadow-sm sm:p-6">
        <h2 id="testo-titolo" className="text-h4 font-semibold">
          Testo
        </h2>
        <div className="grid gap-5 sm:grid-cols-[2fr_1fr]">
          <Field id="nome" label="Nome" error={errors.nome} required>
            <Input id="nome" name="nome" defaultValue={values.nome} maxLength={120} autoComplete="off" invalid={Boolean(errors.nome)} />
          </Field>
          <Field id="uso" label="Uso" error={errors.uso} required>
            <Select id="uso" name="uso" defaultValue={values.uso} invalid={Boolean(errors.uso)}>
              {TEMPLATE_USES.map((use) => (
                <option key={use} value={use}>
                  {TEMPLATE_USE_LABELS[use]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field id="oggetto" label="Oggetto" error={errors.oggetto ?? (unknownSubject.length > 0 ? unknownText(unknownSubject) : undefined)} required>
          <Input
            ref={subjectRef}
            id="oggetto"
            name="oggetto"
            value={oggetto}
            maxLength={200}
            autoComplete="off"
            onFocus={() => setFocus("oggetto")}
            onChange={(event) => setOggetto(event.target.value)}
            invalid={Boolean(errors.oggetto) || unknownSubject.length > 0}
          />
        </Field>
        <Field
          id="corpo"
          label="Corpo"
          hint="Il piede con chi siamo, come abbiamo avuto il contatto e come opporsi si aggiunge da solo a ogni email."
          error={errors.corpo ?? (unknownBody.length > 0 ? unknownText(unknownBody) : undefined)}
          required
        >
          <Textarea
            ref={bodyRef}
            id="corpo"
            name="corpo"
            rows={16}
            value={corpo}
            maxLength={20000}
            onFocus={() => setFocus("corpo")}
            onChange={(event) => setCorpo(event.target.value)}
            invalid={Boolean(errors.corpo) || unknownBody.length > 0}
            hasDescription
          />
        </Field>
      </section>
      <aside aria-labelledby="variabili-titolo" className="h-fit rounded-md border border-grey-60 bg-white p-5 shadow-sm sm:p-6">
        <h2 id="variabili-titolo" className="text-h4 font-semibold">
          Variabili
        </h2>
        <p className="mt-1 text-caption text-black-60">
          Un clic inserisce la variabile nel punto in cui stai scrivendo ({focus === "oggetto" ? "oggetto" : "corpo"}).
        </p>
        <ul className="mt-3 flex flex-col gap-2">
          {TEMPLATE_VARIABLES.map((variable) => (
            <li key={variable}>
              <button
                type="button"
                onClick={() => insert(variable)}
                className="flex w-full flex-col items-start rounded-sm border border-grey-60 px-3 py-2 text-left hover:border-brand-blue hover:bg-blue-20"
              >
                <code className="text-[14px] font-semibold text-blue-ink">{`{${variable}}`}</code>
                <span className="text-caption text-black-80">{TEMPLATE_VARIABLE_LABELS[variable]}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
