import Link from "next/link";

export function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-40 h-14 bg-white border-b flex items-center px-4 gap-4">
      <span className="font-bold text-blue-600 text-lg tracking-tight">Knect</span>
      <div className="flex-1" />
      <Link
        href="/jobs"
        className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
      >
        My Jobs
      </Link>
      <a
        href="/api/logout"
        className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
      >
        Sign out
      </a>
    </nav>
  );
}
