"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { recordSentEmail } from "@/app/(app)/email/actions";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { gmailComposeUrl, withFooter } from "@/lib/email/template";
import type { Eligibility } from "@/lib/email/queries";
import { safeCall } from "@/lib/import/safe-call";

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// The checks in plain words (B5): each one with its outcome, not only a
// colour.
export function EligibilityChecks({ eligibility }: { eligibility: Eligibility }) {
  return (
    <ul className="flex flex-col gap-2" aria-label="Controllo di ammissibilità">
      {eligibility.controlli.map((check) => (
        <li key={check.codice} className="flex items-start gap-2 text-body">
          <span
            aria-hidden="true"
            className={`mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-pill text-[12px] font-bold text-white ${check.ok ? "bg-success" : "bg-error"}`}
          >
            {check.ok ? "✓" : "!"}
          </span>
          <span>
            <span className="sr-only">{check.ok ? "Superato: " : "Non superato: "}</span>
            {check.testo}
          </span>
        </li>
      ))}
    </ul>
  );
}

// Text of the email, editable, with the fixed footer; "Apri in Gmail",
// "Copia testo" and "Segna come inviata" only when the email is allowed.
export function EmailComposer({
  partyId,
  contactId,
  opportunityId,
  templateId,
  recipient,
  initialSubject,
  initialBody,
  footer,
  allowed,
  taskId = null,
  nextHref = null,
  action = recordSentEmail,
}: {
  partyId: string;
  contactId: string | null;
  opportunityId: string | null;
  templateId: string | null;
  recipient: string;
  initialSubject: string;
  initialBody: string;
  footer: string;
  allowed: boolean;
  // Cadence email step: "Segna come inviata" also closes it; then the next
  // email of the cadence, if any (block 1a-8, B5).
  taskId?: string | null;
  nextHref?: string | null;
  // For previews and end-to-end tests only.
  action?: typeof recordSentEmail;
}) {
  const router = useRouter();
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [notice, setNotice] = useState<{ tone: "info" | "warning" | "critical" | "success"; text: string } | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();
  const fullBody = withFooter(body, footer);

  async function openGmail() {
    const { url, withBody } = gmailComposeUrl({ to: recipient, subject, body: fullBody });
    if (!withBody) {
      const copied = await copy(fullBody);
      setNotice({
        tone: "warning",
        text: copied
          ? "Il testo è troppo lungo per il link di Gmail: l'ho copiato negli appunti. In Gmail incollalo nel corpo dell'email."
          : "Il testo è troppo lungo per il link di Gmail e non è stato possibile copiarlo: usa \"Copia testo\" e incollalo in Gmail.",
      });
    } else {
      setNotice(null);
    }
    window.open(url, "_blank", "noopener");
  }

  async function copyText() {
    const copied = await copy(`${subject}\n\n${fullBody}`);
    setNotice(copied ? { tone: "info", text: "Oggetto e testo copiati negli appunti." } : { tone: "critical", text: "Copia non riuscita: seleziona il testo a mano." });
  }

  function markSent() {
    setNotice(null);
    startTransition(async () => {
      const result = await safeCall(() => action({ partyId, contactId, opportunityId, templateId, oggetto: subject, corpo: fullBody, taskId }));
      if (!result.ok) return setNotice({ tone: "critical", text: result.message });
      setSent(true);
      setNotice({
        tone: "success",
        text: taskId
          ? "Email registrata come inviata e passo della cadenza chiuso: il prossimo passo è in Oggi."
          : "Email registrata come inviata: è nello storico, con il controllo di ammissibilità.",
      });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body">
        <span className="font-semibold">A:</span> {recipient}
      </p>
      <Field id="email-oggetto" label="Oggetto" required>
        <Input id="email-oggetto" value={subject} maxLength={300} onChange={(event) => setSubject(event.target.value)} disabled={sent} />
      </Field>
      <Field id="email-corpo" label="Testo" hint="Modificabile. Il piede sotto si aggiunge da solo e non si modifica.">
        <Textarea id="email-corpo" rows={14} value={body} onChange={(event) => setBody(event.target.value)} disabled={sent} hasDescription />
      </Field>
      <div>
        <p className="text-label font-semibold tracking-[0.08em] text-black-60 uppercase">Piede (fisso)</p>
        <pre className="mt-1 rounded-sm bg-grey-20 p-3 font-sans text-caption whitespace-pre-wrap text-black-80">{footer}</pre>
      </div>
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      {allowed && !sent && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="primary" size="md" onClick={openGmail} disabled={!subject.trim() || !body.trim()}>
              Apri in Gmail<span className="sr-only"> (si apre in una nuova scheda)</span>
            </Button>
            <Button size="md" onClick={copyText}>
              Copia testo
            </Button>
          </div>
          <div className="flex flex-col gap-2 border-t border-grey-60 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-caption text-black-80">Dopo averla inviata da Gmail, registrala qui: un clic.</p>
            <Button size="md" onClick={markSent} disabled={pending || !subject.trim() || !body.trim()} aria-busy={pending || undefined}>
              {pending ? "Registrazione..." : "Segna come inviata"}
            </Button>
          </div>
        </div>
      )}
      {sent && nextHref && (
        <div>
          <ButtonLink href={nextHref} variant="primary" size="md">
            Email successiva della cadenza
          </ButtonLink>
        </div>
      )}
      {sent && (
        <p className="text-body">
          <Link href={opportunityId ? `/opportunita/${opportunityId}` : `/soggetti/${partyId}`} className="rounded-xs font-semibold text-blue-ink underline underline-offset-2">
            Torna {opportunityId ? "all'opportunità" : "al soggetto"}
          </Link>
        </p>
      )}
    </div>
  );
}
