import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";

export default function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-14 shrink-0 items-center gap-8 border-b bg-panel px-6">
        <span className="text-xl font-semibold">GhostWriter</span>
        <nav aria-label="Main" className="flex flex-1 items-center gap-6">
          <TopLink href="/" current={location === "/"}>
            Resume
          </TopLink>
          <TopLink href="/applications" current={location.startsWith("/applications") || location === "/new"}>
            Applications
          </TopLink>
          <span className="ml-auto">
            <TopLink href="/profile" current={location.startsWith("/profile")}>
              Profile
            </TopLink>
          </span>
        </nav>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}

function TopLink({ href, current, children }: { href: string; current: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={cn("flex h-14 items-center border-b-2 pt-0.5", current ? "border-signal font-semibold" : "border-transparent hover:border-trace")}
    >
      {children}
    </Link>
  );
}
