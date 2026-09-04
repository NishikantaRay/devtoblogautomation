"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Convert" },
  { href: "/review", label: "Review" },
  { href: "/schedule", label: "Queue" },
];

export function NavLinks() {
  const pathname = usePathname();
  const [drafts, setDrafts] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/schedule", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (!active || !Array.isArray(data.posts)) return;
        setDrafts(
          data.posts.filter((p: { status: string }) => p.status === "draft").length
        );
      } catch {
        // Badge is a convenience — a failed poll just leaves it as-is.
      }
    };
    void Promise.resolve().then(refresh);
    const timer = setInterval(refresh, 60_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [pathname]);

  return (
    <nav className="flex items-center gap-1">
      {LINKS.map((link) => {
        const active =
          link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors ${
              active
                ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            }`}
          >
            {link.label}
            {link.href === "/review" && drafts !== null && drafts > 0 && (
              <span className="rounded-full bg-amber-500 px-1.5 text-[10px] font-semibold text-white">
                {drafts}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
