"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOut } from "@/app/auth/actions";
import { NAV_ITEMS } from "./nav-items";

export type ShellUser = {
  name: string;
  roleLabel: string;
  isAdmin: boolean;
};

function Brand() {
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-h4 font-semibold text-brand-blue">ParkingCloud</span>
      <span className="text-caption text-black-60">Sales CRM</span>
    </div>
  );
}

// Counters next to menu entries, by href (e.g. overdue reminders on "Promemoria").
export type NavCounts = Record<string, { count: number; label: string }>;

function NavList({ counts, isAdmin, onNavigate }: { counts: NavCounts; isAdmin: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <ul className="flex flex-col gap-1">
      {NAV_ITEMS.filter((item) => isAdmin || !item.adminOnly).map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={[
                "flex min-h-(--control-h) items-center rounded-sm border-l-4 px-3 text-body transition-colors",
                active
                  ? "border-brand-blue bg-blue-20 font-semibold text-blue-ink"
                  : "border-transparent text-black-80 hover:bg-grey-40",
              ].join(" ")}
            >
              <span className="flex-1">{item.label}</span>
              {counts[item.href] && counts[item.href].count > 0 && (
                <span className="ml-2 rounded-pill bg-error-ink px-2 text-caption font-semibold text-white tabular-nums">
                  {counts[item.href].count}
                  <span className="sr-only"> {counts[item.href].label}</span>
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// Signed-in user and sign-out, at the bottom of the sidebar.
function UserPanel({ user }: { user: ShellUser }) {
  return (
    <div className="border-t border-grey-60 px-3 py-4">
      <p className="truncate px-3 text-body font-semibold text-brand-black">{user.name}</p>
      <p className="px-3 text-caption text-black-60">{user.roleLabel}</p>
      <form action={signOut} className="mt-2">
        <button
          type="submit"
          className="flex min-h-(--control-h) w-full items-center rounded-sm px-3 text-body font-medium text-black-80 hover:bg-grey-40"
        >
          Esci
        </button>
      </form>
    </div>
  );
}

export function AppShell({
  children,
  user,
  counts = {},
}: {
  children: React.ReactNode;
  user: ShellUser;
  counts?: NavCounts;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const openButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);

  // Move focus into the drawer on open and back to the toggle on close.
  useEffect(() => {
    if (menuOpen) {
      closeButtonRef.current?.focus();
    } else if (wasOpen.current) {
      openButtonRef.current?.focus();
    }
    wasOpen.current = menuOpen;
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        return;
      }
      // Keep Tab focus inside the open drawer.
      if (event.key === "Tab" && drawerRef.current) {
        const focusable = drawerRef.current.querySelectorAll<HTMLElement>(
          "a[href], button:not([disabled])",
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  return (
    <div className="min-h-dvh lg:flex">
      <a
        href="#contenuto"
        className="sr-only z-50 rounded-sm bg-white px-4 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Vai al contenuto
      </a>

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-(--sidebar) shrink-0 flex-col border-r border-grey-60 bg-white lg:flex">
        <div className="flex h-(--topbar) items-center px-5">
          <Brand />
        </div>
        <nav aria-label="Navigazione principale" className="flex-1 overflow-y-auto px-3 py-4">
          <NavList counts={counts} isAdmin={user.isAdmin} />
        </nav>
        <UserPanel user={user} />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex h-(--topbar) items-center justify-between border-b border-grey-60 bg-white px-4 lg:hidden">
        <Brand />
        <button
          ref={openButtonRef}
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-expanded={menuOpen}
          aria-controls="menu-mobile"
          className="flex min-h-(--control-h) items-center gap-2 rounded-sm border border-grey-80 px-3 text-body font-medium text-brand-black hover:bg-grey-40"
        >
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Menu
        </button>
      </header>

      {/* Mobile drawer */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-brand-black/40"
            aria-hidden="true"
            onClick={() => setMenuOpen(false)}
          />
          <div
            ref={drawerRef}
            id="menu-mobile"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="absolute inset-y-0 left-0 flex w-(--sidebar) max-w-[85vw] flex-col bg-white shadow-lg"
          >
            <div className="flex h-(--topbar) items-center justify-between border-b border-grey-60 px-4">
              <Brand />
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setMenuOpen(false)}
                className="flex min-h-(--control-h) items-center rounded-sm px-3 text-body font-medium text-brand-black hover:bg-grey-40"
              >
                Chiudi
              </button>
            </div>
            <nav aria-label="Navigazione principale" className="flex-1 overflow-y-auto px-3 py-4">
              <NavList counts={counts} isAdmin={user.isAdmin} onNavigate={() => setMenuOpen(false)} />
            </nav>
            <UserPanel user={user} />
          </div>
        </div>
      )}

      <main id="contenuto" className="min-w-0 flex-1 px-4 py-6 lg:px-8 lg:py-8">
        <div className="mx-auto max-w-page">{children}</div>
      </main>
    </div>
  );
}
