import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { SIGN_IN_PATH } from "@/lib/auth/routes";
import { ROLE_LABELS, getCurrentUser } from "@/lib/auth/current-user";
import { countOverdueReminders } from "@/lib/prospect/queries";

export default async function AppLayout({
  children,
  modal,
}: Readonly<{
  children: React.ReactNode;
  // "Prepara email" opened from a table, as a pop-up over it.
  modal: React.ReactNode;
}>) {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  // A failed count must not break every page: no counter instead.
  const overdue = await countOverdueReminders().catch(() => 0);

  return (
    <AppShell
      user={{ name: user.name, roleLabel: ROLE_LABELS[user.role], isAdmin: user.isAdmin }}
      counts={{ "/promemoria": { count: overdue, label: overdue === 1 ? "promemoria scaduto" : "promemoria scaduti" } }}
    >
      {children}
      {modal}
    </AppShell>
  );
}
