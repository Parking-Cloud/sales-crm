import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { EligibilityChecks, EmailComposer } from "@/components/email/email-composer";
import { RegisterPermissionButton } from "@/components/email/permission-controls";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/field";
import { getCurrentUser } from "@/lib/auth/current-user";
import { SIGN_IN_PATH } from "@/lib/auth/routes";
import { getEligibility, getEmailSettings, getSignature, listEmailOpportunities, listRecipients, listTemplates, templateValues } from "@/lib/email/queries";
import { TEMPLATE_USE_LABELS, TEMPLATE_VARIABLE_LABELS, buildFooter, renderTemplate } from "@/lib/email/template";

export const metadata: Metadata = { title: "Prepara email" };

const UUID = /^[0-9a-f-]{36}$/i;
const GENERAL = "generale";

const one = (value: string | string[] | undefined) => (typeof value === "string" ? value.trim() : "");

// "Prepara email" (CRM-22): contact, template and car park; the text is
// filled in and editable; the eligibility check is shown in plain words.
// When the email is not allowed there is no way to send it, only the reason.
export default async function PrepareEmailPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  const params = await searchParams;
  const partyId = one(params.soggetto);
  if (!UUID.test(partyId)) notFound();
  const { party, recipients } = await listRecipients(partyId);
  if (!party) notFound();

  const [opportunities, templates, signature, settings] = await Promise.all([
    listEmailOpportunities(partyId),
    listTemplates({ onlyActive: true }),
    getSignature(user.id),
    getEmailSettings(),
  ]);

  const opportunityParam = one(params.opportunita);
  const opportunity = opportunities.find((opp) => opp.id === opportunityParam) ?? opportunities.find((opp) => opp.aperta) ?? null;
  const templateParam = one(params.template);
  const template = templates.find((item) => item.id === templateParam) ?? templates[0] ?? null;
  const contactParam = one(params.contatto);
  const recipient =
    contactParam === GENERAL
      ? recipients.find((item) => item.id === null)!
      : (recipients.find((item) => item.id === contactParam) ??
        recipients.find((item) => item.id !== null && item.email && !item.nonContattare) ??
        recipients.find((item) => item.id === null)!);

  const back = opportunity ? `/opportunita/${opportunity.id}` : `/soggetti/${partyId}`;
  const header = (
    <>
      <p className="text-caption">
        <Link href={back} className="rounded-xs text-blue-ink underline underline-offset-2">
          {opportunity ? `${party.nome} · ${opportunity.parking}` : party.nome}
        </Link>
      </p>
      <h1 className="mt-2 text-h2 leading-tight font-semibold">Prepara email</h1>
      <p className="mt-2 max-w-3xl text-body text-black-60">
        Il CRM non invia nulla: apri la bozza in Gmail o copia il testo, poi registra l&apos;invio con &ldquo;Segna come inviata&rdquo;.
      </p>
    </>
  );

  if (party.erased || party.nonContattare) {
    return (
      <>
        {header}
        <Alert tone="critical" title="Email non ammessa" className="mt-6">
          {party.erased ? "I dati del soggetto sono stati cancellati per richiesta GDPR." : "Il soggetto ha chiesto di non essere contattato."}
        </Alert>
      </>
    );
  }

  const eligibility = await getEligibility(partyId, recipient.id);
  const values = await templateValues({
    partyName: party.nome,
    contactName: recipient.id ? recipient.nome : null,
    parkingId: opportunity?.parkingId ?? null,
    signature,
  });
  const subject = template ? renderTemplate(template.oggetto, values) : { text: "", missing: [] };
  const body = template ? renderTemplate(template.corpo, values) : { text: "", missing: [] };
  const missing = [...new Set([...subject.missing, ...body.missing])];
  const footer =
    settings.ragioneSociale && settings.emailOpposizione
      ? buildFooter({
          ragioneSociale: settings.ragioneSociale,
          emailOpposizione: settings.emailOpposizione,
        })
      : "Piede non disponibile: l'amministratore deve impostare ragione sociale e indirizzo per l'opposizione.";
  const permissionMissing = eligibility.controlli.some((check) => check.codice === "permesso" && !check.ok);

  return (
    <>
      {header}
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_2fr]">
        <div className="flex flex-col gap-6">
          <section aria-labelledby="scelte-titolo" className="rounded-md border border-grey-60 bg-white p-5 shadow-sm sm:p-6">
            <h2 id="scelte-titolo" className="text-h4 font-semibold">
              Destinatario e testo
            </h2>
            <form method="get" action="/email/prepara" className="mt-4 flex flex-col gap-4">
              <input type="hidden" name="soggetto" value={partyId} />
              <Field id="contatto" label="Destinatario">
                <Select id="contatto" name="contatto" defaultValue={recipient.id ?? GENERAL}>
                  {recipients.map((item) => (
                    <option key={item.id ?? GENERAL} value={item.id ?? GENERAL}>
                      {item.nome}
                      {item.email ? ` – ${item.email}` : " – senza email"}
                      {item.nonContattare ? " (non contattare)" : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="opportunita" label="Parcheggio">
                <Select id="opportunita" name="opportunita" defaultValue={opportunity?.id ?? ""}>
                  <option value="">Nessuno</option>
                  {opportunities.map((opp) => (
                    <option key={opp.id} value={opp.id}>
                      {opp.parking}
                      {opp.aperta ? "" : " (chiusa)"}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="template" label="Template">
                <Select id="template" name="template" defaultValue={template?.id ?? ""}>
                  {templates.length === 0 && <option value="">Nessun template</option>}
                  {templates.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nome} ({TEMPLATE_USE_LABELS[item.uso]})
                    </option>
                  ))}
                </Select>
              </Field>
              <Button type="submit">Aggiorna il testo</Button>
            </form>
          </section>

          <section aria-labelledby="controllo-titolo" className="rounded-md border border-grey-60 bg-white p-5 shadow-sm sm:p-6">
            <h2 id="controllo-titolo" className="text-h4 font-semibold">
              Controllo di ammissibilità
            </h2>
            <p className={`mt-2 text-body font-semibold ${eligibility.ammessa ? "text-success-ink" : "text-error-ink"}`}>
              {eligibility.ammessa ? "Email ammessa" : "Email non ammessa"}
            </p>
            <div className="mt-3">
              <EligibilityChecks eligibility={eligibility} />
            </div>
            {eligibility.permesso && (
              <p className="mt-3 text-caption text-black-80">
                Permesso: {eligibility.permesso.fonte ? `${eligibility.permesso.fonte}, ` : ""}registrato da {eligibility.permesso.operatore ?? "–"}.
              </p>
            )}
            {permissionMissing && !recipient.nonContattare && (
              <div className="mt-4 flex flex-wrap gap-2">
                <RegisterPermissionButton partyId={partyId} contactId={recipient.id} name={recipient.nome} hasEmail={Boolean(recipient.email)} />
              </div>
            )}
          </section>
        </div>

        <section aria-labelledby="testo-titolo" className="rounded-md border border-grey-60 bg-white p-5 shadow-sm sm:p-6">
          <h2 id="testo-titolo" className="text-h4 font-semibold">
            Email
          </h2>
          <div className="mt-4 flex flex-col gap-4">
            {!template && (
              <Alert tone="info">Nessun template in uso: l&apos;amministratore li crea in &ldquo;Template email&rdquo;. Puoi scrivere il testo qui.</Alert>
            )}
            {missing.length > 0 && (
              <Alert tone="warning">
                Senza valore: {missing.map((name) => TEMPLATE_VARIABLE_LABELS[name]).join(", ")}. Nel testo sono vuote: completale a mano.
              </Alert>
            )}
            {eligibility.ammessa ? (
              <EmailComposer
                key={`${recipient.id}-${opportunity?.id}-${template?.id}`}
                partyId={partyId}
                contactId={recipient.id}
                opportunityId={opportunity?.id ?? null}
                templateId={template?.id ?? null}
                recipient={eligibility.destinatario ?? ""}
                initialSubject={subject.text}
                initialBody={body.text}
                footer={footer}
                allowed
              />
            ) : (
              <Alert tone="critical" title="Non si può inviare">
                {eligibility.controlli
                  .filter((check) => !check.ok)
                  .map((check) => check.testo)
                  .join(". ")}
                .
              </Alert>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
