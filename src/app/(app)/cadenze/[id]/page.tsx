import type { Metadata } from "next";
import { FeatureDisabled } from "@/components/feature-disabled";
import { DISABLED_FEATURES } from "@/lib/features";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CadenceEditor } from "@/components/cadences/cadence-editor";
import { StepStrip } from "@/components/cadences/step-strip";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser } from "@/lib/auth/current-user";
import { SIGN_IN_PATH } from "@/lib/auth/routes";
import { getCadence } from "@/lib/cadences/queries";
import { listTemplates } from "@/lib/email/queries";

const UUID = /^[0-9a-f-]{36}$/i;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const cadence = UUID.test(id) ? await getCadence(id) : null;
  return { title: cadence?.nome ?? "Cadenza" };
}

export default async function CadencePage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) redirect(SIGN_IN_PATH);
  if (DISABLED_FEATURES.cadenze) return <FeatureDisabled title="Cadenze" />;
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const [cadence, templates] = await Promise.all([getCadence(id), listTemplates({ onlyActive: true })]);
  if (!cadence) notFound();
  return (
    <>
      <p className="text-caption">
        <Link href="/cadenze" className="rounded-xs text-blue-ink underline underline-offset-2">
          Cadenze
        </Link>
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <h1 className="text-h2 leading-tight font-semibold">{cadence.nome}</h1>
        {cadence.archiviata && <Badge tone="neutral">Archiviata</Badge>}
      </div>
      <div className="mt-3">
        <StepStrip steps={cadence.steps} />
      </div>
      <div className="mt-6">
        <CadenceEditor cadence={cadence} templates={templates.map((template) => ({ famigliaId: template.famigliaId, nome: template.nome }))} />
      </div>
    </>
  );
}
