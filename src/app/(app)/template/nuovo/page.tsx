import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TemplateForm } from "@/components/email/template-form";
import { getCurrentUser } from "@/lib/auth/current-user";
import { SIGN_IN_PATH } from "@/lib/auth/routes";

export const metadata: Metadata = { title: "Nuovo template" };

export default async function NewTemplatePage() {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  if (!user.isAdmin) redirect("/oggi");
  return (
    <>
      <p className="text-caption">
        <Link href="/template" className="rounded-xs text-blue-ink underline underline-offset-2">
          Template email
        </Link>
      </p>
      <h1 className="mt-2 mb-6 text-h2 leading-tight font-semibold">Nuovo template</h1>
      <TemplateForm template={null} />
    </>
  );
}
