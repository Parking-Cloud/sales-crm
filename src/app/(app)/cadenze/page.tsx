import type { Metadata } from "next";
import { FeatureDisabled } from "@/components/feature-disabled";
import { DISABLED_FEATURES } from "@/lib/features";
import Link from "next/link";
import { redirect } from "next/navigation";
import { NewCadenceForm } from "@/components/cadences/new-cadence-form";
import { StepStrip } from "@/components/cadences/step-strip";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentUser } from "@/lib/auth/current-user";
import { SIGN_IN_PATH } from "@/lib/auth/routes";
import { listCadences, type Cadence } from "@/lib/cadences/queries";

export const metadata: Metadata = { title: "Cadenze" };

const STAT_LABELS: [keyof Cadence["stats"], string][] = [
  ["attivi", "Attivi"],
  ["inPausa", "In pausa"],
  ["fermati", "Fermati"],
  ["risposto", "Risposto"],
  ["convertiti", "Convertiti"],
  ["completati", "Completati"],
];

// Light cadences (B2): steps in a row and statistics; nothing is sent
// automatically, every step is a reminder in "Oggi".
export default async function CadencesPage({ searchParams }: { searchParams: Promise<{ archiviate?: string }> }) {
  if (!(await getCurrentUser())) redirect(SIGN_IN_PATH);
  if (DISABLED_FEATURES.cadenze) return <FeatureDisabled title="Cadenze" />;
  const { archiviate } = await searchParams;
  const showArchived = archiviate === "1";
  const cadences = await listCadences({ withArchived: showArchived });
  return (
    <>
      <h1 className="text-h2 leading-tight font-semibold">Cadenze</h1>
      <p className="mt-2 max-w-3xl text-body text-black-60">
        Sequenze di chiamate, email e attività. Niente parte da solo: ogni passo diventa un promemoria in &ldquo;Oggi&rdquo; per il
        responsabile, e le email si aprono in Gmail una alla volta.
      </p>
      <div className="mt-6 rounded-md border border-grey-60 bg-white p-4">
        <NewCadenceForm />
      </div>
      <p className="mt-4 text-caption">
        <Link href={showArchived ? "/cadenze" : "/cadenze?archiviate=1"} className="rounded-xs font-semibold text-blue-ink underline underline-offset-2">
          {showArchived ? "Nascondi le archiviate" : "Mostra anche le archiviate"}
        </Link>
      </p>
      <div className="mt-4 flex flex-col gap-4">
        {cadences.length === 0 ? (
          <EmptyState title="Nessuna cadenza">Crea la prima con il nome qui sopra.</EmptyState>
        ) : (
          cadences.map((cadence) => (
            <section key={cadence.id} aria-labelledby={`cadenza-${cadence.id}`} className="rounded-md border border-grey-60 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id={`cadenza-${cadence.id}`} className="text-h4 font-semibold">
                  <Link href={`/cadenze/${cadence.id}`} className="rounded-xs text-blue-ink underline-offset-2 hover:underline">
                    {cadence.nome}
                  </Link>
                </h2>
                {cadence.archiviata && <Badge tone="neutral">Archiviata</Badge>}
              </div>
              {cadence.descrizione && <p className="mt-1 text-body text-black-80">{cadence.descrizione}</p>}
              <div className="mt-3">
                <StepStrip steps={cadence.steps} />
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                {STAT_LABELS.map(([key, label]) => (
                  <div key={key} className="rounded-sm bg-grey-20 px-3 py-2">
                    <dt className="text-label font-semibold tracking-[0.08em] text-black-60 uppercase">{label}</dt>
                    <dd className="text-h4 font-semibold tabular-nums">{cadence.stats[key]}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-2 text-caption text-black-60">Creata da {cadence.autore ?? "–"}.</p>
            </section>
          ))
        )}
      </div>
    </>
  );
}
