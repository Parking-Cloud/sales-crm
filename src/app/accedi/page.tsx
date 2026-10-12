import type { Metadata } from "next";
import {
  SIGN_IN_ERROR_PARAM,
  SIGN_IN_ERRORS,
  type SignInError,
} from "@/lib/auth/routes";
import { GoogleSignInButton } from "./google-sign-in-button";

export const metadata: Metadata = { title: "Accedi" };

const ERROR_MESSAGES: Record<SignInError, string> = {
  [SIGN_IN_ERRORS.notEnabled]: "Questo account non è abilitato. Chiedi all'amministratore.",
  [SIGN_IN_ERRORS.failed]: "Accesso non riuscito. Riprova.",
  [SIGN_IN_ERRORS.checkFailed]:
    "Non è stato possibile verificare il tuo account. Riprova tra qualche minuto.",
};

function isSignInError(value: unknown): value is SignInError {
  return typeof value === "string" && value in ERROR_MESSAGES;
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const errorCode = params[SIGN_IN_ERROR_PARAM];
  const message = isSignInError(errorCode) ? ERROR_MESSAGES[errorCode] : null;

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-[420px] rounded-md border border-grey-60 bg-white p-8 shadow-md">
        <div className="flex flex-col leading-tight">
          <span className="text-h4 font-semibold text-brand-blue">ParkingCloud</span>
          <span className="text-caption text-black-60">Sales CRM</span>
        </div>

        <h1 className="mt-8 text-h2 font-semibold leading-tight">Accedi</h1>
        <p className="mt-2 text-body text-black-60">
          Usa il tuo account Google aziendale.
        </p>

        {message && (
          <div
            role="alert"
            className="mt-6 flex gap-3 rounded-sm border border-error-line bg-error-surface p-4 text-body text-error-ink"
          >
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" className="mt-0.5 shrink-0">
              <circle cx="10" cy="10" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="M10 5.5v5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <circle cx="10" cy="14.25" r="1.25" fill="currentColor" />
            </svg>
            <p>{message}</p>
          </div>
        )}

        <div className="mt-8">
          <GoogleSignInButton />
        </div>
      </div>
    </main>
  );
}
