"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavLinkConfig = {
  href: string;
  label: string;
  renderIcon: (isActive: boolean) => React.ReactNode;
};

const NAV_LINKS: NavLinkConfig[] = [
  {
    href: "/feed",
    label: "Tonight",
    renderIcon: (isActive) => (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill={isActive ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z" />
      </svg>
    ),
  },
  {
    href: "/submit",
    label: "Add an event",
    renderIcon: () => (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
        <path strokeLinecap="round" d="M12 5v14M5 12h14" />
      </svg>
    ),
  },
];

function isLinkActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavBar() {
  const pathname = usePathname();
  // The event detail page has its own fixed ticket bar at the bottom of the screen.
  const shouldShowMobileTabBar = !/^\/feed\/[^/]+$/.test(pathname);

  return (
    <>
      <nav className="hidden lg:flex items-center justify-between px-6 h-[var(--nav-height)] shrink-0 z-50 border-b border-seam bg-ink">
        <Link href="/" className="flex items-baseline gap-3 rounded-sm">
          <span className="type-wordmark text-[1.65rem] text-moon">whim</span>
          <span className="text-sm text-haze">New York</span>
        </Link>

        <div className="flex items-center gap-1">
          {NAV_LINKS.map(({ href, label, renderIcon }) => {
            const isActive = isLinkActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-md text-sm font-semibold transition-colors ${
                  isActive ? "text-sodium" : "text-haze hover:text-moon"
                }`}
              >
                {renderIcon(isActive)}
                {label}
              </Link>
            );
          })}
        </div>
      </nav>

      {shouldShowMobileTabBar && (
        <nav className="lg:hidden fixed bottom-0 inset-x-0 z-50 bg-ink-sunken/95 backdrop-blur-md border-t border-seam flex items-stretch safe-area-pb">
          {NAV_LINKS.map(({ href, label, renderIcon }) => {
            const isActive = isLinkActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={`flex flex-col items-center justify-center gap-1 flex-1 h-[var(--bottom-nav-height)] transition-colors ${
                  isActive ? "text-sodium" : "text-dim hover:text-haze"
                }`}
              >
                {renderIcon(isActive)}
                <span className="text-[11px] font-semibold">{label}</span>
              </Link>
            );
          })}
        </nav>
      )}
    </>
  );
}
