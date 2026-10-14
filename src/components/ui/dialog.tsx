"use client";

import { useEffect, useId, useRef } from "react";

// Modal on the native <dialog> for longer content (lists, choices): title,
// scrollable body, actions at the bottom. Escape closes it unless busy.
export function Dialog({
  open,
  title,
  children,
  footer,
  busy = false,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  footer: React.ReactNode;
  busy?: boolean;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-busy={busy || undefined}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[720px] flex-col rounded-lg border border-grey-60 bg-white p-0 text-brand-black shadow-lg backdrop:bg-brand-black/40 open:flex"
    >
      <h2 id={titleId} className="border-b border-grey-60 px-5 py-4 text-h4 font-semibold sm:px-6">
        {title}
      </h2>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">{children}</div>
      <div className="flex flex-col-reverse gap-2 border-t border-grey-60 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">{footer}</div>
    </dialog>
  );
}
