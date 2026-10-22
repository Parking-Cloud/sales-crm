"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, useTransition } from "react";
import { AlertCircleIcon } from "@/components/ui/icons";
import { safeCall, type ActionResult } from "@/lib/import/safe-call";

// Cells edited in place (block 1a-9). The value is shown as a button; a
// click (or Enter) opens the editor. Text and dates are saved on Enter or
// when leaving the cell, a menu on choice; Escape cancels. A failed save
// keeps the old value and shows the error under the cell. After a save the
// page is refreshed, so the other columns follow (the audit records the
// change with its author, in the database).

type Save = (value: string) => Promise<ActionResult<unknown>>;

const VIEW =
  "flex min-h-(--control-h-sm) w-full items-center rounded-xs px-1 -mx-1 text-left hover:bg-grey-40 disabled:cursor-not-allowed disabled:hover:bg-transparent";
const FIELD =
  "h-(--control-h-sm) w-full min-w-32 rounded-xs border border-brand-blue bg-white px-2 text-[14px] text-brand-black disabled:opacity-60";

function CellError({ id, message }: { id: string; message: string }) {
  return (
    <p id={id} role="alert" className="mt-1 flex items-start gap-1 text-caption text-error-ink">
      <AlertCircleIcon size={14} className="mt-0.5 shrink-0" />
      {message}
    </p>
  );
}

function useSave(save: Save) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(value: string, onDone: (ok: boolean) => void) {
    setError(null);
    startTransition(async () => {
      const result = await safeCall(() => save(value));
      if (!result.ok) {
        setError(result.message);
        onDone(false);
        return;
      }
      onDone(true);
      router.refresh();
    });
  }
  return { pending, error, setError, run };
}

// Text, email, telephone or date.
export function EditableText({
  value,
  label,
  onSave,
  type = "text",
  maxLength = 200,
  display,
  disabled = false,
}: {
  value: string | null;
  // What the cell holds, for screen readers ("Telefono di Azienda Esempio").
  label: string;
  onSave: Save;
  type?: "text" | "email" | "tel" | "date";
  maxLength?: number;
  display?: (value: string) => React.ReactNode;
  disabled?: boolean;
}) {
  const [shown, setShown] = useState(value ?? "");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const failed = useRef<string | null>(null);
  const viewRef = useRef<HTMLButtonElement>(null);
  const errorId = useId();
  const { pending, error, setError, run } = useSave(onSave);

  // Follow the server value after a refresh (unless the cell is in use).
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    if (!editing) setShown(value ?? "");
  }

  function open() {
    setDraft(shown);
    failed.current = null;
    setEditing(true);
  }

  function close(focus = true) {
    setEditing(false);
    if (focus) requestAnimationFrame(() => viewRef.current?.focus());
  }

  function commit(focus = true) {
    const next = draft.trim();
    if (next === shown.trim() || next === failed.current) return close(focus);
    run(next, (ok) => {
      if (ok) {
        setShown(next);
        close(focus);
      } else {
        failed.current = next;
      }
    });
  }

  if (editing) {
    return (
      <div>
        <input
          autoFocus
          type={type}
          value={draft}
          maxLength={type === "date" ? undefined : maxLength}
          inputMode={type === "tel" ? "tel" : type === "email" ? "email" : undefined}
          aria-label={label}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          disabled={pending}
          aria-busy={pending || undefined}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            } else if (event.key === "Escape") {
              event.preventDefault();
              setError(null);
              close();
            }
          }}
          onBlur={() => {
            if (!pending) commit(false);
          }}
          className={FIELD}
        />
        {pending && <p className="mt-1 text-caption text-black-60">Salvataggio...</p>}
        {error && <CellError id={errorId} message={error} />}
      </div>
    );
  }

  return (
    <div>
      <button
        ref={viewRef}
        type="button"
        onClick={open}
        disabled={disabled}
        aria-label={`${label}: ${shown || "vuoto"}. Modifica`}
        aria-describedby={error ? errorId : undefined}
        className={VIEW}
      >
        {shown ? (display ? display(shown) : <span className="break-words">{shown}</span>) : <span className="text-black-40">–</span>}
      </button>
      {error && <CellError id={errorId} message={error} />}
    </div>
  );
}

export type Choice = { value: string; label: string };

// A menu (statuses, owner, category). When `reason` applies to the chosen
// value, a small menu asks for the optional reason before saving.
export function EditableSelect({
  value,
  label,
  options,
  onSave,
  display,
  emptyLabel,
  reason,
  disabled = false,
}: {
  value: string | null;
  label: string;
  options: Choice[];
  // value and, for choices that take one, the reason ("" = none).
  onSave: (value: string, reason: string) => Promise<ActionResult<unknown>>;
  display: (value: string | null) => React.ReactNode;
  // Offers "no value" with this label.
  emptyLabel?: string;
  reason?: { for: string[]; label: string; options: Choice[] };
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [asking, setAsking] = useState<string | null>(null);
  const [why, setWhy] = useState("");
  const viewRef = useRef<HTMLButtonElement>(null);
  const errorId = useId();
  const reasonId = useId();
  const { pending, error, setError, run } = useSave((next) => {
    const [choice, motive] = next.split("|");
    return onSave(choice, motive ?? "");
  });

  function close() {
    setEditing(false);
    setAsking(null);
    setWhy("");
    requestAnimationFrame(() => viewRef.current?.focus());
  }

  function choose(next: string) {
    if (reason?.for.includes(next)) {
      setAsking(next);
      return;
    }
    if (next === (value ?? "")) return close();
    run(`${next}|`, (ok) => ok && close());
  }

  if (asking !== null && reason) {
    return (
      <div className="flex min-w-56 flex-col gap-2 rounded-sm border border-grey-60 bg-white p-2 shadow-md" role="group" aria-label={`${label}: ${reason.label}`}>
        <label htmlFor={reasonId} className="text-label font-semibold tracking-[0.08em] text-black-80 uppercase">
          {reason.label}
        </label>
        <select
          id={reasonId}
          autoFocus
          value={why}
          disabled={pending}
          onChange={(event) => setWhy(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setError(null);
              close();
            }
          }}
          className={FIELD}
        >
          <option value="">Nessun motivo</option>
          {reason.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending}
            aria-busy={pending || undefined}
            onClick={() => run(`${asking}|${why}`, (ok) => ok && close())}
            className="inline-flex min-h-(--control-h-sm) items-center rounded-xs border border-brand-blue bg-brand-blue px-3 text-[13px] font-semibold text-white hover:bg-blue-hover disabled:opacity-60"
          >
            {pending ? "Salvataggio..." : "Conferma"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setError(null);
              close();
            }}
            className="inline-flex min-h-(--control-h-sm) items-center rounded-xs border border-brand-blue bg-white px-3 text-[13px] font-semibold text-brand-blue hover:bg-blue-20"
          >
            Annulla
          </button>
        </div>
        {error && <CellError id={errorId} message={error} />}
      </div>
    );
  }

  if (editing) {
    return (
      <div>
        <select
          autoFocus
          aria-label={label}
          defaultValue={value ?? ""}
          disabled={pending}
          aria-busy={pending || undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(event) => choose(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setError(null);
              close();
            }
          }}
          onBlur={() => {
            if (!pending && asking === null) setEditing(false);
          }}
          className={FIELD}
        >
          {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
          {value === null && emptyLabel === undefined && <option value="">Scegli…</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {pending && <p className="mt-1 text-caption text-black-60">Salvataggio...</p>}
        {error && <CellError id={errorId} message={error} />}
      </div>
    );
  }

  return (
    <div>
      <button
        ref={viewRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          setError(null);
          setEditing(true);
        }}
        aria-label={`${label}: ${options.find((option) => option.value === value)?.label ?? emptyLabel ?? "vuoto"}. Modifica`}
        aria-describedby={error ? errorId : undefined}
        className={VIEW}
      >
        {display(value)}
      </button>
      {error && <CellError id={errorId} message={error} />}
    </div>
  );
}
