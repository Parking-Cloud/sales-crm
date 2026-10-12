import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AdminOnly } from "@/components/parking/admin-only";
import { ProductForm } from "@/components/parking/product-form";
import { getCurrentUser } from "@/lib/auth/current-user";
import { SIGN_IN_PATH } from "@/lib/auth/routes";
import { getFacility, getProduct } from "@/lib/parking/queries";

export const metadata: Metadata = { title: "Modifica prodotto" };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string; productId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);

  const { id, productId } = await params;
  if (!UUID.test(id) || !UUID.test(productId)) notFound();
  const [facility, product] = await Promise.all([getFacility(id), getProduct(id, productId)]);
  if (!facility || !product) notFound();

  return (
    <>
      <h1 className="mb-1 text-h2 leading-tight font-semibold break-words">Modifica {product.nome}</h1>
      <p className="mb-6 text-body text-black-60">Listino di {facility.nome}</p>
      {user.isAdmin ? (
        <ProductForm parkingId={id} product={product} template={null} />
      ) : (
        <AdminOnly backHref={`/parcheggi/${id}#listino`} />
      )}
    </>
  );
}
