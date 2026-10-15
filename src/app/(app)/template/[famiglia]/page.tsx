import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { TemplateForm } from "@/components/email/template-form";
import { TemplateToggle } from "@/components/email/template-toggle";
import { TemplateVersionControls } from "@/components/email/template-version-controls";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { getCurrentUser } from "@/lib/auth/current-user";
import { SIGN_IN_PATH } from "@/lib/auth/routes";
import {
  getEmailSettings,
  getSignature,
  listEmailOpportunities,
  listRecipients,
  listTemplateVersions,
  templateUsage,
  templateValues,
} from "@/lib/email/queries";
import { TEMPLATE_USE_LABELS, TEMPLATE_VARIABLE_LABELS, buildFooter, renderTemplate, withFooter } from "@/lib/email/template";
import { formatDate } from "@/lib/format";
import { partyName } from "@/lib/parties/labels";
import { readPartyFilters, searchParties } from "@/lib/parties/queries";
import { listParkingOptions } from "@/lib/pipeline/queries";

const UUID = /^[0-9a-f-]{36}$/i;

type Params = Promise<{ famiglia: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { famiglia } = await params;
  const versions = UUID.test(famiglia) ? await listTemplateVersions(famiglia) : [];
  return { title: versions[0]?.nome ?? "Template" };
}

const one = (value: string | string[] | undefined) => (typeof value === "string" ? value.trim() : "");

export default async function TemplatePage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  if (!user.isAdmin) redirect("/oggi");
  const { famiglia } = await params;
  if (!UUID.test(famiglia)) notFound();
  const versions = await listTemplateVersions(famiglia);
  if (versions.length === 0) notFound();
  const latest = versions[0];
  // The active version: the one "Prepara email" uses and new versions start from.
  const active = versions.find((version) => version.corrente) ?? latest;
  const usage = await templateUsage(versions.map((version) => version.id));
  const search = await searchParams;
  const savedVersion = one(search.salvata);
  const shownNumber = Number.parseInt(one(search.versione), 10);
  const shown = versions.find((version) => version.versione === shownNumber) ?? active;
  const base = `/template/${famiglia}`;

  // Preview with a real party chosen by the administrator.
  const query = one(search.q);
  const previewId = UUID.test(one(search.anteprima)) ? one(search.anteprima) : null;
  const matches = query ? (await searchParties({ ...readPartyFilters({ q: query }), page: 1 })).items.slice(0, 8) : [];
  let preview: { subject: string; body: string; missing: string[]; party: string; parkingId: string | null } | null = null;
  const parkings = previewId ? await listParkingOptions() : [];
  if (previewId) {
    const { party, recipients } = await listRecipients(previewId);
    if (party) {
      const contact = recipients.find((recipient) => recipient.id && recipient.email) ?? recipients.find((recipient) => recipient.id) ?? null;
      const opportunities = await listEmailOpportunities(previewId);
      const parkingParam = one(search.parcheggio);
      const parkingId = UUID.test(parkingParam) ? parkingParam : (opportunities.find((opp) => opp.aperta) ?? opportunities[0])?.parkingId ?? null;
      const [signature, settings] = await Promise.all([getSignature(user.id), getEmailSettings()]);
      const values = await templateValues({ partyName: party.nome, contactName: contact?.id ? contact.nome : null, parkingId, signature });
      const subject = renderTemplate(shown.oggetto, values);
      const body = renderTemplate(shown.corpo, values);
      const footer = buildFooter({
        ragioneSociale: settings.ragioneSociale ?? "[ragione sociale da impostare]",
        emailOpposizione: settings.emailOpposizione ?? "[indirizzo per l'opposizione da impostare]",
      });
      preview = {
        subject: subject.text,
        body: withFooter(body.text, footer),
        missing: [...new Set([...subject.missing, ...body.missing])].map((name) => TEMPLATE_VARIABLE_LABELS[name]),
        party: party.nome,
        parkingId,
      };
    }
  }

  return (
    <>
      <p className="text-caption">
        <Link href="/template" className="rounded-xs text-blue-ink underline underline-offset-2">
          Template email
        </Link>
      </p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-h2 leading-tight font-semibold">{latest.nome}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Badge tone="info">{TEMPLATE_USE_LABELS[latest.uso]}</Badge>
            {latest.attivo ? <Badge tone="success">In uso</Badge> : <Badge tone="neutral">Disattivato</Badge>}
            <Badge tone="info">Versione attiva: {active.versione}</Badge>
            <span className="text-caption text-black-60">
              {versions.length === 1 ? "1 versione" : `${versions.length} versioni`}, ultima del {formatDate(latest.creataIl)}
              {latest.autore ? ` (${latest.autore})` : ""}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <TemplateToggle famigliaId={famiglia} attivo={latest.attivo} />
        </div>
      </div>

      {savedVersion && (
        <Alert tone="success" className="mt-6">
          Salvata la versione {savedVersion}: ora è quella attiva.
        </Alert>
      )}

      <div className="mt-6 flex flex-col gap-6">
        <section aria-labelledby="anteprima-titolo" className="rounded-md border border-grey-60 bg-white p-5 shadow-sm sm:p-6">
          <h2 id="anteprima-titolo" className="text-h4 font-semibold">
            Anteprima con un soggetto reale
          </h2>
          <p className="mt-1 text-caption text-black-60">
            Versione {shown.versione}. Variabili compilate con i dati del soggetto, del suo primo contatto, del parcheggio e con la
            tua firma.
          </p>
          <form method="get" action={base} role="search" aria-label="Cerca il soggetto per l'anteprima" className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            {shown.versione !== latest.versione && <input type="hidden" name="versione" value={shown.versione} />}
            <div className="sm:w-96">
              <Field id="q" label="Soggetto">
                <Input id="q" name="q" type="search" defaultValue={query} placeholder="Nome, P.IVA o telefono" autoComplete="off" />
              </Field>
            </div>
            <Button type="submit">Cerca</Button>
          </form>
          {query && (
            <ul className="mt-3 flex flex-col gap-1">
              {matches.length === 0 && <li className="text-body text-black-60">Nessun soggetto trovato.</li>}
              {matches.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`${base}?anteprima=${item.id}${shown.versione !== latest.versione ? `&versione=${shown.versione}` : ""}`}
                    className="rounded-xs font-semibold text-blue-ink underline underline-offset-2"
                  >
                    {partyName(item)}
                  </Link>
                  {item.citta && <span className="text-caption text-black-60"> · {item.citta}</span>}
                </li>
              ))}
            </ul>
          )}
          {preview && (
            <div className="mt-5 flex flex-col gap-3">
              <form method="get" action={base} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <input type="hidden" name="anteprima" value={previewId ?? ""} />
                {shown.versione !== latest.versione && <input type="hidden" name="versione" value={shown.versione} />}
                <div className="sm:w-72">
                  <Field id="parcheggio" label={`Parcheggio per ${preview.party}`}>
                    <Select id="parcheggio" name="parcheggio" defaultValue={preview.parkingId ?? ""}>
                      <option value="">Nessuno</option>
                      {parkings.map((parking) => (
                        <option key={parking.id} value={parking.id}>
                          {parking.nome}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <Button type="submit">Aggiorna l&apos;anteprima</Button>
              </form>
              {preview.missing.length > 0 && (
                <Alert tone="warning">Senza valore per questo soggetto: {preview.missing.join(", ")}. Nell&apos;email restano vuote.</Alert>
              )}
              <div className="rounded-sm border border-grey-60">
                <p className="border-b border-grey-60 px-4 py-2 text-body">
                  <span className="font-semibold">Oggetto:</span> {preview.subject}
                </p>
                <pre className="overflow-x-auto px-4 py-3 font-sans text-body whitespace-pre-wrap">{preview.body}</pre>
              </div>
            </div>
          )}
        </section>

        <section aria-labelledby="modifica-titolo">
          <h2 id="modifica-titolo" className="mb-3 text-h3 font-semibold">
            Nuova versione
          </h2>
          <p className="mb-3 text-caption text-black-60">
            Parte dalla versione attiva ({active.versione}); salvando diventa la nuova versione attiva. I template sono condivisi da
            tutti.
          </p>
          <TemplateForm template={{ ...active, versione: latest.versione }} />
        </section>

        <section aria-labelledby="versioni-titolo" className="rounded-md border border-grey-60 bg-white p-5 shadow-sm sm:p-6">
          <h2 id="versioni-titolo" className="text-h4 font-semibold">
            Versioni
          </h2>
          <ol className="mt-3 flex flex-col divide-y divide-grey-60">
            {versions.map((version) => (
              <li key={version.id} className="py-3 first:pt-0 last:pb-0">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">Versione {version.versione}</span>
                  <span className="text-caption text-black-60">
                    {formatDate(version.creataIl)}
                    {version.autore ? `, ${version.autore}` : ""}
                  </span>
                  {version.corrente && <Badge tone="success">Attiva: usata da Prepara email</Badge>}
                  {version.versione === shown.versione ? (
                    <Badge tone="neutral">Mostrata nell&apos;anteprima</Badge>
                  ) : (
                    <Link href={`${base}?versione=${version.versione}`} className="rounded-xs text-caption font-semibold text-blue-ink underline underline-offset-2">
                      Vedi questa versione
                    </Link>
                  )}
                </p>
                <div className="mt-2">
                  <TemplateVersionControls id={version.id} versione={version.versione} corrente={version.corrente} usata={usage.get(version.id) ?? 0} />
                </div>
                {version.versione === shown.versione && (
                  <div className="mt-2 rounded-sm bg-grey-20 p-3 text-caption">
                    <p>
                      <span className="font-semibold">Oggetto:</span> {version.oggetto}
                    </p>
                    <pre className="mt-1 font-sans whitespace-pre-wrap">{version.corpo}</pre>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  );
}
