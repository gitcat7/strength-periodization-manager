"use client";

import Link from "next/link";
import { BarChart3, CalendarDays, Dumbbell, Settings, Trophy } from "lucide-react";
import { usePathname } from "next/navigation";

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

  if (hiddenPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    return null;
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] pt-2 shadow-[0_-8px_24px_rgba(23,33,27,0.08)] backdrop-blur">
      <div className="mx-auto grid max-w-3xl grid-cols-5 gap-1 text-xs text-muted">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

          return (
            <Link
              className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg px-1 transition ${
                active ? "bg-action/10 text-action" : "hover:bg-field"
              }`}
              href={item.href}
              key={item.href}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
