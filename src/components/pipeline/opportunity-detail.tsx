import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { DoNotContactBadge } from "@/components/parties/data-status-badge";
import { formatDay, OfferStatusBadge } from "@/components/prospect/cells";
import { formatDate } from "@/lib/format";
import type { TimelineEntry } from "@/lib/pipeline/history";
import { LOSS_REASON_LABELS } from "@/lib/pipeline/labels";
import type { ContactOption, OpportunityDetail as Detail, ProductOption, UserOption } from "@/lib/pipeline/queries";
import { OpportunityForm } from "./opportunity-form";
import { Timeline } from "./timeline";

function Card({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`${id}-titolo`} className="rounded-md border border-grey-60 bg-white p-5 shadow-sm sm:p-6">
      <h2 id={`${id}-titolo`} className="text-h4 font-semibold">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

// Opportunity page: a prospect on a car park. Since block 1a-9 the work is
// done in the tables (offer status, reminder and note in Pipeline); here are
// people, product, values and history.
export function OpportunityDetail({
  opportunity,
  timeline,
  users,
  contacts,
  products,
}: {
  opportunity: Detail;
  timeline: TimelineEntry[];
  users: UserOption[];
  contacts: ContactOption[];
  products: ProductOption[];
}) {
  const subject = `${opportunity.party} · ${opportunity.parking}`;
  return (
    <>
      <p className="text-caption">
        <Link href="/pipeline" className="rounded-xs text-blue-ink underline underline-offset-2">
          Pipeline
        </Link>
      </p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-h2 leading-tight font-semibold break-words">{subject}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {opportunity.statoOfferta ? (
              <OfferStatusBadge stato={opportunity.statoOfferta} motivo={opportunity.motivoPerdita} />
            ) : (
              <Badge tone="neutral">Non in pipeline</Badge>
            )}
            {opportunity.partyNonContattare && <DoNotContactBadge />}
            <Link href={`/prospect/${opportunity.partyId}`} className="rounded-xs text-body font-semibold text-blue-ink underline underline-offset-2">
              Apri il prospect
            </Link>
            <Link href={`/parcheggi/${opportunity.parkingId}`} className="rounded-xs text-body font-semibold text-blue-ink underline underline-offset-2">
              Apri il parcheggio
            </Link>
          </div>
        </div>
        {!opportunity.partyNonContattare && (
          <ButtonLink
            href={`/email/prepara?soggetto=${opportunity.partyId}&opportunita=${opportunity.id}${opportunity.contactId ? `&contatto=${opportunity.contactId}` : ""}`}
          >
            Prepara email
          </ButtonLink>
        )}
      </div>

      {opportunity.esito === "persa" && !opportunity.statoOfferta && (
        <Alert tone="info" title="Chiusa" className="mt-6">
          Motivo: {opportunity.motivoPerdita ? LOSS_REASON_LABELS[opportunity.motivoPerdita] : "non indicato"}
          {opportunity.prezzoConcorrente !== null && ` · prezzo del concorrente ${String(opportunity.prezzoConcorrente).replace(".", ",")} €`}
          {opportunity.notaPerdita && <span className="mt-1 block whitespace-pre-line">{opportunity.notaPerdita}</span>}
        </Alert>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card id="dati" title="Opportunità">
          <OpportunityForm opportunity={opportunity} users={users} contacts={contacts} products={products} />
        </Card>
        <Card id="pipeline" title="Pipeline">
          {opportunity.statoOfferta ? (
            <dl className="flex flex-col gap-3 text-body">
              <div>
                <dt className="text-label font-semibold tracking-[0.08em] text-black-60 uppercase">Promemoria</dt>
                <dd>{opportunity.promemoria ? formatDay(opportunity.promemoria) : "–"}</dd>
              </div>
              <div>
                <dt className="text-label font-semibold tracking-[0.08em] text-black-60 uppercase">Note</dt>
                <dd className="break-words whitespace-pre-line">{opportunity.note ?? "–"}</dd>
              </div>
              <p className="text-caption text-black-60">Stato dell&apos;offerta, promemoria e note si modificano nella tabella Pipeline.</p>
            </dl>
          ) : (
            <p className="text-body text-black-60">Entra in pipeline quando il prospect diventa Interessato o Molto interessato.</p>
          )}
          <p className="mt-3 text-caption text-black-60">Creata il {formatDate(opportunity.createdAt)}{opportunity.importBatchId ? " da un import Excel" : ""}.</p>
        </Card>
      </div>

      <div className="mt-6">
        <Card id="storico" title="Storico">
          <Timeline entries={timeline} />
        </Card>
      </div>
    </>
  );
}
