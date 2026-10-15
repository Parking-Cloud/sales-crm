"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { registerPermission } from "@/app/(app)/email/actions";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { formatDate } from "@/lib/format";
import { PERMISSION_BASIS_LABELS, type PermissionBasis } from "@/lib/email/template";
import { romeDay } from "@/lib/pipeline/dates";
import { safeCall } from "@/lib/import/safe-call";

const BASES = Object.keys(PERMISSION_BASIS_LABELS) as PermissionBasis[];

// Email permission of a contact, shown in words (not only by colour).
export function PermissionBadge({ permission }: { permission: { base: PermissionBasis; data: string } | null }) {
  if (!permission) return <Badge tone="neutral">Email: nessun permesso</Badge>;
  return (
    <Badge tone="success">
      Email: {PERMISSION_BASIS_LABELS[permission.base].toLowerCase()}, {formatDate(permission.data)}
    </Badge>
  );
}

// "Registra permesso" (B4): basis required, source and date; the address
// can be added when the contact has none.
export function RegisterPermissionButton({
  partyId,
  contactId,
  name,
  hasEmail,
  initiallyOpen = false,
  action = registerPermission,
}: {
  partyId: string;
  // Null: the party's own address.
  contactId: string | null;
  name: string;
  hasEmail: boolean;
  // For previews and end-to-end tests only.
  initiallyOpen?: boolean;
  action?: typeof registerPermission;
}) {
  const router = useRouter();
  const today = romeDay(new Date());
  const [open, setOpen] = useState(initiallyOpen);
  const [base, setBase] = useState<PermissionBasis | "">("");
  const [fonte, setFonte] = useState("");
  const [giorno, setGiorno] = useState(today);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    setOpen(false);
    setBase("");
    setFonte("");
    setGiorno(romeDay(new Date()));
    setEmail("");
    setError(null);
  }

  function submit() {
    setError(null);
    if (!base) return setError("Scegli la base del permesso.");
    if (!hasEmail && !email.trim()) return setError("Scrivi l'indirizzo email.");
    startTransition(async () => {
      const result = await safeCall(() => action({ partyId, contactId, base, fonte, giorno, email }));
      if (!result.ok) return setError(result.message);
      close();
      router.refresh();
    });
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Registra permesso<span className="sr-only"> email per {name}</span>
      </Button>
      <Dialog
        open={open}
        title={`Permesso email: ${name}`}
        busy={pending}
        onClose={close}
        footer={
          <>
            <Button size="md" disabled={pending} onClick={close}>
              Annulla
            </Button>
            <Button variant="primary" size="md" disabled={pending} aria-busy={pending || undefined} onClick={submit}>
              {pending ? "Salvataggio..." : "Registra il permesso"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-body text-black-80">
            Senza permesso non si può preparare un&apos;email. Si registra con chi l&apos;ha dato, come e quando, e il tuo nome.
          </p>
          <fieldset>
            <legend className="text-label font-semibold tracking-[0.08em] text-black-80 uppercase">
              Base<span aria-hidden="true" className="ml-0.5 text-error">*</span>
              <span className="sr-only"> (obbligatoria)</span>
            </legend>
            <div className="mt-2 flex flex-col gap-2">
              {BASES.map((option) => (
                <label
                  key={option}
                  className="flex min-h-10 cursor-pointer items-center gap-2 rounded-sm border border-grey-60 px-3 text-body has-checked:border-brand-blue has-checked:bg-blue-20"
                >
                  <input type="radio" name="base-permesso" value={option} checked={base === option} onChange={() => setBase(option)} className="size-4 accent-brand-blue" />
                  {PERMISSION_BASIS_LABELS[option]}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <Field id="permesso-fonte" label="Fonte" hint="Per esempio: chiamata al centralino, email ricevuta, modulo firmato.">
              <Input id="permesso-fonte" value={fonte} maxLength={200} onChange={(event) => setFonte(event.target.value)} hasDescription />
            </Field>
            <Field id="permesso-data" label="Data">
              <Input id="permesso-data" type="date" value={giorno} max={today} onChange={(event) => setGiorno(event.target.value)} />
            </Field>
          </div>
          {!hasEmail && (
            <Field id="permesso-email" label="Indirizzo email" hint="Il contatto non ne ha uno: si salva sul contatto." required>
              <Input id="permesso-email" type="email" inputMode="email" value={email} onChange={(event) => setEmail(event.target.value)} hasDescription />
            </Field>
          )}
          {error && <Alert tone="critical">{error}</Alert>}
        </div>
      </Dialog>
    </>
  );
}
