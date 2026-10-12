import { type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getBatch } from "@/lib/import/queries";

// Error report of an import as CSV (";" separated, UTF-8 with BOM for Excel).
// It holds only sheet, row, party name, outcome and reason.

const UUID = /^[0-9a-f-]{36}$/i;

function csvField(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getCurrentUser())) return new Response("Non autorizzato", { status: 401 });
  const { id } = await params;
  if (!UUID.test(id)) return new Response("Non trovato", { status: 404 });
  const batch = await getBatch(id);
  if (!batch) return new Response("Non trovato", { status: 404 });

  const lines = [
    ["Foglio", "Riga", "Soggetto", "Esito", "Motivo"],
    ...(batch.conteggi.report ?? []).map((row) => [row.foglio, row.riga, row.soggetto, row.esito, row.motivo]),
  ].map((fields) => fields.map(csvField).join(";"));

  const name = `report-import-${batch.created_at.slice(0, 10)}.csv`;
  return new Response(`﻿${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
