import React from "react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { filterNavigationForUser } from "@/components/sidebar";

export default function Footer() {
  const { user } = useAuth();
  // When logged in, show only Standard User links; when logged out, show none
  const links = user ? filterNavigationForUser({ role: 0 }) : [];

  return (
    <footer className="w-full border-t bg-background text-foreground/80">
      <div className="mx-auto max-w-7xl px-4 py-3 text-xs sm:text-sm flex items-center justify-between gap-4">
        <div className="opacity-80">
          <div>© {new Date().getFullYear()} Fantasy Toolbox AI</div>
          <div>Your playbook just got smarter</div>
        </div>
        <nav className="flex items-center gap-3 flex-wrap">
          {/* Always show About and Contact in footer */}
          <Link href="/about" className="hover:underline" aria-label="About">
            About
          </Link>
          <Link href="/contact" className="hover:underline" aria-label="Contact">
            Contact
          </Link>
          {/* Conditionally show user navigation links when logged in */}
          {links.length > 0 && (
            <>
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
            </>
          )}
        </nav>
      </div>
    </footer>
  );
}
