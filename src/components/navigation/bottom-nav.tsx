"use client";

import { useCallback, useEffect } from "react";
import Link from "next/link";
import { BarChart3, CalendarDays, Dumbbell, Settings, Trophy } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

const hiddenPrefixes = ["/login", "/auth"];

const navItems = [
  { href: "/", label: "今日", icon: Dumbbell },
  { href: "/plan", label: "计划", icon: CalendarDays },
  { href: "/progress", label: "进展", icon: BarChart3 },
  { href: "/pr", label: "PR", icon: Trophy },
  { href: "/settings", label: "设置", icon: Settings }
];

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  const prefetchTabs = useCallback(() => {
    for (const item of navItems) {
      router.prefetch(item.href);
    }
  }, [router]);

  useEffect(() => {
    prefetchTabs();

    try {
      const supabase = createBrowserSupabaseClient();
      void supabase.auth.getSession();
    } catch {
      // Diagnostics surfaces env problems; navigation prefetch should stay silent.
    }
  }, [prefetchTabs]);

  if (hiddenPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    return null;
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white px-2 pb-[env(safe-area-inset-bottom)] pt-2 shadow-[0_-6px_18px_rgba(23,33,27,0.08)]">
      <div className="mx-auto grid max-w-3xl grid-cols-5 gap-1 text-xs text-muted">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

          return (
            <Link
              className={`pressable relative flex min-h-12 flex-col items-center justify-center gap-1 rounded-md px-1 ${
                active ? "bg-action/10 text-action" : "text-muted hover:bg-field"
              }`}
              href={item.href}
              key={item.href}
              onMouseEnter={() => router.prefetch(item.href)}
              onTouchStart={() => router.prefetch(item.href)}
              prefetch
            >
              {active ? <span className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-action" /> : null}
              <span className={`${active ? "text-action" : "text-muted"}`}>
                <Icon size={18} />
              </span>
              <span className={`text-xs ${active ? "font-bold text-action" : "font-medium text-muted"}`}>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
