import { NextResponse, type NextRequest } from "next/server";
import {
  HOME_PATH,
  SIGN_IN_ERROR_PARAM,
  SIGN_IN_ERRORS,
  SIGN_IN_PATH,
  type SignInError,
} from "@/lib/auth/routes";
import { createClient } from "@/lib/supabase/server";

// Google OAuth return point: exchanges the code for a session, then sends
// enabled users to "Oggi" and everyone else back to the sign-in page.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return redirectTo(request, SIGN_IN_PATH, SIGN_IN_ERRORS.failed);
  }

  const supabase = await createClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    return redirectTo(request, SIGN_IN_PATH, SIGN_IN_ERRORS.failed);
  }

  const { data: isActive, error } = await supabase.rpc("is_active_user");
  if (error) {
    return redirectTo(request, SIGN_IN_PATH, SIGN_IN_ERRORS.checkFailed);
  }
  if (!isActive) {
    await supabase.auth.signOut({ scope: "local" });
    return redirectTo(request, SIGN_IN_PATH, SIGN_IN_ERRORS.notEnabled);
  }

  return redirectTo(request, HOME_PATH);
}

function redirectTo(request: NextRequest, pathname: string, signInError?: SignInError) {
  const target = new URL(pathname, request.nextUrl.origin);
  if (signInError) target.searchParams.set(SIGN_IN_ERROR_PARAM, signInError);
  return NextResponse.redirect(target);
}
