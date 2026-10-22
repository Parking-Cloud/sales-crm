import { PrepareEmail } from "@/components/email/prepare-email";
import { RouteModal } from "@/components/ui/route-modal";

// "Prepara email" opened from a table (Invio email): the same page as a
// pop-up over the table. A reload of the address shows the full page.
export default async function PrepareEmailModal({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <RouteModal title="Prepara email">
      <PrepareEmail params={await searchParams} popup />
    </RouteModal>
  );
}
