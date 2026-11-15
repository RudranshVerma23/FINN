"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Brief", match: (p: string) => p === "/" },
  { href: "/research", label: "Research", match: (p: string) => p.startsWith("/research") || p.startsWith("/r/") },
  { href: "/holdings", label: "Holdings", match: (p: string) => p.startsWith("/holdings") || p.startsWith("/c/") },
];

export function TabBar() {
  const path = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-paper/90 backdrop-blur-md"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex h-[60px] max-w-[480px] items-stretch px-6">
        {TABS.map((t) => {
          const active = t.match(path);
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-full flex-col items-center justify-center gap-1 text-[12px] font-medium tracking-wide ${
                  active ? "text-ink" : "text-muted"
                }`}
              >
                <span className={`h-1 w-1 rounded-full ${active ? "bg-ink" : "bg-transparent"}`} />
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
