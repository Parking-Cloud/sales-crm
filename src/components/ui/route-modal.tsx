"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef } from "react";

// A page shown as a pop-up over the current one (intercepted route, block
// 1a-9): native <dialog>, title and "Chiudi"; closing goes back to the page
// underneath. Escape closes it.
export function RouteModal({ title, children }: { title: string; children: React.ReactNode }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        router.back();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-1rem)] max-w-[1100px] flex-col rounded-lg border border-grey-60 bg-grey-20 p-0 text-brand-black shadow-lg backdrop:bg-brand-black/40 open:flex sm:w-[calc(100%-2rem)]"
    >
      <div className="flex items-center justify-between gap-4 border-b border-grey-60 bg-white px-4 py-3 sm:px-6">
        <h2 id={titleId} className="text-h4 font-semibold">
          {title}
        </h2>
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex min-h-(--control-h) items-center rounded-sm border border-brand-blue bg-white px-3 text-[14px] font-semibold text-brand-blue hover:bg-blue-20 md:min-h-(--control-h-sm)"
        >
          Chiudi
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">{children}</div>
    </dialog>
  );
}
