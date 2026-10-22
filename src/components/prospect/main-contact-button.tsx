"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setPrimaryContact } from "@/app/(app)/prospect/table-actions";
import { AlertCircleIcon } from "@/components/ui/icons";
import { safeCall } from "@/lib/import/safe-call";

// "Rendi principale" on the prospect page: the contact shown in the tables.
export function MainContactButton({ contactId, partyId, name }: { contactId: string; partyId: string; name: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <span className="flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pending}
        aria-busy={pending || undefined}
        aria-label={`Rendi principale: ${name}`}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await safeCall(() => setPrimaryContact(contactId, partyId));
            if (!result.ok) return setError(result.message);
            router.refresh();
          })
        }
        className="rounded-xs font-semibold whitespace-nowrap text-blue-ink underline underline-offset-2 disabled:opacity-60"
      >
        {pending ? "..." : "Rendi principale"}
      </button>
      {error && (
        <span role="alert" className="flex items-start gap-1 text-caption text-error-ink">
          <AlertCircleIcon size={14} className="mt-0.5 shrink-0" />
          {error}
        </span>
      )}
    </span>
  );
}
