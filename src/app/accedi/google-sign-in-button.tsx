"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Google Workspace domain hint: Google shows only accounts of this domain.
// Access is still decided by the CRM users list, not by this hint.
const WORKSPACE_DOMAIN = "parkingcloud.eu";

export function GoogleSignInButton() {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signIn() {
    setPending(true);
    setFailed(false);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        // Same origin as the page: works on localhost, staging and Netlify previews.
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { hd: WORKSPACE_DOMAIN },
      },
    });
    // On success the browser is already leaving the page.
    if (error) {
      setPending(false);
      setFailed(true);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={signIn}
        disabled={pending}
        aria-disabled={pending}
        className="flex min-h-(--control-h) w-full items-center justify-center rounded-sm bg-brand-blue px-5 text-body font-semibold text-white transition-colors hover:bg-blue-hover active:bg-blue-pressed disabled:cursor-wait disabled:bg-blue-80"
      >
        {pending ? "Apertura di Google..." : "Accedi con Google"}
      </button>
      {failed && (
        <p role="alert" className="mt-3 text-caption text-error-ink">
          Non è stato possibile aprire l&apos;accesso con Google. Riprova.
        </p>
      )}
    </>
  );
}
