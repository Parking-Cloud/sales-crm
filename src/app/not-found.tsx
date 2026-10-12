import type { Metadata } from "next";
import Link from "next/link";
import { HOME_PATH } from "@/lib/auth/routes";

export const metadata: Metadata = { title: "Pagina non trovata" };

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-[480px] rounded-md border border-grey-60 bg-white p-8 shadow-md">
        <div className="flex flex-col leading-tight">
          <span className="text-h4 font-semibold text-brand-blue">ParkingCloud</span>
          <span className="text-caption text-black-60">Sales CRM</span>
        </div>
        <p className="mt-8 font-mono text-caption text-black-60">Errore 404</p>
        <h1 className="mt-1 text-h2 font-semibold leading-tight">Pagina non trovata</h1>
        <p className="mt-2 text-body text-black-60">
          L&apos;indirizzo non corrisponde a nessuna pagina del CRM.
        </p>
        <Link
          href={HOME_PATH}
          className="mt-8 inline-flex min-h-(--control-h) items-center rounded-sm bg-brand-blue px-5 text-body font-semibold text-white transition-colors hover:bg-blue-hover active:bg-blue-pressed"
        >
          Torna a Oggi
        </Link>
      </div>
    </main>
  );
}
