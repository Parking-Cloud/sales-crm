import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { MergeForm, type MergeCounts } from "@/components/parties/merge-form";
import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { getCurrentUser } from "@/lib/auth/current-user";
import { SIGN_IN_PATH } from "@/lib/auth/routes";
import { partyName } from "@/lib/parties/labels";
import { getParty, listContacts, listLocations, searchParties } from "@/lib/parties/queries";

export const metadata: Metadata = { title: "Unisci prospect" };

const UUID = /^[0-9a-f-]{36}$/i;

async function counts(ids: string[]): Promise<Record<string, MergeCounts>> {
  const entries = await Promise.all(
    ids.map(async (id) => {
      const [locations, contacts] = await Promise.all([listLocations(id), listContacts(id)]);
      return [id, { sedi: locations.length, contatti: contacts.length }] as const;
    }),
  );
  return Object.fromEntries(entries);
}

export default async function MergePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const party = await getParty(id);
  if (!party) notFound();
  if (party.merged_into_id) redirect(`/prospect/${party.merged_into_id}`);

  const header = (
    <>
      <h1 className="mb-1 text-h2 leading-tight font-semibold">Unisci prospect</h1>
      <p className="mb-6 text-body text-black-60">{partyName(party)}</p>
    </>
  );

  if (!user.isAdmin) {
    return (
      <>
        {header}
        <Alert tone="info" title="Solo l'amministratore">
          Due prospect doppi li unisce l&apos;amministratore. Segnalaglielo.
        </Alert>
        <div className="mt-4">
          <ButtonLink href={`/prospect/${id}`}>Torna al prospect</ButtonLink>
        </div>
      </>
    );
  }

  const query = await searchParams;
  const otherId = typeof query.con === "string" && UUID.test(query.con) ? query.con : null;
  const other = otherId && otherId !== id ? await getParty(otherId) : null;

  if (other && !other.merged_into_id) {
    return (
      <>
        {header}
        <MergeForm a={party} b={other} counts={await counts([party.id, other.id])} />
      </>
    );
  }

  const q = typeof query.q === "string" ? query.q.trim().slice(0, 120) : "";
  const results = q
    ? (await searchParties({ q, tipo: null, categoria: null, citta: "", soloDaVerificare: false, parcheggi: [], senzaParcheggio: false, ordina: null, page: 1 })).items.filter(
        (item) => item.id !== id,
      )
    : [];

  return (
    <>
      {header}
      <form method="get" role="search" className="flex flex-wrap items-end gap-3 rounded-md border border-grey-60 bg-white p-4">
        <div className="w-full sm:w-96">
          <Field id="q" label="Cerca il doppione" hint="Nome, P.IVA, telefono o sito.">
            <Input id="q" name="q" type="search" defaultValue={q} autoComplete="off" hasDescription />
          </Field>
        </div>
        <Button type="submit" size="md">
          Cerca
        </Button>
      </form>
      {q && (
        <ul className="mt-4 flex flex-col divide-y divide-grey-60 rounded-md border border-grey-60 bg-white">
          {results.length === 0 && <li className="p-4 text-body text-black-60">Nessun prospect trovato.</li>}
          {results.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <span>
                <span className="font-semibold">{partyName(item)}</span>
                <span className="block text-caption text-black-60">{[item.citta, item.telefono].filter(Boolean).join(" · ") || "–"}</span>
              </span>
              <Link
                href={`/prospect/${id}/unisci?con=${item.id}`}
                className="rounded-xs font-semibold text-blue-ink underline underline-offset-2"
              >
                Confronta e unisci<span className="sr-only"> {partyName(item)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
