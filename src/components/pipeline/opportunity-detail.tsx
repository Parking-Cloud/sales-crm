import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { DoNotContactBadge } from "@/components/parties/data-status-badge";
import { formatDate } from "@/lib/format";
import type { TimelineEntry } from "@/lib/pipeline/history";
import { LOSS_REASON_LABELS, opportunityBadge } from "@/lib/pipeline/labels";
import type { ContactOption, OpportunityDetail as Detail, ProductOption, UserOption } from "@/lib/pipeline/queries";
import { ActivityButton } from "./activity-dialog";
import { NextActivity } from "./next-activity";
import { OpportunityForm } from "./opportunity-form";
import { CloseLostButton, ReopenButton, StageSelect } from "./stage-controls";
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

// Opportunity page (B6): stage, outcome, people, product, values, next
// activity and history.
export function OpportunityDetail({
  opportunity,
  timeline,
  users,
  contacts,
  products,
  now,
}: {
  opportunity: Detail;
  timeline: TimelineEntry[];
  users: UserOption[];
  contacts: ContactOption[];
  products: ProductOption[];
  now: number;
}) {
  const badge = opportunityBadge(opportunity.fase, opportunity.esito);
  const open = opportunity.esito === "aperta";
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
            <Badge tone={badge.tone}>{badge.label}</Badge>
            {opportunity.partyNonContattare && <DoNotContactBadge />}
            <Link href={`/soggetti/${opportunity.partyId}`} className="rounded-xs text-body font-semibold text-blue-ink underline underline-offset-2">
              Apri il soggetto
            </Link>
            <Link href={`/parcheggi/${opportunity.parkingId}`} className="rounded-xs text-body font-semibold text-blue-ink underline underline-offset-2">
              Apri il parcheggio
            </Link>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {open && <ActivityButton opportunityId={opportunity.id} partyId={opportunity.partyId} subject={subject} variant="primary" size="md" />}
          {!opportunity.partyNonContattare && (
            <ButtonLink
              href={`/email/prepara?soggetto=${opportunity.partyId}&opportunita=${opportunity.id}${opportunity.contactId ? `&contatto=${opportunity.contactId}` : ""}`}
            >
              Prepara email
            </ButtonLink>
          )}
          {open ? <CloseLostButton opportunityId={opportunity.id} subject={subject} /> : <ReopenButton opportunityId={opportunity.id} fase={opportunity.fase} />}
        </div>
      </div>

      {opportunity.esito === "persa" && (
        <Alert tone="info" title="Chiusa come persa" className="mt-6">
          Motivo: {opportunity.motivoPerdita ? LOSS_REASON_LABELS[opportunity.motivoPerdita] : "non indicato"}
          {opportunity.prezzoConcorrente !== null && ` · prezzo del concorrente ${String(opportunity.prezzoConcorrente).replace(".", ",")} €`}
          {opportunity.notaPerdita && <span className="mt-1 block whitespace-pre-line">{opportunity.notaPerdita}</span>}
        </Alert>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <Card id="dati" title="Opportunità">
          <div className="flex flex-col gap-4">
            {open && <StageSelect opportunityId={opportunity.id} fase={opportunity.fase} />}
            <OpportunityForm opportunity={opportunity} users={users} contacts={contacts} products={products} />
          </div>
        </Card>
        <Card id="prossima" title="Prossima attività">
          {open ? (
            <NextActivity item={{ prossimaIl: opportunity.prossimaIl, next: null }} now={now} />
          ) : (
            <p className="text-body text-black-60">Opportunità chiusa.</p>
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
