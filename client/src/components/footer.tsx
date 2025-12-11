import React from "react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { filterNavigationForUser } from "@/components/sidebar";

export default function Footer() {
  const { user } = useAuth();
  const links = user ? filterNavigationForUser(user) : [];

  return (
    <footer className="w-full border-t bg-background text-foreground/80">
      <div className="mx-auto max-w-7xl px-4 py-3 text-xs sm:text-sm flex items-center justify-between gap-4">
        <span className="opacity-80">© {new Date().getFullYear()} Fantasy Tracker Assistant</span>
        {links.length > 0 && (
          <nav className="flex items-center gap-3 flex-wrap">
            {links.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="hover:underline"
                aria-label={item.name}
              >
                {item.name}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </footer>
  );
}
