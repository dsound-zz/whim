"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  {
    href: "/feed",
    label: "Explore",
    icon: (active: boolean) => (
      <svg className={`w-5 h-5 ${active ? "text-white" : "text-zinc-500"}`} fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth={active ? 0 : 1.75} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 13l4.553 2.276A1 1 0 0021 21.382V10.618a1 1 0 00-.553-.894L15 7m0 13V7m0 0L9 7" />
      </svg>
    ),
  },
];


export function NavBar() {
  const pathname = usePathname();
  const isOnFeed = pathname === "/feed" || pathname.startsWith("/feed/");

  return (
    <>
      {/* ── Desktop top nav ─────────────────────────────────────────────────── */}
      <nav
        className={`hidden lg:flex items-center justify-between px-6 h-[var(--nav-height)] shrink-0 z-50 border-b transition-colors ${
          isOnFeed
            ? "bg-zinc-950 border-zinc-900"
            : "bg-zinc-950 border-zinc-900"
        }`}
      >
        {/* Wordmark */}
        <Link href="/feed" className="flex items-center gap-2 group">
          <span className="text-xl font-black text-white tracking-tight group-hover:opacity-80 transition-opacity">
            whim
          </span>
          <span className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mt-0.5">
            New York
          </span>
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-1">
          {NAV_LINKS.map(({ href, label, icon }) => {
            const isActive = pathname === href || (href !== "/" && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                  isActive
                    ? "bg-white/10 text-white"
                    : "text-zinc-500 hover:text-white hover:bg-white/5"
                }`}
              >
                {icon(isActive)}
                {label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* ── Mobile bottom tab bar ────────────────────────────────────────────── */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-50 bg-zinc-950/95 backdrop-blur-md border-t border-zinc-900 h-[var(--bottom-nav-height)] flex items-center justify-around px-4 safe-area-pb">
        {NAV_LINKS.map(({ href, label, icon }) => {
          const isActive = pathname === href || (href !== "/" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-1 flex-1 py-2 transition-colors ${
                isActive ? "text-white" : "text-zinc-600 hover:text-zinc-400"
              }`}
            >
              {icon(isActive)}
              <span className="text-[10px] font-semibold tracking-wide uppercase">{label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
