"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "home" },
  { href: "/launch", label: "launch" },
  { href: "/tokens", label: "tokens" },
  { href: "/agents", label: "agents" },
  { href: "/market", label: "market" },
  { href: "/api", label: "api" },
  { href: "/llm", label: "llm" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="flex flex-wrap gap-1 border-b border-claw-border">
      {TABS.map((t) => {
        const active = path === t.href || (t.href !== "/" && path.startsWith(t.href));
        return (
          <Link key={t.href} href={t.href} className={active ? "tab-active" : "tab"}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
