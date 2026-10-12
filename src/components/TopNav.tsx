"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletBar } from "./WalletBar";
import { FaucetButton } from "./FaucetButton";

const TABS = [
  { href: "/forge", label: "FORGE" },
  { href: "/radar", label: "TREND RADAR" },
  { href: "/coins", label: "LAUNCHED" },
  { href: "/trade", label: "TRADE" },
  { href: "/tokenomics", label: "TOKENOMICS" },
];

export function TopNav() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[oklab(0.13_0.002_-0.018_/_0.9)] backdrop-blur-md">
      <div className="shell flex h-14 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1 sm:gap-2">
          <Link href="/" className="pixel mr-2 text-[10px] sm:text-[11px] tracking-tight shrink-0">
            CLAWPAD.wtf
          </Link>
          <nav className="flex min-w-0 items-center overflow-x-auto">
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
          <span className="hidden lg:inline mono text-[10px] uppercase text-[var(--muted)]">devnet</span>
          <FaucetButton />
          <WalletBar />
        </div>
      </div>
    </header>
  );
}
