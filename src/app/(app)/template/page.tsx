import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { getCurrentUser } from "@/lib/auth/current-user";
import { SIGN_IN_PATH } from "@/lib/auth/routes";
import { listTemplates } from "@/lib/email/queries";
import { TEMPLATE_USE_LABELS } from "@/lib/email/template";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Template email" };

// Templates (CRM-21): administrators only.
export default async function TemplatesPage() {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  if (!user.isAdmin) redirect("/oggi");
  const templates = await listTemplates();
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-h2 leading-tight font-semibold">Template email</h1>
          <p className="mt-2 max-w-3xl text-body text-black-60">
            Testi con variabili per &ldquo;Prepara email&rdquo;, condivisi da tutti. Ogni salvataggio crea una nuova versione, che
            diventa quella attiva; le precedenti restano consultabili.
          </p>
        </div>
        <ButtonLink href="/template/nuovo" variant="primary" size="md">
          Nuovo template
        </ButtonLink>
      </div>
      <div className="mt-6">
        {templates.length === 0 ? (
          <EmptyState title="Nessun template">Crea il primo con &ldquo;Nuovo template&rdquo;.</EmptyState>
        ) : (
          <Table caption="Template email">
            <thead>
              <tr>
                <Th>Nome</Th>
                <Th>Uso</Th>
                <Th>Oggetto</Th>
                <Th>Versione attiva</Th>
                <Th>Ultima modifica</Th>
                <Th>Stato</Th>
              </tr>
            </thead>
            <tbody>
              {templates.map((template) => (
                <Tr key={template.famigliaId}>
                  <Td wrap>
                    <Link href={`/template/${template.famigliaId}`} className="rounded-xs font-semibold text-blue-ink underline-offset-2 hover:underline">
                      {template.nome}
                    </Link>
                  </Td>
                  <Td>{TEMPLATE_USE_LABELS[template.uso]}</Td>
                  <Td wrap>{template.oggetto}</Td>
                  <Td>
                    {template.versione} di {template.versioni}
                  </Td>
                  <Td wrap>
                    {formatDate(template.ultimaModificaIl)}
                    <span className="block text-caption text-black-60">{template.ultimaModificaDa ?? "–"}</span>
                  </Td>
                  <Td>{template.attivo ? <Badge tone="success">In uso</Badge> : <Badge tone="neutral">Disattivato</Badge>}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </>
  );
}
