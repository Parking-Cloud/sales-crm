import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AdminOnly } from "@/components/parking/admin-only";
import { ProductForm } from "@/components/parking/product-form";
import { getCurrentUser } from "@/lib/auth/current-user";
import { SIGN_IN_PATH } from "@/lib/auth/routes";
import { getFacility } from "@/lib/parking/queries";
import { findTemplate } from "@/lib/parking/templates";

export const metadata: Metadata = { title: "Nuovo prodotto" };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function NewProductPage({
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
  const facility = await getFacility(id);
  if (!facility) notFound();
  const modello = (await searchParams).modello;
  const template = findTemplate(typeof modello === "string" ? modello : undefined) ?? null;

  return (
    <>
      <h1 className="mb-1 text-h2 leading-tight font-semibold">Nuovo prodotto</h1>
      <p className="mb-6 text-body text-black-60">Listino di {facility.nome}</p>
      {user.isAdmin ? (
        <ProductForm parkingId={id} product={null} template={template} />
      ) : (
        <AdminOnly backHref={`/parcheggi/${id}#listino`} />
      )}
    </>
  );
}
