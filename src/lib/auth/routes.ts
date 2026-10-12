// Route groups for authentication. Every page is protected unless listed here.

export const SIGN_IN_PATH = "/accedi";
export const HOME_PATH = "/oggi";

// Query parameter read by the sign-in page to show why access was refused.
export const SIGN_IN_ERROR_PARAM = "errore";

export const SIGN_IN_ERRORS = {
  notEnabled: "non-abilitato",
  failed: "accesso-non-riuscito",
  checkFailed: "verifica-non-riuscita",
} as const;

export type SignInError = (typeof SIGN_IN_ERRORS)[keyof typeof SIGN_IN_ERRORS];

// Reachable without a session: sign-in, OAuth callback, health page.
const PUBLIC_PREFIXES = [SIGN_IN_PATH, "/auth", "/stato"];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
