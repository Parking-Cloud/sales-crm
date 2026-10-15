import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { SIGN_IN_PATH } from "@/lib/auth/routes";
import { ROLE_LABELS, getCurrentUser } from "@/lib/auth/current-user";
import { countMyOverdue } from "@/lib/pipeline/queries";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);
  // A failed count must not break every page: no counter instead.
  const overdue = await countMyOverdue(user.id, new Date()).catch(() => 0);

  return (
    <AppShell
      user={{ name: user.name, roleLabel: ROLE_LABELS[user.role], isAdmin: user.isAdmin }}
      counts={{ "/oggi": { count: overdue, label: overdue === 1 ? "attività scaduta" : "attività scadute" } }}
    >
      {children}
    </AppShell>
  );
}
