import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";

interface NavbarProps {
  isLoggedIn: boolean;
  user?: { displayName: string };
}

export function Navbar({ isLoggedIn, user }: NavbarProps) {
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
          <button className="flex items-center gap-2 bg-transparent border-none cursor-pointer p-1">
            <Avatar name={user?.displayName ?? "User"} size={32} palette="green" />
            {user?.displayName && (
              <span className="text-sm font-medium text-slate-900">
                {user.displayName.split(" ")[0]}
              </span>
            )}
            <ChevronDown size={14} className="text-slate-400" />
          </button>
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
