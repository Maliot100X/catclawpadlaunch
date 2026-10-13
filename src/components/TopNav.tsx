"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletBar } from "./WalletBar";
import { FaucetButton } from "./FaucetButton";
import { LoginBox } from "./LoginBox";

const TABS = [
  { href: "/forge", label: "FORGE" },
  { href: "/radar", label: "TREND RADAR" },
  { href: "/coins", label: "LAUNCHED" },
  { href: "/agents", label: "AGENTS" },
  { href: "/community", label: "COMMUNITY" },
  { href: "/3d", label: "3D FORGE" },
  { href: "/leaderboard", label: "LEADERBOARD" },
  { href: "/docs", label: "DOCS" },
  { href: "/login", label: "LOGIN" },
  { href: "/trade", label: "TRADE" },
  { href: "/tokenomics", label: "TOKENOMICS" },
];

export function TopNav() {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  // close the panel whenever the route changes
  useEffect(() => { setOpen(false); }, [path]);

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[oklab(0.13_0.002_-0.018_/_0.9)] backdrop-blur-md">
      <div className="shell flex h-14 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Link href="/" className="pixel mr-1 text-[10px] sm:text-[11px] tracking-tight shrink-0">
            CLAWPAD.wtf
          </Link>
          {/* desktop tabs */}
          <nav className="hidden lg:flex min-w-0 items-center overflow-x-auto">
            {TABS.map((t) => {
              const on = path === t.href || path.startsWith(t.href + "/");
              return (
                <Link key={t.href} href={t.href} className={on ? "nav-a nav-a-on" : "nav-a"}>
                  {t.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden xl:inline mono text-[10px] uppercase text-[var(--muted)]">devnet</span>
          <FaucetButton />
          <LoginBox />
          <WalletBar />
          {/* mobile / tablet menu button */}
          <button
            type="button"
            aria-expanded={open}
            aria-controls="nav-panel"
            aria-label={open ? "hide menu" : "show menu"}
            onClick={() => setOpen((v) => !v)}
            className="lg:hidden mono text-[13px] leading-none border border-[var(--line)] px-3 py-2 text-[var(--lime)]"
          >
            {open ? "✕" : "☰"}
          </button>
        </div>
      </div>

      {/* mobile / tablet tab box — shown and hidden on demand */}
      {open && (
        <div id="nav-panel" className="lg:hidden border-t border-[var(--line)] bg-[oklab(0.11_0.002_-0.018_/_0.98)]">
          <nav className="shell grid grid-cols-2 sm:grid-cols-3 gap-2 py-3">
            {TABS.map((t) => {
              const on = path === t.href || path.startsWith(t.href + "/");
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  onClick={() => setOpen(false)}
                  className={`mono text-[11px] tracking-wide border px-3 py-3 text-center ${
                    on
                      ? "border-[var(--lime)] text-[var(--lime)] bg-[oklab(0.18_0.02_-0.03_/_0.6)]"
                      : "border-[var(--line)] text-[var(--fg)]"
                  }`}
                >
                  {t.label}
                </Link>
              );
            })}
          </nav>
        </div>
      )}
    </header>
  );
}
