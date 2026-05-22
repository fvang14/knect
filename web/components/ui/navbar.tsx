"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useMeUser } from "@/components/providers/providers";
import { avatarUrl } from "@/lib/me";

export function Navbar() {
  const { meUser } = useMeUser();
  const [menuOpen, setMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const isLoggedIn = !!meUser;

  return (
    <header className="fixed top-0 left-0 right-0 z-40 h-[60px] bg-white border-b border-warm-border flex items-center px-10 gap-6">
      <Link href="/" className="font-bold text-blue-600 text-xl tracking-tight">
        Knect
      </Link>

      {isLoggedIn ? (
        <>
          <nav className="flex gap-5 text-sm ml-2">
            <Link href="/" className="text-slate-900 font-medium hover:text-slate-700 transition-colors">
              Find a pro
            </Link>
            <Link href="/jobs" className="text-slate-500 hover:text-slate-900 transition-colors">
              My jobs
            </Link>
          </nav>
          <div className="flex-1" />
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-2 bg-transparent border-none cursor-pointer p-1 outline-none"
            >
              <Avatar
                name={meUser.display_name}
                size={32}
                palette="green"
                src={meUser.has_avatar ? avatarUrl(meUser.id, meUser.avatar_updated_at) : null}
              />
              <span className="text-sm font-medium text-slate-900">
                {meUser.display_name.split(" ")[0]}
              </span>
              <ChevronDown size={14} className="text-slate-400" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white border border-warm-border rounded-lg shadow-lg py-1 z-50">
                <Link
                  href="/settings"
                  className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                  onClick={() => setMenuOpen(false)}
                >
                  Settings
                </Link>
                <a
                  href="/api/logout"
                  className="block px-4 py-2 text-sm text-red-600 hover:bg-slate-50 transition-colors"
                  onClick={() => setMenuOpen(false)}
                >
                  Sign out
                </a>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <nav className="flex gap-6 text-sm">
            <Link href="/" className="text-slate-900 font-medium hover:text-slate-700 transition-colors">
              Find a pro
            </Link>
            <a href="#" className="text-slate-500 hover:text-slate-900 transition-colors">
              For pros
            </a>
            <a href="#" className="text-slate-500 hover:text-slate-900 transition-colors">
              How it works
            </a>
          </nav>
          <div className="flex-1" />
          <Link
            href="/login"
            className="px-4 py-[7px] rounded-lg border border-warm-border text-slate-900 text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="px-4 py-[7px] rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Get started
          </Link>
        </>
      )}
    </header>
  );
}
