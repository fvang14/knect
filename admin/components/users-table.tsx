"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import type { UserSummary, UserRole } from "@/lib/types";
import { suspendUserAction } from "@/app/(dashboard)/users/actions";

const ROLE_OPTIONS: { label: string; value: UserRole | "" }[] = [
  { label: "All", value: "" },
  { label: "Contractors", value: "contractor" },
  { label: "Customers", value: "customer" },
  { label: "Admins", value: "admin" },
];

const ROLE_COLORS: Record<UserRole, string> = {
  contractor: "bg-orange-100 text-orange-800",
  customer: "bg-blue-100 text-blue-800",
  admin: "bg-purple-100 text-purple-800",
};

export function UsersTable({ users }: { users: UserSummary[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const roleFilter = searchParams.get("role") ?? "";
  const statusFilter = searchParams.get("status") ?? "";
  const [isPending, startTransition] = useTransition();

  const filtered = users.filter((u) => {
    if (roleFilter && u.role !== roleFilter) return false;
    if (statusFilter === "active" && u.suspended_at) return false;
    if (statusFilter === "suspended" && !u.suspended_at) return false;
    return true;
  });

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.replace(`${pathname}?${params.toString()}`);
  }

  function handleSuspend(userId: string) {
    startTransition(() => {
      suspendUserAction(userId);
    });
  }

  return (
    <div>
      <div className="flex gap-4 mb-4 flex-wrap">
        <div className="flex gap-2">
          {ROLE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setParam("role", opt.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                roleFilter === opt.value
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {[
            { label: "All", value: "" },
            { label: "Active", value: "active" },
            { label: "Suspended", value: "suspended" },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setParam("status", opt.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                statusFilter === opt.value
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Email</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Role</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Joined</th>
              <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                  No users found
                </td>
              </tr>
            )}
            {filtered.map((user) => (
              <tr key={user.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-700">{user.email}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[user.role]}`}
                  >
                    {user.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {new Date(user.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  {user.suspended_at ? (
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                      Suspended
                    </span>
                  ) : (
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                      Active
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  {!user.suspended_at && user.role !== "admin" && (
                    <button
                      onClick={() => handleSuspend(user.id)}
                      disabled={isPending}
                      className="text-xs text-red-600 hover:underline disabled:opacity-50"
                    >
                      Suspend
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-gray-400">{filtered.length} users</p>
    </div>
  );
}
