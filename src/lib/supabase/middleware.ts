import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  HOME_PATH,
  SIGN_IN_ERROR_PARAM,
  SIGN_IN_ERRORS,
  SIGN_IN_PATH,
  isPublicPath,
  type SignInError,
} from "@/lib/auth/routes";
import type { Database } from "./types";

// Refreshes the Supabase auth session on every request and protects every
// non-public page:
// - no session: redirect to the sign-in page;
// - session, but the account is not a linked and active CRM user: sign out
//   and show the "not enabled" message on the sign-in page.
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const { pathname } = request.nextUrl;
  const isPublic = isPublicPath(pathname);

  // Without configuration nobody can sign in: keep public pages reachable.
  if (!url || !anonKey) {
    return isPublic ? supabaseResponse : redirectTo(request, supabaseResponse, SIGN_IN_PATH);
  }

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
        Object.entries(headers ?? {}).forEach(([key, value]) =>
          supabaseResponse.headers.set(key, value),
        );
      },
    },
  });

  // Do not run code between createServerClient and getClaims():
  // getClaims() validates the JWT and triggers the token refresh.
  const { data } = await supabase.auth.getClaims();
  const hasSession = Boolean(data?.claims?.sub);

  // The OAuth callback and the health page do their own work.
  if (isPublic && pathname !== SIGN_IN_PATH) {
    return supabaseResponse;
  }

  if (!hasSession) {
    return isPublic ? supabaseResponse : redirectTo(request, supabaseResponse, SIGN_IN_PATH);
  }

  const { data: isActive, error } = await supabase.rpc("is_active_user");

  if (error) {
    // Database not reachable: do not sign out, ask to retry.
    if (pathname === SIGN_IN_PATH) return supabaseResponse;
    return redirectTo(request, supabaseResponse, SIGN_IN_PATH, SIGN_IN_ERRORS.checkFailed);
  }

  if (!isActive) {
    await supabase.auth.signOut({ scope: "local" });
    return redirectTo(request, supabaseResponse, SIGN_IN_PATH, SIGN_IN_ERRORS.notEnabled);
  }

  // Signed in and enabled: the sign-in page has nothing to offer.
  if (pathname === SIGN_IN_PATH) {
    return redirectTo(request, supabaseResponse, HOME_PATH);
  }

  return supabaseResponse;
}

// Redirect that keeps the auth cookies written during this request.
function redirectTo(
  request: NextRequest,
  supabaseResponse: NextResponse,
  pathname: string,
  signInError?: SignInError,
) {
  const target = request.nextUrl.clone();
  target.pathname = pathname;
  target.search = "";
  if (signInError) target.searchParams.set(SIGN_IN_ERROR_PARAM, signInError);

  // Already there with the same message: avoid a redirect loop.
  if (
    request.nextUrl.pathname === target.pathname &&
    request.nextUrl.search === target.search
  ) {
    return supabaseResponse;
  }

  const response = NextResponse.redirect(target);
  supabaseResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
  return response;
}
