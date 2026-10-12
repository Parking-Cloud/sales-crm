import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { SIGN_IN_PATH } from "@/lib/auth/routes";
import { ROLE_LABELS, getCurrentUser } from "@/lib/auth/current-user";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);

  return (
    <AppShell user={{ name: user.name, roleLabel: ROLE_LABELS[user.role] }}>
      {children}
    </AppShell>
  );
}
