"use client";

import { useEffect, useId, useRef } from "react";
import { Button, type ButtonVariant } from "./button";

// Confirmation dialog on the native <dialog>: modal, focus kept inside,
// Escape closes it, focus goes back to the trigger on close.
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = "Annulla",
  confirmVariant = "primary",
  pending = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  confirmVariant?: ButtonVariant;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const textId = useId();

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
      aria-describedby={children ? textId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onCancel();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-[480px] rounded-lg border border-grey-60 bg-white p-6 text-brand-black shadow-lg backdrop:bg-brand-black/40"
    >
      <h2 id={titleId} className="text-h4 font-semibold">
        {title}
      </h2>
      {children && (
        <div id={textId} className="mt-2 text-body text-black-80">
          {children}
        </div>
      )}
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" size="md" onClick={onCancel} disabled={pending}>
          {cancelLabel}
        </Button>
        <Button variant={confirmVariant} size="md" onClick={onConfirm} disabled={pending} aria-busy={pending || undefined}>
          {pending ? "Attendi..." : confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
