import type { Metadata } from "next";
import { PrepareEmail } from "@/components/email/prepare-email";

export const metadata: Metadata = { title: "Prepara email" };

export default async function PrepareEmailPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <PrepareEmail params={await searchParams} />;
}
