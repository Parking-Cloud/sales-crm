"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateOpportunity } from "@/app/(app)/pipeline/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { safeCall } from "@/lib/import/safe-call";
import type { ContactOption, OpportunityDetail, ProductOption, UserOption } from "@/lib/pipeline/queries";

const decimal = (value: number | null) => (value === null ? "" : String(value).replace(".", ","));

// Editable fields of an opportunity (B6).
export function OpportunityForm({
  opportunity,
  users,
  contacts,
  products,
}: {
  opportunity: OpportunityDetail;
  users: UserOption[];
  contacts: ContactOption[];
  products: ProductOption[];
}) {
  const router = useRouter();
  const [values, setValues] = useState({
    responsabileId: opportunity.responsabileId ?? "",
    contactId: opportunity.contactId ?? "",
    prodottoId: opportunity.prodottoId ?? "",
    postiRichiesti: opportunity.postiRichiesti === null ? "" : String(opportunity.postiRichiesti),
    valoreMensile: decimal(opportunity.valoreMensile),
  });
  const [message, setMessage] = useState<{ tone: "success" | "critical"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (key: keyof typeof values) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [key]: event.target.value }));

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        setMessage(null);
        startTransition(async () => {
          const result = await safeCall(() => updateOpportunity({ opportunityId: opportunity.id, ...values }));
          if (!result.ok) return setMessage({ tone: "critical", text: result.message });
          setMessage({ tone: "success", text: "Opportunità salvata." });
          router.refresh();
        });
      }}
      className="flex flex-col gap-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="responsabile" label="Responsabile">
          <Select id="responsabile" value={values.responsabileId} onChange={set("responsabileId")}>
            <option value="">Nessuno</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.nome}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="contatto" label="Contatto">
          <Select id="contatto" value={values.contactId} onChange={set("contactId")}>
            <option value="">Nessuno</option>
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.nome}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="prodotto" label="Prodotto di interesse" hint={products.length === 0 ? "Il parcheggio non ha prodotti attivi nel listino." : undefined}>
          <Select id="prodotto" value={values.prodottoId} onChange={set("prodottoId")} hasDescription={products.length === 0}>
            <option value="">Non indicato</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.nome}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field id="posti" label="Posti richiesti">
            <Input id="posti" inputMode="numeric" value={values.postiRichiesti} onChange={set("postiRichiesti")} />
          </Field>
          <Field id="valore" label="Valore mensile stimato (€)">
            <Input id="valore" inputMode="decimal" value={values.valoreMensile} onChange={set("valoreMensile")} />
          </Field>
        </div>
      </div>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <div className="flex justify-end">
        <Button type="submit" size="md" disabled={pending} aria-busy={pending || undefined}>
          {pending ? "Salvataggio..." : "Salva"}
        </Button>
      </div>
    </form>
  );
}
