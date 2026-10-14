"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { logActivity, moveStage } from "@/app/(app)/pipeline/actions";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { safeCall } from "@/lib/import/safe-call";
import { HANDOFF_STAGE_NOTE, MANUAL_STAGES, STAGES, STAGE_LABELS, opportunityBadge, type Stage } from "@/lib/pipeline/labels";
import type { PipelineItem } from "@/lib/pipeline/queries";
import { ActivityButton } from "./activity-dialog";
import { NextActivity } from "./next-activity";
import { MoveToMenu } from "./stage-controls";

// Kanban (CRM-16): one column per stage of the spec. A card moves with
// native drag and drop or with "Sposta in…" (keyboard). Closed
// opportunities and the handoff stages cannot be moved by hand.
export function PipelineBoard({
  items,
  now,
  actions = { move: moveStage, log: logActivity },
}: {
  items: PipelineItem[];
  now: number;
  // For previews and end-to-end tests only.
  actions?: { move: typeof moveStage; log: typeof logActivity };
}) {
  const router = useRouter();
  const [cards, setCards] = useState(items);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<Stage | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  useEffect(() => setCards(items), [items]);

  function move(id: string, fase: Stage) {
    const card = cards.find((item) => item.id === id);
    if (!card || card.fase === fase) return;
    if (card.esito !== "aperta") return setMessage("Le opportunità chiuse non si spostano: riaprile dalla loro scheda.");
    if (!MANUAL_STAGES.includes(fase)) return setMessage(`"${STAGE_LABELS[fase]}": ${HANDOFF_STAGE_NOTE}`);
    setMessage(null);
    const before = cards;
    setCards((current) => current.map((item) => (item.id === id ? { ...item, fase } : item)));
    startTransition(async () => {
      const result = await safeCall(() => actions.move(id, fase));
      if (!result.ok) {
        setCards(before);
        return setMessage(result.message);
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {message && <Alert tone="warning">{message}</Alert>}
      <p className="text-caption text-black-60">
        Trascina una scheda in un&apos;altra colonna, oppure usa &ldquo;Sposta in…&rdquo; sulla scheda.
      </p>
      <div className="relative -mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        <ol className="grid auto-cols-[minmax(240px,1fr)] grid-flow-col gap-3" aria-label="Fasi della pipeline">
          {STAGES.map((stage) => {
            const column = cards.filter((item) => item.fase === stage);
            const locked = !MANUAL_STAGES.includes(stage);
            return (
              <li
                key={stage}
                aria-labelledby={`colonna-${stage}`}
                onDragOver={(event) => {
                  if (locked || !dragging) return;
                  event.preventDefault();
                  setOver(stage);
                }}
                onDragLeave={() => setOver((current) => (current === stage ? null : current))}
                onDrop={(event) => {
                  event.preventDefault();
                  const id = event.dataTransfer.getData("text/plain");
                  setOver(null);
                  setDragging(null);
                  if (id) move(id, stage);
                }}
                className={`flex min-h-40 flex-col gap-2 rounded-md border p-2 ${
                  over === stage ? "border-brand-blue bg-blue-20" : locked ? "border-grey-60 bg-grey-40" : "border-grey-60 bg-grey-20"
                }`}
              >
                <h2 id={`colonna-${stage}`} className="flex items-center justify-between gap-2 px-1 pt-1 text-[13px] font-semibold tracking-[0.04em] uppercase">
                  <span>{STAGE_LABELS[stage]}</span>
                  <span className="rounded-pill bg-white px-2 tabular-nums text-black-80" aria-label={`${column.length} opportunità`}>
                    {column.length}
                  </span>
                </h2>
                {locked && <p className="px-1 text-caption text-black-60">{HANDOFF_STAGE_NOTE}</p>}
                <ul className="flex flex-col gap-2">
                  {column.map((item) => (
                    <PipelineCard
                      key={item.id}
                      item={item}
                      now={now}
                      dragging={dragging === item.id}
                      onDragStart={() => setDragging(item.id)}
                      onDragEnd={() => {
                        setDragging(null);
                        setOver(null);
                      }}
                      actions={actions}
                    />
                  ))}
                </ul>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function PipelineCard({
  item,
  now,
  dragging,
  onDragStart,
  onDragEnd,
  actions,
}: {
  item: PipelineItem;
  now: number;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  actions: { move: typeof moveStage; log: typeof logActivity };
}) {
  const open = item.esito === "aperta";
  const badge = opportunityBadge(item.fase, item.esito);
  return (
    <li
      draggable={open}
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", item.id);
        event.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={`flex flex-col gap-2 rounded-sm border border-grey-60 bg-white p-3 shadow-sm ${open ? "cursor-grab" : ""} ${dragging ? "opacity-50" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <Link href={`/opportunita/${item.id}`} className="rounded-xs font-semibold break-words text-blue-ink underline-offset-2 hover:underline">
          {item.party}
        </Link>
        {!open && <Badge tone={badge.tone}>{badge.label}</Badge>}
      </div>
      <p className="text-caption text-black-80">
        {item.parking}
        <span className="block">{item.responsabile ? `Responsabile: ${item.responsabile}` : "Senza responsabile"}</span>
      </p>
      {open && <NextActivity item={item} now={now} />}
      {open && (
        <div className="flex flex-col gap-2">
          <MoveToMenu opportunityId={item.id} fase={item.fase} label={item.party} action={actions.move} />
          <ActivityButton
            opportunityId={item.id}
            partyId={item.partyId}
            subject={`${item.party} · ${item.parking}`}
            actions={{ log: actions.log, move: actions.move }}
          />
        </div>
      )}
    </li>
  );
}
